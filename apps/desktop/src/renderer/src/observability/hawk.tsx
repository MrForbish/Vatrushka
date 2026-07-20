import HawkCatcher from '@hawk.so/browser';
import { Component, type ErrorInfo, type ReactNode } from 'react';

const environment = import.meta.env as unknown as Record<string, unknown>;
const enabled = environment.VITE_HAWK_DESKTOP_RENDERER_ENABLED === 'true';
const token = typeof environment.VITE_HAWK_INTEGRATION_TOKEN === 'string'
  ? environment.VITE_HAWK_INTEGRATION_TOKEN
  : undefined;

let hawk: HawkCatcher | null = null;

export function initializeRendererHawk(): void {
  if (!enabled || !token || hawk) return;
  try {
    hawk = new HawkCatcher({
      token,
      release: typeof environment.VITE_HAWK_DESKTOP_RELEASE === 'string'
        ? environment.VITE_HAWK_DESKTOP_RELEASE
        : 'unknown',
      breadcrumbs: false,
      consoleTracking: false,
      issues: false,
      beforeSend: (event) => event,
    });
  } catch {
    hawk = null;
  }
}

function capture(error: Error, operation: string): void {
  try {
    hawk?.send(error, { operation, runtime: 'electron-renderer' });
  } catch {
    // Error reporting is strictly best-effort.
  }
}

export class HawkErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    void _info;
    capture(error, 'react-render');
  }

  override render(): ReactNode {
    if (this.state.failed)
      return <main role="alert">Не удалось отобразить экран. Перезапустите Ватрушку.</main>;
    return this.props.children;
  }
}
