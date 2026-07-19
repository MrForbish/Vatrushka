import { describe, expect, it } from "vitest";

import { applyVoiceEvent, voiceStateFromSnapshot } from "./voice-state.js";

describe("voice state reducer", () => {
  it("applies a confirmed move atomically and ignores duplicate events", () => {
    const initial = voiceStateFromSnapshot({
      serverId: "server-1",
      version: 1,
      generatedAt: new Date().toISOString(),
      channels: [
        {
          channelId: "voice-a",
          members: [
            {
              userId: "user-1",
              sessionId: "session-1",
              muted: false,
              deafened: false,
              speaking: false,
              screenSharing: false,
            },
          ],
        },
        { channelId: "voice-b", members: [] },
      ],
    });
    const event = {
      id: "event-1",
      type: "voice.member.moved" as const,
      occurredAt: new Date().toISOString(),
      conversationId: null,
      targetUserIds: [],
      payload: {
        serverId: "server-1",
        userId: "user-1",
        sessionId: "session-2",
        fromChannelId: "voice-a",
        toChannelId: "voice-b",
        version: 2,
      },
    };
    const moved = applyVoiceEvent(initial, event).state;
    expect(moved.membersByChannelId["voice-a"]).toEqual([]);
    expect(moved.membersByChannelId["voice-b"]).toEqual(["user-1"]);
    expect(applyVoiceEvent(moved, event).state).toBe(moved);
  });

  it("rejects a late leave and requests a snapshot on a version gap", () => {
    const initial = voiceStateFromSnapshot({
      serverId: "server-1",
      version: 2,
      generatedAt: new Date().toISOString(),
      channels: [
        {
          channelId: "voice-b",
          members: [
            {
              userId: "user-1",
              sessionId: "session-new",
              muted: false,
              deafened: false,
              speaking: false,
              screenSharing: false,
            },
          ],
        },
      ],
    });
    const lateLeave = applyVoiceEvent(initial, {
      id: "late",
      type: "voice.member.left",
      occurredAt: new Date().toISOString(),
      conversationId: null,
      targetUserIds: [],
      payload: {
        serverId: "server-1",
        userId: "user-1",
        sessionId: "session-old",
        version: 3,
      },
    }).state;
    expect(lateLeave.membersByChannelId["voice-b"]).toEqual(["user-1"]);
    expect(
      applyVoiceEvent(lateLeave, {
        id: "gap",
        type: "voice.member.joined",
        occurredAt: new Date().toISOString(),
        conversationId: null,
        targetUserIds: [],
        payload: { serverId: "server-1", version: 8 },
      }).snapshotRequired,
    ).toBe(true);
  });
});
