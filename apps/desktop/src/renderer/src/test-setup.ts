import "@testing-library/jest-dom/vitest";

import type { DesktopBridge } from "@vatrushka/shared";

const desktop: DesktopBridge = {
  getAppVersion: async () => "0.1.0-test",
  getUpdateState: async () => ({
    status: "unsupported",
    currentVersion: "0.1.0-test",
  }),
  checkForUpdates: async () => undefined,
  installUpdate: async () => undefined,
  onUpdateState: () => () => undefined,
  completeAuthSession: async () => ({ ok: false, status: 401, error: null }),
  refreshAuthSession: async () => null,
  logoutAuthSession: async () => undefined,
  clearAuthSession: async () => undefined,
  listDesktopSources: async () => [],
  selectDesktopSource: async () => undefined,
  clearSelectedDesktopSource: async () => undefined,
  copyToClipboard: async () => undefined,
  openExternal: async () => undefined,
  setBadgeCount: async () => undefined,
  showMessageNotification: async () => undefined,
  onMessageNotificationClick: () => () => undefined,
  onDeepLink: () => () => undefined,
  getPlatform: async () => "win32",
  getLocalSettings: async () => ({
    volume: 1,
    desktopNotificationsEnabled: true,
    messageSoundsEnabled: true,
  }),
  updateLocalSettings: async () => undefined,
};

Object.defineProperty(window, "desktop", {
  configurable: true,
  value: desktop,
});

Object.defineProperty(navigator, "mediaDevices", {
  configurable: true,
  value: {
    enumerateDevices: async () => [],
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  },
});
