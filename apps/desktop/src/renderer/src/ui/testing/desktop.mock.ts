import type { DesktopBridge } from '@vatrushka/shared';

export const desktopMock: DesktopBridge = {
  getAppVersion: async () => '0.2.0-storybook',
  getStoredRefreshToken: async () => null,
  storeRefreshToken: async () => undefined,
  clearRefreshToken: async () => undefined,
  listDesktopSources: async () => [],
  selectDesktopSource: async () => undefined,
  clearSelectedDesktopSource: async () => undefined,
  copyToClipboard: async () => undefined,
  showMessageNotification: async () => undefined,
  onMessageNotificationClick: () => () => undefined,
  onDeepLink: () => () => undefined,
  getPlatform: async () => 'win32',
  getLocalSettings: async () => ({ volume: 1 }),
  updateLocalSettings: async () => undefined,
};

export function installDesktopMock(): void {
  Object.defineProperty(window, 'desktop', {
    configurable: true,
    value: desktopMock,
  });
}
