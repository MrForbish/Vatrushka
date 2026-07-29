import { fileURLToPath } from "node:url";
import { dirname, join, normalize, resolve } from "node:path";

import {
  app,
  BrowserWindow,
  desktopCapturer,
  Menu,
  nativeImage,
  Notification,
  powerMonitor,
  session,
  Tray,
  type IpcMainInvokeEvent,
} from "electron";
import log from "electron-log/main";

import {
  APP_NAME,
  APP_PROTOCOL,
  type DesktopMessageNotification,
} from "@vatrushka/shared";

import { findDeepLink } from "./deep-link.js";
import { configureLogging, IPC_CHANNELS, registerIpc } from "./ipc.js";
import { DesktopStorage } from "./storage.js";
import { DesktopUpdater } from "./updater.js";

const desktopAppName = process.env.VATRUSHKA_APP_NAME;
const desktopProtocol = process.env.VATRUSHKA_APP_PROTOCOL || APP_PROTOCOL;

if (desktopAppName) app.setName(desktopAppName);

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const productionRendererDirectory = normalize(
  join(currentDirectory, "../renderer"),
);
const developmentUrl = process.env.ELECTRON_RENDERER_URL;
const storage = new DesktopStorage();

let mainWindow: BrowserWindow | null = null;
let pendingDeepLink = findDeepLink(process.argv, desktopProtocol);
let selectedSource: { sourceId: string; includeAudio: boolean } | null = null;
let removeIpcHandlers: (() => void) | null = null;
let desktopUpdater: DesktopUpdater | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let compactAuthWindow = false;
const activeNotifications = new Set<Notification>();

const AUTH_WINDOW_SIZE = { width: 520, height: 680 };
const APP_WINDOW_MIN_SIZE = { width: 1100, height: 680 };

async function setMainWindowAuthMode(authenticated: boolean): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const windowToReplace = mainWindow;
  mainWindow = null;
  windowToReplace.destroy();
  await createWindow(authenticated);
}

function checkForUpdatesIfDue(): void {
  void desktopUpdater?.checkIfDue();
}

function isTrustedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (developmentUrl) return url.origin === new URL(developmentUrl).origin;
    if (url.protocol !== "file:") return false;
    const path = normalize(fileURLToPath(url));
    return (
      path === join(productionRendererDirectory, "index.html") ||
      path.startsWith(`${productionRendererDirectory}\\`)
    );
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
    return url.protocol === "file:";
  } catch {
    return false;
  }
}

function sendDeepLink(inviteToken: string): void {
  if (compactAuthWindow) {
    pendingDeepLink = inviteToken;
    return;
  }
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    mainWindow.webContents.isLoading()
  ) {
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
  const notification = new Notification({
    title: message.title,
    body: message.body,
    silent: true,
  });
  const release = (): void => {
    activeNotifications.delete(notification);
  };
  activeNotifications.add(notification);
  notification.once("click", () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.show();
    mainWindow?.focus();
    mainWindow?.webContents.send(IPC_CHANNELS.notificationClick, {
      ...(message.serverId && message.channelId
        ? { serverId: message.serverId, channelId: message.channelId }
        : {}),
      ...(message.conversationId
        ? { conversationId: message.conversationId }
        : {}),
      ...(message.messageId ? { messageId: message.messageId } : {}),
    });
    release();
  });
  notification.once("close", release);
  notification.once("failed", release);
  notification.show();
}

function registerProtocol(): void {
  if (process.defaultApp && process.argv[1]) {
    app.setAsDefaultProtocolClient(desktopProtocol, process.execPath, [
      resolve(process.argv[1]),
    ]);
  } else {
    app.setAsDefaultProtocolClient(desktopProtocol);
  }
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    void createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray(): void {
  if (tray) return;
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, "icon.png")
    : join(app.getAppPath(), "build", "icon.png");
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(
    icon.isEmpty()
      ? nativeImage.createEmpty()
      : icon.resize({ width: 20, height: 20 }),
  );
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Открыть Ватрушку", click: showMainWindow },
      { type: "separator" },
      {
        label: "Выйти",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("click", showMainWindow);
}

function configureSession(): void {
  const currentSession = session.defaultSession;
  const productionCsp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.twcstorage.ru",
    "media-src 'self' blob:",
    "connect-src 'self' https: wss: http://localhost:* ws://localhost:*",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
  currentSession.webRequest.onHeadersReceived((details, callback) => {
    if (!isTrustedUrl(details.url)) {
      callback(
        details.responseHeaders
          ? { responseHeaders: details.responseHeaders }
          : {},
      );
      return;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          developmentUrl
            ? productionCsp.replace(
                "script-src 'self'",
                "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              )
            : productionCsp,
        ],
      },
    });
  });

  currentSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin) => {
      const trusted = Boolean(
        mainWindow &&
        webContents === mainWindow.webContents &&
        isTrustedOrigin(requestingOrigin),
      );
      // Camera capture is intentionally available only to the trusted main
      // renderer. The operating system remains the final authority for the
      // user-facing camera permission.
      return trusted && permission === "media";
    },
  );
  currentSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const trusted = Boolean(
        mainWindow &&
        webContents === mainWindow.webContents &&
        isTrustedUrl(details.requestingUrl),
      );
      callback(trusted && permission === "media");
    },
  );

  currentSession.setDisplayMediaRequestHandler((request, callback) => {
    const selection = selectedSource;
    selectedSource = null;
    if (
      !selection ||
      !request.userGesture ||
      !request.frame ||
      !isTrustedUrl(request.frame.url)
    ) {
      callback({});
      return;
    }
    void desktopCapturer
      .getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 0, height: 0 },
      })
      .then((sources) => {
        const source = sources.find(
          (candidate) => candidate.id === selection.sourceId,
        );
        if (!source) return callback({});
        callback({
          video: source,
          ...(selection.includeAudio && process.platform === "win32"
            ? { audio: "loopback" as const }
            : {}),
        });
      })
      .catch((error: unknown) => {
        log.error("Display media request failed", { error });
        callback({});
      });
  });
}

async function createWindow(authenticated?: boolean): Promise<void> {
  const settings = await storage.getSettings();
  const hasAuthenticatedSession = authenticated ?? (await storage.getAuthSession()) !== null;
  compactAuthWindow = !hasAuthenticatedSession;
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: compactAuthWindow ? AUTH_WINDOW_SIZE.width : settings.windowBounds?.width ?? 1280,
    height: compactAuthWindow ? AUTH_WINDOW_SIZE.height : settings.windowBounds?.height ?? 800,
    ...(compactAuthWindow || settings.windowBounds?.x === undefined
      ? {}
      : { x: settings.windowBounds.x }),
    ...(compactAuthWindow || settings.windowBounds?.y === undefined
      ? {}
      : { y: settings.windowBounds.y }),
    minWidth: compactAuthWindow ? AUTH_WINDOW_SIZE.width : APP_WINDOW_MIN_SIZE.width,
    minHeight: compactAuthWindow ? AUTH_WINDOW_SIZE.height : APP_WINDOW_MIN_SIZE.height,
    resizable: !compactAuthWindow,
    frame: !compactAuthWindow,
    transparent: compactAuthWindow,
    show: false,
    backgroundColor: compactAuthWindow ? "#00000000" : "#090d18",
    autoHideMenuBar: true,
    ...(!compactAuthWindow && process.platform === "win32"
      ? {
          titleBarStyle: "hidden" as const,
          titleBarOverlay: {
            color: "#090d18",
            symbolColor: "#dbe7f5",
            height: 38,
          },
        }
      : {}),
    webPreferences: {
      preload: join(currentDirectory, "../preload/index.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
    },
  });
  const window = mainWindow;
  window.setMenu(null);
  // A compact auth window deliberately does not inherit the saved position of
  // the full application window. It is a standalone modal-like entry point.
  if (compactAuthWindow) window.center();

  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  if (developmentUrl) {
    window.webContents.on(
      "console-message",
      (_event, level, message, line, sourceId) => {
        console.error(
          `[renderer:${level}] ${sourceId}:${line} ${message}`,
        );
      },
    );
    window.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedUrl) => {
        console.error(
          `[renderer:load] ${errorCode} ${errorDescription}: ${validatedUrl}`,
        );
      },
    );
    window.webContents.on("render-process-gone", (_event, details) => {
      console.error(
        `[renderer:gone] ${details.reason}: exit ${details.exitCode}`,
      );
    });
  }
  window.once("ready-to-show", () => window.show());
  window.webContents.on("did-finish-load", () => {
    if (compactAuthWindow || !pendingDeepLink || !mainWindow || mainWindow.isDestroyed()) return;
    const inviteToken = pendingDeepLink;
    pendingDeepLink = null;
    window.webContents.send(IPC_CHANNELS.deepLink, inviteToken);
  });

  let saveBoundsTimer: NodeJS.Timeout | undefined;
  const scheduleBoundsSave = (): void => {
    if (saveBoundsTimer) clearTimeout(saveBoundsTimer);
    saveBoundsTimer = setTimeout(() => {
      if (
        window.isDestroyed() ||
        compactAuthWindow ||
        window.isMaximized() ||
        window.isFullScreen()
      )
        return;
      const bounds = window.getBounds();
      void storage
        .getSettings()
        .then((current) =>
          storage.updateSettings({ ...current, windowBounds: bounds }),
        );
    }, 400);
  };
  window.on("resize", scheduleBoundsSave);
  window.on("move", scheduleBoundsSave);
  window.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    window.hide();
  });
  window.on("closed", () => {
    if (saveBoundsTimer) clearTimeout(saveBoundsTimer);
    if (mainWindow === window) mainWindow = null;
  });

  if (developmentUrl) await window.loadURL(developmentUrl);
  else
    await window.loadFile(join(productionRendererDirectory, "index.html"));
}

const hasLock = app.requestSingleInstanceLock();

if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const inviteToken = findDeepLink(argv, desktopProtocol);
    if (inviteToken) sendDeepLink(inviteToken);
    else {
      if (mainWindow?.isMinimized()) mainWindow.restore();
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
  app.on("open-url", (event, url) => {
    event.preventDefault();
    const inviteToken = findDeepLink([url], desktopProtocol);
    if (inviteToken) sendDeepLink(inviteToken);
  });

  void app.whenReady().then(async () => {
    app.setName(APP_NAME);
    app.setAppUserModelId("ru.vatrushka.desktop");
    registerProtocol();
    await configureLogging();
    log.info("Application started", {
      version: app.getVersion(),
      platform: process.platform,
    });
    configureSession();
    createTray();
    desktopUpdater = new DesktopUpdater((state) => {
      if (
        !mainWindow ||
        mainWindow.isDestroyed() ||
        mainWindow.webContents.isLoading()
      )
        return;
      mainWindow.webContents.send(IPC_CHANNELS.updateState, state);
    });
    removeIpcHandlers = registerIpc({
      isTrustedSender,
      onAuthWindowModeChange: setMainWindowAuthMode,
      storage,
      setSelectedSource(selection) {
        selectedSource = selection;
      },
      showMessageNotification,
      setBadgeCount(count) {
        app.setBadgeCount(count);
        tray?.setToolTip(
          count > 0 ? `${APP_NAME} · непрочитанных: ${count}` : APP_NAME,
        );
      },
      updater: desktopUpdater,
    });
    await createWindow();
    desktopUpdater.start();
    void desktopUpdater.checkIfDue();
    powerMonitor.on("resume", checkForUpdatesIfDue);
  });
}


app.on("activate", showMainWindow);
// The auth window is intentionally replaced with the main application window
// after a successful login (and vice versa on logout). Keeping this listener
// prevents Electron from terminating the process in the brief gap between them.
app.on("window-all-closed", () => undefined);
app.on("browser-window-focus", checkForUpdatesIfDue);
app.on("before-quit", () => {
  isQuitting = true;
  selectedSource = null;
  for (const notification of activeNotifications) notification.close();
  activeNotifications.clear();
  removeIpcHandlers?.();
  removeIpcHandlers = null;
  desktopUpdater?.dispose();
  desktopUpdater = null;
  powerMonitor.removeListener("resume", checkForUpdatesIfDue);
  tray?.destroy();
  tray = null;
});
