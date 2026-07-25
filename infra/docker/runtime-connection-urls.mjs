import process from "node:process";
import { URL } from "node:url";

function requireValue(environment, name, fallback) {
  const value = environment[name] ?? fallback;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function encodeComponent(value) {
  // WHATWG URL setters preserve a literal percent sign. Encode components
  // first so a password containing `%` cannot produce an invalid URL.
  return encodeURIComponent(value);
}

/**
 * Builds the local Postgres URL without interpolating credentials into a URL
 * literal. `URL` percent-encodes reserved password characters correctly.
 */
export function buildPostgresUrl(environment = process.env) {
  const url = new URL("postgresql://127.0.0.1:5433/");
  url.username = encodeComponent(
    requireValue(environment, "POSTGRES_USER", "vatrushka"),
  );
  url.password = encodeComponent(requireValue(environment, "POSTGRES_PASSWORD"));
  url.pathname = `/${encodeComponent(
    requireValue(environment, "POSTGRES_DB", "vatrushka"),
  )}`;
  return url.toString();
}

/**
 * Builds the local Redis URL without exposing an unencoded password to the
 * connection-string parser.
 */
export function buildRedisUrl(environment = process.env) {
  const url = new URL("redis://127.0.0.1:6379/0");
  url.password = encodeComponent(requireValue(environment, "REDIS_PASSWORD"));
  return url.toString();
}

function run() {
  const target = process.argv[2];
  if (target === "postgres") {
    process.stdout.write(buildPostgresUrl());
    return;
  }
  if (target === "redis") {
    process.stdout.write(buildRedisUrl());
    return;
  }
  throw new Error("Usage: runtime-connection-urls.mjs <postgres|redis>");
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  run();
}
