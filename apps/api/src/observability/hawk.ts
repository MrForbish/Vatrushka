import { createHmac } from "node:crypto";

import HawkCatcher from "@hawk.so/nodejs";

import type { AppConfig } from "../config.js";

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

export interface HawkReporter {
  capture(error: unknown, context: Record<string, string>, userId?: string): void;
}

export function createHawkReporter(config: AppConfig): HawkReporter {
  if (!config.HAWK_ENABLED || !config.HAWK_INTEGRATION_TOKEN)
    return { capture: () => undefined };

  HawkCatcher.init({
    token: config.HAWK_INTEGRATION_TOKEN,
    release: config.HAWK_RELEASE,
    breadcrumbs: false,
    beforeSend: (event) => scrub(event) as typeof event,
  });

  return {
    capture(error, context, userId) {
      const normalized = error instanceof Error ? error : new Error("Unexpected API failure");
      const safeUser =
        userId && config.HAWK_USER_HASH_SECRET
          ? { id: createHmac("sha256", config.HAWK_USER_HASH_SECRET).update(userId).digest("hex") }
          : undefined;
      try {
        HawkCatcher.send(normalized, scrub(context) as Record<string, string>, safeUser);
      } catch {
        // Error reporting must never alter API behaviour.
      }
    },
  };
}
