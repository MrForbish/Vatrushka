import { describe, expect, it } from "vitest";

import type { InternalNotification, UserNotificationPreferences } from "@vatrushka/shared";

import { shouldPresentNotification } from "./delivery-policy";

const now = new Date(2026, 6, 29, 14, 0);
const preferences: UserNotificationPreferences = {
  desktopEnabled: true,
  soundEnabled: true,
  previewMode: "full",
  directMessagesEnabled: true,
  mentionsEnabled: true,
  quietHoursStart: null,
  quietHoursEnd: null,
  updatedAt: now.toISOString(),
};
const notification: Pick<InternalNotification, "conversationId" | "createdAt" | "type"> = {
  type: "direct_message",
  conversationId: "conversation-1",
  createdAt: now.toISOString(),
};

function allowed(overrides: Partial<Parameters<typeof shouldPresentNotification>[0]> = {}): boolean {
  return shouldPresentNotification({
    notification,
    preferences,
    presence: null,
    visibleConversationId: null,
    applicationIsVisible: false,
    now,
    ...overrides,
  });
}

describe("notification presentation policy", () => {
  it("keeps new eligible events deliverable", () => {
    expect(allowed()).toBe(true);
  });

  it("suppresses interruptions for disabled event types, DND, quiet hours, and the visible conversation", () => {
    expect(allowed({ preferences: { ...preferences, directMessagesEnabled: false } })).toBe(false);
    expect(allowed({ notification: { ...notification, type: "mention" }, preferences: { ...preferences, mentionsEnabled: false } })).toBe(false);
    expect(allowed({ presence: { preference: "do_not_disturb", effectiveStatus: "dnd", customText: null, customTextExpiresAt: null, updatedAt: now.toISOString() } })).toBe(false);
    expect(allowed({ preferences: { ...preferences, quietHoursStart: "13:00", quietHoursEnd: "15:00" } })).toBe(false);
    expect(allowed({ applicationIsVisible: true, visibleConversationId: "conversation-1" })).toBe(false);
  });
});
