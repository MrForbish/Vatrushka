import { describe, expect, it } from "vitest";

import type { UserNotificationPreferences } from "@vatrushka/shared";

import { quietHoursActive } from "./quiet-hours";

const preferences: UserNotificationPreferences = {
  desktopEnabled: true,
  soundEnabled: true,
  previewMode: "full",
  directMessagesEnabled: true,
  mentionsEnabled: true,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  updatedAt: "2026-07-29T00:00:00.000Z",
};

describe("quietHoursActive", () => {
  it("uses the current device local clock and supports an overnight interval", () => {
    expect(quietHoursActive(preferences, new Date(2026, 6, 29, 23, 30))).toBe(true);
    expect(quietHoursActive(preferences, new Date(2026, 6, 30, 7, 59))).toBe(true);
    expect(quietHoursActive(preferences, new Date(2026, 6, 30, 8, 0))).toBe(false);
    expect(quietHoursActive(preferences, new Date(2026, 6, 29, 12, 0))).toBe(false);
  });

  it("does not suppress delivery when quiet hours are disabled", () => {
    expect(
      quietHoursActive({ ...preferences, quietHoursStart: null, quietHoursEnd: null }),
    ).toBe(false);
  });
});
