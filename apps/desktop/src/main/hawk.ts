import HawkCatcher from "@hawk.so/nodejs";

const enabled = process.env.HAWK_DESKTOP_MAIN_ENABLED === "true";
const token = process.env.HAWK_INTEGRATION_TOKEN;
const forbiddenKey = /(?:authorization|cookie|password|secret|token|otp|code|email|message|content|body)/iu;
const forbiddenValue = /(?:bearer\s+|eyJ[a-zA-Z0-9_-]{10,}|https?:\/\/[^\s]+[?&](?:token|key|code)=)/iu;

function scrub(value: unknown, key = ""): unknown {
  if (forbiddenKey.test(key)) return "[redacted]";
  if (typeof value === "string")
    return forbiddenValue.test(value) ? "[redacted]" : value.slice(0, 512);
  if (Array.isArray(value)) return value.map((item) => scrub(item));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        scrub(entryValue, entryKey),
      ]),
    );
  return value;
}

export function initializeMainHawk(): void {
  if (!enabled || !token) return;
  try {
    HawkCatcher.init({
      token,
      release: process.env.HAWK_DESKTOP_RELEASE ?? "unknown",
      breadcrumbs: false,
      beforeSend: (event) => scrub(event) as typeof event,
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
