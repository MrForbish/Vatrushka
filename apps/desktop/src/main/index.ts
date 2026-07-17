import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, resolve } from 'node:path';

import {
  app,
  BrowserWindow,
  desktopCapturer,
  Notification,
  session,
  type IpcMainInvokeEvent,
} from 'electron';
import log from 'electron-log/main';

import { APP_NAME, APP_PROTOCOL, type DesktopMessageNotification } from '@vatrushka/shared';

import { findDeepLink } from './deep-link.js';
import { configureLogging, IPC_CHANNELS, registerIpc } from './ipc.js';
import { DesktopStorage } from './storage.js';
import { DesktopUpdater } from './updater.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const productionRendererDirectory = normalize(join(currentDirectory, '../renderer'));
const developmentUrl = process.env.ELECTRON_RENDERER_URL;
const storage = new DesktopStorage();

let mainWindow: BrowserWindow | null = null;
let pendingDeepLink = findDeepLink(process.argv, APP_PROTOCOL);
let selectedSource: { sourceId: string; includeAudio: boolean } | null = null;
let removeIpcHandlers: (() => void) | null = null;
let desktopUpdater: DesktopUpdater | null = null;
const activeNotifications = new Set<Notification>();

function isTrustedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (developmentUrl) return url.origin === new URL(developmentUrl).origin;
    if (url.protocol !== 'file:') return false;
    const path = normalize(fileURLToPath(url));
    return path === join(productionRendererDirectory, 'index.html') || path.startsWith(`${productionRendererDirectory}\\`);
  } catch {
    return false;
  }
}

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  return Boolean(
    mainWindow &&
      !mainWindow.isDestroyed() &&
      event.sender === mainWindow.webContents &&
      event.senderFrame === mainWindow.webContents.mainFrame &&
      isTrustedUrl(event.senderFrame.url),
  );
}

function isTrustedOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    if (developmentUrl) return url.origin === new URL(developmentUrl).origin;
    return url.protocol === 'file:';
  } catch {
    return false;
  }
}

function sendDeepLink(inviteToken: string): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isLoading()) {
    pendingDeepLink = inviteToken;
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send(IPC_CHANNELS.deepLink, inviteToken);
  pendingDeepLink = null;
}

function showMessageNotification(message: DesktopMessageNotification): void {
  if (!Notification.isSupported()) return;
  const notification = new Notification({ title: message.title, body: message.body, silent: message.silent ?? false });
  const release = (): void => { activeNotifications.delete(notification); };
  activeNotifications.add(notification);
  notification.once('click', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.show();
    mainWindow?.focus();
    mainWindow?.webContents.send(IPC_CHANNELS.notificationClick, { serverId: message.serverId, channelId: message.channelId });
    release();
  });
  notification.once('close', release);
  notification.once('failed', release);
  notification.show();
}

function registerProtocol(): void {
  if (process.defaultApp && process.argv[1]) {
    app.setAsDefaultProtocolClient(APP_PROTOCOL, process.execPath, [resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(APP_PROTOCOL);
  }
}

function configureSession(): void {
  const currentSession = session.defaultSession;
  const productionCsp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src 'self' https: wss: http://localhost:* ws://localhost:*",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
  currentSession.webRequest.onHeadersReceived((details, callback) => {
    if (!isTrustedUrl(details.url)) {
      callback(details.responseHeaders ? { responseHeaders: details.responseHeaders } : {});
      return;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [developmentUrl ? productionCsp.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'") : productionCsp],
      },
    });
  });

  currentSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    const trusted = Boolean(mainWindow && webContents === mainWindow.webContents && isTrustedOrigin(requestingOrigin));
    return trusted && permission === 'media' && details.mediaType !== 'video';
  });
  currentSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const trusted = Boolean(mainWindow && webContents === mainWindow.webContents && isTrustedUrl(details.requestingUrl));
    const audioOnly = permission === 'media' && 'mediaTypes' in details && details.mediaTypes?.every((type: string) => type === 'audio');
    callback(trusted && audioOnly);
  });

  currentSession.setDisplayMediaRequestHandler((request, callback) => {
    const selection = selectedSource;
    selectedSource = null;
    if (!selection || !request.userGesture || !request.frame || !isTrustedUrl(request.frame.url)) {
      callback({});
      return;
    }
    void desktopCapturer
      .getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } })
      .then((sources) => {
        const source = sources.find((candidate) => candidate.id === selection.sourceId);
        if (!source) return callback({});
        callback({
          video: source,
          ...(selection.includeAudio && process.platform === 'win32' ? { audio: 'loopback' as const } : {}),
        });
      })
      .catch((error: unknown) => {
        log.error('Display media request failed', { error });
        callback({});
      });
  });
}

async function createWindow(): Promise<void> {
  const settings = await storage.getSettings();
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: settings.windowBounds?.width ?? 1280,
    height: settings.windowBounds?.height ?? 800,
    ...(settings.windowBounds?.x === undefined ? {} : { x: settings.windowBounds.x }),
    ...(settings.windowBounds?.y === undefined ? {} : { y: settings.windowBounds.y }),
    minWidth: 1100,
    minHeight: 680,
    show: false,
    backgroundColor: '#090d18',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(currentDirectory, '../preload/index.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
    },
  });
  mainWindow.setMenu(null);

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.on('did-finish-load', () => {
    if (!pendingDeepLink || !mainWindow || mainWindow.isDestroyed()) return;
    const inviteToken = pendingDeepLink;
    pendingDeepLink = null;
    mainWindow.webContents.send(IPC_CHANNELS.deepLink, inviteToken);
  });

  let saveBoundsTimer: NodeJS.Timeout | undefined;
  const scheduleBoundsSave = (): void => {
    if (saveBoundsTimer) clearTimeout(saveBoundsTimer);
    saveBoundsTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMaximized()) return;
      const bounds = mainWindow.getBounds();
      void storage.getSettings().then((current) => storage.updateSettings({ ...current, windowBounds: bounds }));
    }, 400);
  };
  mainWindow.on('resize', scheduleBoundsSave);
  mainWindow.on('move', scheduleBoundsSave);
  mainWindow.on('closed', () => {
    if (saveBoundsTimer) clearTimeout(saveBoundsTimer);
    mainWindow = null;
  });

  if (developmentUrl) await mainWindow.loadURL(developmentUrl);
  else await mainWindow.loadFile(join(productionRendererDirectory, 'index.html'));
}

const hasLock = app.requestSingleInstanceLock();

if (!hasLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const inviteToken = findDeepLink(argv, APP_PROTOCOL);
    if (inviteToken) sendDeepLink(inviteToken);
    else {
      if (mainWindow?.isMinimized()) mainWindow.restore();
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
  app.on('open-url', (event, url) => {
    event.preventDefault();
    const inviteToken = findDeepLink([url], APP_PROTOCOL);
    if (inviteToken) sendDeepLink(inviteToken);
  });

  void app.whenReady().then(async () => {
    app.setName(APP_NAME);
    app.setAppUserModelId('ru.vatrushka.desktop');
    registerProtocol();
    await configureLogging();
    log.info('Application started', { version: app.getVersion(), platform: process.platform });
    configureSession();
    desktopUpdater = new DesktopUpdater((state) => {
      if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isLoading()) return;
      mainWindow.webContents.send(IPC_CHANNELS.updateState, state);
    });
    removeIpcHandlers = registerIpc({
      isTrustedSender,
      storage,
      setSelectedSource(selection) {
        selectedSource = selection;
      },
      showMessageNotification,
      updater: desktopUpdater,
    });
    await createWindow();
    desktopUpdater.start();
  });
}

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  selectedSource = null;
  for (const notification of activeNotifications) notification.close();
  activeNotifications.clear();
  removeIpcHandlers?.();
  removeIpcHandlers = null;
  desktopUpdater?.dispose();
  desktopUpdater = null;
});
