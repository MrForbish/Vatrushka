import { readFile } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const CHANNELS = {
  stable: { feedPath: "/updates", updatesEnabled: true },
  beta: { feedPath: "/updates/beta", updatesEnabled: true },
  rc: { feedPath: "/updates/rc", updatesEnabled: false },
};

function requiredHttpsUrl(value, label) {
  if (!value) throw new Error(`${label} is required`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute HTTPS URL`);
  }
  if (parsed.protocol !== "https:" || LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(`${label} must be a non-loopback HTTPS URL`);
  }
  return parsed;
}

function normalizeFeedUrl(value) {
  return value.replace(/\/+$/u, "");
}

export function resolveDesktopDeliveryConfig({ apiBaseUrl, updateFeed, channel = "stable", buildNumber, baseVersion }) {
  const definition = CHANNELS[channel];
  if (!definition) throw new Error(`Unsupported desktop delivery channel: ${channel}`);
  requiredHttpsUrl(apiBaseUrl, "VITE_PUBLIC_API_BASE_URL");

  const normalizedFeed = normalizeFeedUrl(updateFeed || (channel === "stable" ? "https://api.myvatrushka.ru/updates" : ""));
  const feed = requiredHttpsUrl(normalizedFeed, "VATRUSHKA_UPDATE_FEED");
  if (feed.pathname !== definition.feedPath) {
    throw new Error(`VATRUSHKA_UPDATE_FEED for ${channel} must end with ${definition.feedPath}`);
  }
  if (!/^\d+\.\d+\.\d+$/u.test(baseVersion)) throw new Error(`Desktop base version is not SemVer: ${baseVersion}`);
  if (channel !== "stable" && !/^\d+$/u.test(buildNumber ?? "")) {
    throw new Error(`VATRUSHKA_DESKTOP_BUILD_NUMBER is required for ${channel}`);
  }

  return {
    channel,
    updateFeed: normalizedFeed,
    updatesEnabled: definition.updatesEnabled,
    version: channel === "stable" ? baseVersion : `${baseVersion}-${channel}.${buildNumber}`,
  };
}

async function run() {
  const desktopPackage = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const result = resolveDesktopDeliveryConfig({
    apiBaseUrl: process.env.VITE_PUBLIC_API_BASE_URL,
    updateFeed: process.env.VATRUSHKA_UPDATE_FEED,
    channel: process.env.VATRUSHKA_DESKTOP_CHANNEL,
    buildNumber: process.env.VATRUSHKA_DESKTOP_BUILD_NUMBER,
    baseVersion: desktopPackage.version,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await run();
