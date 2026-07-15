import '@testing-library/jest-dom/vitest';

import type { DesktopBridge } from '@vatrushka/shared';

const desktop: DesktopBridge = {
  getAppVersion: async () => '0.1.0-test',
  getStoredRefreshToken: async () => null,
  storeRefreshToken: async () => undefined,
  clearRefreshToken: async () => undefined,
  listDesktopSources: async () => [],
  selectDesktopSource: async () => undefined,
  clearSelectedDesktopSource: async () => undefined,
  copyToClipboard: async () => undefined,
  onDeepLink: () => () => undefined,
  getPlatform: async () => 'win32',
  getLocalSettings: async () => ({ volume: 1 }),
  updateLocalSettings: async () => undefined,
};

Object.defineProperty(window, 'desktop', { configurable: true, value: desktop });

Object.defineProperty(navigator, 'mediaDevices', {
  configurable: true,
  value: {
    enumerateDevices: async () => [],
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  },
});
