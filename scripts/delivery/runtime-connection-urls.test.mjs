import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";

import {
  buildPostgresUrl,
  buildRedisUrl,
} from "../../infra/docker/runtime-connection-urls.mjs";

const reservedPassword = "pass:@/?#[]% with space";

test("runtime Postgres URL encodes credentials with reserved characters", () => {
  const value = buildPostgresUrl({
    POSTGRES_USER: "vat@rushka",
    POSTGRES_PASSWORD: reservedPassword,
    POSTGRES_DB: "vatrushka staging",
  });
  const parsed = new URL(value);

  assert.equal(parsed.protocol, "postgresql:");
  assert.equal(decodeURIComponent(parsed.username), "vat@rushka");
  assert.equal(decodeURIComponent(parsed.password), reservedPassword);
  assert.equal(decodeURIComponent(parsed.pathname), "/vatrushka staging");
  assert.doesNotMatch(value, /pass:@/u);
});

test("runtime Redis URL encodes credentials with reserved characters", () => {
  const value = buildRedisUrl({ REDIS_PASSWORD: reservedPassword });
  const parsed = new URL(value);

  assert.equal(parsed.protocol, "redis:");
  assert.equal(decodeURIComponent(parsed.password), reservedPassword);
  assert.equal(parsed.pathname, "/0");
  assert.doesNotMatch(value, /pass:@/u);
});

test("runtime entrypoint owns URL construction instead of Compose interpolation", async () => {
  const [compose, dockerfile, entrypoint] = await Promise.all([
    readFile(new URL("../../infra/docker/docker-compose.yml", import.meta.url), "utf8"),
    readFile(new URL("../../infra/docker/Dockerfile.api", import.meta.url), "utf8"),
    readFile(new URL("../../infra/docker/api-start.sh", import.meta.url), "utf8"),
  ]);

  assert.match(compose, /command: \["sh", "infra\/docker\/api-start\.sh"\]/u);
  assert.doesNotMatch(compose, /DATABASE_URL:\s*postgresql:\/\//u);
  assert.doesNotMatch(compose, /REDIS_URL:\s*redis:\/\//u);
  assert.match(dockerfile, /infra\/docker\/api-start\.sh/u);
  assert.match(dockerfile, /COPY --chown=nodeapp:nodeapp package\.json package-lock\.json/u);
  assert.match(entrypoint, /runtime-connection-urls\.mjs postgres/u);
  assert.match(entrypoint, /runtime-connection-urls\.mjs redis/u);
});
