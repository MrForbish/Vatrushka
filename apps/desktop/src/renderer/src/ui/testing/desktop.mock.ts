import type { DesktopBridge } from '@vatrushka/shared';

export const desktopMock: DesktopBridge = {
  getAppVersion: async () => '0.2.0-storybook',
  getUpdateState: async () => ({ status: 'unsupported', currentVersion: '0.2.0-storybook' }),
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
  showMessageNotification: async () => undefined,
  onMessageNotificationClick: () => () => undefined,
  onDeepLink: () => () => undefined,
  getPlatform: async () => 'win32',
  getLocalSettings: async () => ({ volume: 1, desktopNotificationsEnabled: true, messageSoundsEnabled: true }),
  updateLocalSettings: async () => undefined,
};

export function installDesktopMock(): void {
  Object.defineProperty(window, 'desktop', {
    configurable: true,
    value: desktopMock,
  });
}
