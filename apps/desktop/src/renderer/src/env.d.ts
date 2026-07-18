/// <reference types="vite/client" />

import type { DesktopBridge } from '@vatrushka/shared';

declare global {
  interface Window {
    desktop: DesktopBridge;
  }

  interface ImportMetaEnv {
    readonly VITE_PUBLIC_API_BASE_URL?: string;
  }
}

export {};
