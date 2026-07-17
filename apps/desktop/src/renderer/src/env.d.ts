/// <reference types="vite/client" />

import type { DesktopBridge } from '@vatrushka/shared';

declare global {
  interface Window {
    desktop: DesktopBridge;
  }

  interface ImportMetaEnv {
    readonly VITE_PUBLIC_API_BASE_URL?: string;
    readonly VITE_FEATURE_SERVER_SETTINGS_PAGE?: string;
    readonly VITE_FEATURE_USER_SETTINGS_PAGE?: string;
  }
}

export {};
