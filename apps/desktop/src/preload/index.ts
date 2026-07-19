import { contextBridge, ipcRenderer } from "electron";

import type {
  DesktopBridge,
  DesktopMessageNotificationTarget,
  DesktopUpdateState,
  LocalSettings,
} from "@vatrushka/shared";

const channels = {
  appVersion: "app:get-version",
  windowFullscreenGet: "window:get-fullscreen",
  windowFullscreenToggle: "window:toggle-fullscreen",
  windowFullscreenState: "window:fullscreen-state",
  updateStateGet: "update:get-state",
  updateCheck: "update:check",
  updateInstall: "update:install",
  updateState: "update:state",
  authComplete: "session:complete-auth",
  authRefresh: "session:refresh-auth",
  authLogout: "session:logout-auth",
  authClear: "session:clear-auth",
  sourcesList: "desktop:list-sources",
  sourceSelect: "desktop:select-source",
  sourceClear: "desktop:clear-source",
  mediaDiagnostic: "media:diagnostic",
  clipboardCopy: "clipboard:copy",
  externalOpen: "external:open-allowlisted",
  badgeCountSet: "app:set-badge-count",
  platform: "app:get-platform",
  settingsGet: "settings:get",
  settingsUpdate: "settings:update",
  deepLink: "app:deep-link",
  notificationShow: "notification:show-message",
  notificationClick: "notification:message-click",
} as const;

const deepLinkCallbacks = new Set<(inviteToken: string) => void>();
const notificationClickCallbacks = new Set<
  (target: DesktopMessageNotificationTarget) => void
>();
const updateStateCallbacks = new Set<(state: DesktopUpdateState) => void>();
const fullscreenCallbacks = new Set<(fullscreen: boolean) => void>();
let pendingDeepLink: string | null = null;

ipcRenderer.on(channels.deepLink, (_event, inviteToken: unknown) => {
  if (typeof inviteToken !== "string") return;
  if (deepLinkCallbacks.size === 0) {
    pendingDeepLink = inviteToken;
    return;
  }
  for (const callback of deepLinkCallbacks) callback(inviteToken);
});

ipcRenderer.on(channels.notificationClick, (_event, target: unknown) => {
  if (!target || typeof target !== "object") return;
  const value = target as Record<string, unknown>;
  const serverTarget =
    typeof value.serverId === "string" && typeof value.channelId === "string";
  const conversationTarget = typeof value.conversationId === "string";
  if (!serverTarget && !conversationTarget) return;
  const parsed: DesktopMessageNotificationTarget = {
    ...(serverTarget
      ? {
          serverId: value.serverId as string,
          channelId: value.channelId as string,
        }
      : {}),
    ...(conversationTarget
      ? { conversationId: value.conversationId as string }
      : {}),
    ...(typeof value.messageId === "string"
      ? { messageId: value.messageId }
      : {}),
  };
  for (const callback of notificationClickCallbacks) callback(parsed);
});

ipcRenderer.on(channels.updateState, (_event, state: unknown) => {
  if (!isUpdateState(state)) return;
  for (const callback of updateStateCallbacks) callback(state);
});

ipcRenderer.on(channels.windowFullscreenState, (_event, state: unknown) => {
  if (typeof state !== "boolean") return;
  for (const callback of fullscreenCallbacks) callback(state);
});

function isUpdateState(value: unknown): value is DesktopUpdateState {
  if (
    !value ||
    typeof value !== "object" ||
    !("status" in value) ||
    !("currentVersion" in value)
  )
    return false;
  const statuses = new Set([
    "idle",
    "checking",
    "available",
    "downloading",
    "ready",
    "up-to-date",
    "unsupported",
    "error",
  ]);
  return (
    typeof value.status === "string" &&
    statuses.has(value.status) &&
    typeof value.currentVersion === "string"
  );
}

const bridge: DesktopBridge = {
  getAppVersion: () =>
    ipcRenderer.invoke(channels.appVersion) as Promise<string>,
  getFullscreen: () =>
    ipcRenderer.invoke(channels.windowFullscreenGet) as Promise<boolean>,
  toggleFullscreen: () =>
    ipcRenderer.invoke(channels.windowFullscreenToggle) as Promise<boolean>,
  onFullscreenChange: (callback) => {
    fullscreenCallbacks.add(callback);
    return () => fullscreenCallbacks.delete(callback);
  },
  getUpdateState: () =>
    ipcRenderer.invoke(channels.updateStateGet) as Promise<DesktopUpdateState>,
  checkForUpdates: () =>
    ipcRenderer.invoke(channels.updateCheck) as Promise<void>,
  installUpdate: () =>
    ipcRenderer.invoke(channels.updateInstall) as Promise<void>,
  onUpdateState: (callback) => {
    updateStateCallbacks.add(callback);
    return () => updateStateCallbacks.delete(callback);
  },
  completeAuthSession: (path, body, apiBaseUrl, rememberSession = true) =>
    ipcRenderer.invoke(channels.authComplete, path, body, apiBaseUrl, rememberSession),
  refreshAuthSession: () => ipcRenderer.invoke(channels.authRefresh),
  logoutAuthSession: () =>
    ipcRenderer.invoke(channels.authLogout) as Promise<void>,
  clearAuthSession: () =>
    ipcRenderer.invoke(channels.authClear) as Promise<void>,
  listDesktopSources: () => ipcRenderer.invoke(channels.sourcesList),
  selectDesktopSource: (sourceId, includeAudio) =>
    ipcRenderer.invoke(channels.sourceSelect, {
      sourceId,
      includeAudio,
    }) as Promise<void>,
  clearSelectedDesktopSource: () =>
    ipcRenderer.invoke(channels.sourceClear) as Promise<void>,
  logMediaDiagnostic: (event) =>
    ipcRenderer.invoke(channels.mediaDiagnostic, event) as Promise<void>,
  copyToClipboard: (text) =>
    ipcRenderer.invoke(channels.clipboardCopy, text) as Promise<void>,
  openExternal: (url) =>
    ipcRenderer.invoke(channels.externalOpen, url) as Promise<void>,
  setBadgeCount: (count) =>
    ipcRenderer.invoke(channels.badgeCountSet, count) as Promise<void>,
  showMessageNotification: (notification) =>
    ipcRenderer.invoke(
      channels.notificationShow,
      notification,
    ) as Promise<void>,
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
  getLocalSettings: () =>
    ipcRenderer.invoke(channels.settingsGet) as Promise<LocalSettings>,
  updateLocalSettings: (settings) =>
    ipcRenderer.invoke(channels.settingsUpdate, settings) as Promise<void>,
};

contextBridge.exposeInMainWorld("desktop", bridge);
