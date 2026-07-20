import HawkCatcher from "@hawk.so/nodejs";

const enabled = process.env.HAWK_DESKTOP_MAIN_ENABLED === "true";
const token = process.env.HAWK_INTEGRATION_TOKEN;

export function initializeMainHawk(): void {
  if (!enabled || !token) return;
  try {
    HawkCatcher.init({
      token,
      release: process.env.HAWK_DESKTOP_RELEASE ?? "unknown",
      breadcrumbs: false,
      beforeSend: (event) => event,
      disableGlobalErrorsHandling: true,
    });
  } catch {
    // Observability is optional and must not block Electron startup.
  }
}

export function captureMainHawk(error: unknown, operation: string): void {
  if (!enabled || !token) return;
  try {
    HawkCatcher.send(error instanceof Error ? error : new Error("Desktop main failure"), {
      operation,
      runtime: "electron-main",
    });
  } catch {
    // Never affect the user flow when the collector is unavailable.
  }
}
