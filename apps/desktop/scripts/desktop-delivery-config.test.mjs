import assert from "node:assert/strict";
import test from "node:test";

import { resolveDesktopDeliveryConfig } from "./desktop-delivery-config.mjs";

test("stable packaging keeps the stable feed and production SemVer", () => {
  assert.deepEqual(resolveDesktopDeliveryConfig({
    apiBaseUrl: "https://api.myvatrushka.ru",
    updateFeed: "https://api.myvatrushka.ru/updates/",
    channel: "stable",
    baseVersion: "0.9.0",
  }), {
    channel: "stable",
    updateFeed: "https://api.myvatrushka.ru/updates",
    updatesEnabled: true,
    version: "0.9.0",
    appId: "ru.vatrushka.desktop",
    appName: "vatrushka",
    productName: "Ватрушка",
    protocol: "vatrushka",
    artifactPrefix: "Vatrushka",
  });
});

test("beta packaging is monotonic and cannot use the stable feed", () => {
  assert.deepEqual(resolveDesktopDeliveryConfig({
    apiBaseUrl: "https://api-staging.myvatrushka.ru",
    updateFeed: "https://api-staging.myvatrushka.ru/updates/beta",
    channel: "beta",
    buildNumber: "123",
    baseVersion: "0.9.0",
  }), {
    channel: "beta",
    updateFeed: "https://api-staging.myvatrushka.ru/updates/beta",
    updatesEnabled: true,
    version: "0.9.0-beta.123",
    appId: "ru.vatrushka.desktop.beta",
    appName: "vatrushka-beta",
    productName: "Ватрушка Beta",
    protocol: "vatrushka-beta",
    artifactPrefix: "Vatrushka-Beta",
  });
  assert.throws(() => resolveDesktopDeliveryConfig({
    apiBaseUrl: "https://api-staging.myvatrushka.ru", updateFeed: "https://api.myvatrushka.ru/updates", channel: "beta", buildNumber: "123", baseVersion: "0.9.0",
  }), /must end with \/updates\/beta/u);
});

test("release candidates have no updater and reject malformed delivery inputs", () => {
  const rc = resolveDesktopDeliveryConfig({
    apiBaseUrl: "https://api-staging.myvatrushka.ru", updateFeed: "https://api-staging.myvatrushka.ru/updates/rc", channel: "rc", buildNumber: "321", baseVersion: "0.9.0",
  });
  assert.equal(rc.updatesEnabled, false);
  assert.equal(rc.version, "0.9.0-rc.321");
  assert.equal(rc.appId, "ru.vatrushka.desktop.rc");
  assert.equal(rc.appName, "vatrushka-rc");
  assert.equal(rc.protocol, "vatrushka-rc");
  assert.throws(() => resolveDesktopDeliveryConfig({
    apiBaseUrl: "http://localhost:3000", updateFeed: "https://api-staging.myvatrushka.ru/updates/rc", channel: "rc", buildNumber: "321", baseVersion: "0.9.0",
  }), /non-loopback HTTPS/u);
  assert.throws(() => resolveDesktopDeliveryConfig({
    apiBaseUrl: "https://api-staging.myvatrushka.ru", updateFeed: "https://api-staging.myvatrushka.ru/updates/rc", channel: "rc", baseVersion: "0.9.0",
  }), /BUILD_NUMBER/u);
});
