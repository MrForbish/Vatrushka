import { describe, expect, it } from "vitest";

import { desktopUpdatesAreEnabled } from "./updater-policy.js";

describe("desktop update policy", () => {
  it("enables the updater only for a packaged Windows beta or stable build", () => {
    expect(desktopUpdatesAreEnabled({ isPackaged: true, platform: "win32", isPortable: false, buildEnabled: true })).toBe(true);
  });

  it("keeps local development, portable installers and RCs out of updater feeds", () => {
    expect(desktopUpdatesAreEnabled({ isPackaged: false, platform: "win32", isPortable: false, buildEnabled: true })).toBe(false);
    expect(desktopUpdatesAreEnabled({ isPackaged: true, platform: "win32", isPortable: true, buildEnabled: true })).toBe(false);
    expect(desktopUpdatesAreEnabled({ isPackaged: true, platform: "win32", isPortable: false, buildEnabled: false })).toBe(false);
  });
});
