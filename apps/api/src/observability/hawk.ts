import { createHmac } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

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
  readonly enabled: boolean;
  capture(error: unknown, context: Record<string, string>, userId?: string): boolean;
}

function hawkReleaseEndpoint(token: string): string {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8")) as { integrationId?: unknown };
    if (typeof decoded.integrationId !== "string" || decoded.integrationId.length === 0)
      throw new Error("missing integration id");
    return `https://${decoded.integrationId}.k1.hawk.so/release`;
  } catch {
    throw new Error("HAWK API integration token has an invalid format");
  }
}

async function sourceMaps(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".map"))
    .map((entry) => join(entry.parentPath, entry.name));
}

/**
 * Creates the Hawk release from the API source maps. This is intentionally
 * best-effort: a third-party telemetry outage must not make the API unavailable.
 */
export async function publishApiHawkRelease(config: AppConfig): Promise<number> {
  const token = config.HAWK_API_INTEGRATION_TOKEN || config.HAWK_INTEGRATION_TOKEN;
  if (!config.HAWK_ENABLED || !token) return 0;

  const directory = fileURLToPath(new URL("../", import.meta.url));
  const maps = await sourceMaps(directory);
  const endpoint = hawkReleaseEndpoint(token);

  for (const filePath of maps) {
    const form = new FormData();
    form.set("release", config.HAWK_RELEASE);
    form.set("file", new Blob([await readFile(filePath)], { type: "application/json" }), basename(filePath));
    const response = await fetch(endpoint, {
      method: "POST",
      body: form,
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.text()).trim().slice(0, 512);
    if (!response.ok) throw new Error(`Hawk API release upload failed with HTTP ${response.status}: ${body || "empty response body"}`);
    const parsed = body ? (JSON.parse(body) as { error?: unknown; message?: unknown }) : undefined;
    if (parsed?.error) throw new Error(`Hawk API release upload rejected: ${typeof parsed.message === "string" ? parsed.message : "unknown error"}`);
  }

  return maps.length;
}

export function createHawkReporter(config: AppConfig): HawkReporter {
  const token = config.HAWK_API_INTEGRATION_TOKEN || config.HAWK_INTEGRATION_TOKEN;
  if (!config.HAWK_ENABLED || !token)
    return { enabled: false, capture: () => false };

  HawkCatcher.init({
    token,
    release: config.HAWK_RELEASE,
    breadcrumbs: false,
    beforeSend: (event) => scrub(event) as typeof event,
  });

  return {
    enabled: true,
    capture(error, context, userId) {
      const normalized = error instanceof Error ? error : new Error("Unexpected API failure");
      const safeUser =
        userId && config.HAWK_USER_HASH_SECRET
          ? { id: createHmac("sha256", config.HAWK_USER_HASH_SECRET).update(userId).digest("hex") }
          : undefined;
      try {
        HawkCatcher.send(normalized, scrub(context) as Record<string, string>, safeUser);
        return true;
      } catch {
        // Error reporting must never alter API behaviour.
        return false;
      }
    },
  };
}
