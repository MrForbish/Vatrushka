import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("self-hosted LiveKit configuration is environment-isolated", async () => {
  const compose = await read("infra/livekit/docker-compose.self-hosted.yml");
  const template = await read("infra/livekit/livekit.yaml");
  const environment = await read(".env.example");

  assert.match(compose, /VATRUSHKA_APP_ENV_FILE/u);
  assert.match(compose, /LIVEKIT_WEBHOOK_URL is required/u);
  assert.match(compose, /TURN_DOMAIN is required/u);
  assert.match(compose, /TURN_CERT_DIRECTORY/u);
  assert.doesNotMatch(compose, /myvatrushka\.ru/u);
  assert.match(template, /api\.example\.com\/api\/v1\/integrations\/livekit\/webhook/u);
  assert.doesNotMatch(template, /myvatrushka\.ru/u);
  assert.match(environment, /^LIVEKIT_WEBHOOK_URL=https:\/\/api\.example\.com\/api\/v1\/integrations\/livekit\/webhook$/mu);
  assert.match(environment, /^TURN_CERT_DIRECTORY=\/etc\/letsencrypt\/live$/mu);
});
