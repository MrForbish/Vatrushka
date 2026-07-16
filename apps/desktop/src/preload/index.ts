import { contextBridge, ipcRenderer } from 'electron';

import type { DesktopBridge, LocalSettings } from '@vatrushka/shared';

const channels = {
  appVersion: 'app:get-version',
  refreshGet: 'session:get-refresh',
  refreshStore: 'session:store-refresh',
  refreshClear: 'session:clear-refresh',
  sourcesList: 'desktop:list-sources',
  sourceSelect: 'desktop:select-source',
  sourceClear: 'desktop:clear-source',
  clipboardCopy: 'clipboard:copy',
  platform: 'app:get-platform',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  deepLink: 'app:deep-link',
  notificationShow: 'notification:show-message',
  notificationClick: 'notification:message-click',
} as const;

const deepLinkCallbacks = new Set<(roomCode: string) => void>();
const notificationClickCallbacks = new Set<(target: { serverId: string; channelId: string }) => void>();
let pendingDeepLink: string | null = null;

ipcRenderer.on(channels.deepLink, (_event, roomCode: unknown) => {
  if (typeof roomCode !== 'string') return;
  if (deepLinkCallbacks.size === 0) {
    pendingDeepLink = roomCode;
    return;
  }
  for (const callback of deepLinkCallbacks) callback(roomCode);
});

ipcRenderer.on(channels.notificationClick, (_event, target: unknown) => {
  if (!target || typeof target !== 'object' || !('serverId' in target) || !('channelId' in target) || typeof target.serverId !== 'string' || typeof target.channelId !== 'string') return;
  for (const callback of notificationClickCallbacks) callback({ serverId: target.serverId, channelId: target.channelId });
});

const bridge: DesktopBridge = {
  getAppVersion: () => ipcRenderer.invoke(channels.appVersion) as Promise<string>,
  getStoredRefreshToken: () => ipcRenderer.invoke(channels.refreshGet) as Promise<string | null>,
  storeRefreshToken: (token) => ipcRenderer.invoke(channels.refreshStore, token) as Promise<void>,
  clearRefreshToken: () => ipcRenderer.invoke(channels.refreshClear) as Promise<void>,
  listDesktopSources: () => ipcRenderer.invoke(channels.sourcesList),
  selectDesktopSource: (sourceId, includeAudio) =>
    ipcRenderer.invoke(channels.sourceSelect, { sourceId, includeAudio }) as Promise<void>,
  clearSelectedDesktopSource: () => ipcRenderer.invoke(channels.sourceClear) as Promise<void>,
  copyToClipboard: (text) => ipcRenderer.invoke(channels.clipboardCopy, text) as Promise<void>,
  showMessageNotification: (notification) => ipcRenderer.invoke(channels.notificationShow, notification) as Promise<void>,
  onMessageNotificationClick: (callback) => {
    notificationClickCallbacks.add(callback);
    return () => notificationClickCallbacks.delete(callback);
  },
  onDeepLink: (callback) => {
    deepLinkCallbacks.add(callback);
    if (pendingDeepLink) {
      const code = pendingDeepLink;
      pendingDeepLink = null;
      queueMicrotask(() => {
        if (deepLinkCallbacks.has(callback)) callback(code);
      });
    }
    return () => deepLinkCallbacks.delete(callback);
  },
  getPlatform: () => ipcRenderer.invoke(channels.platform) as Promise<string>,
  getLocalSettings: () => ipcRenderer.invoke(channels.settingsGet) as Promise<LocalSettings>,
  updateLocalSettings: (settings) => ipcRenderer.invoke(channels.settingsUpdate, settings) as Promise<void>,
};

contextBridge.exposeInMainWorld('desktop', bridge);
