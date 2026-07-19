import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  MemoryVoicePresenceStore,
  type PendingVoiceMove,
  type VoiceSession,
} from "./voice-presence-store.js";

function session(overrides: Partial<VoiceSession> = {}): VoiceSession {
  const now = new Date().toISOString();
  return {
    sessionId: randomUUID(),
    userId: randomUUID(),
    serverId: randomUUID(),
    channelId: randomUUID(),
    livekitRoomName: `channel_${randomUUID()}`,
    participantIdentity: `user_${randomUUID()}_device`,
    participantSid: null,
    muted: false,
    deafened: false,
    speaking: false,
    screenSharing: false,
    connectionQuality: "unknown",
    joinedAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function move(source: VoiceSession): PendingVoiceMove {
  const now = new Date();
  return {
    movementId: randomUUID(),
    clientRequestId: randomUUID(),
    actorUserId: source.userId,
    subjectUserId: source.userId,
    serverId: source.serverId,
    fromChannelId: source.channelId,
    toChannelId: randomUUID(),
    voiceSessionId: source.sessionId,
    status: "authorized",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 15_000).toISOString(),
    failureCode: null,
  };
}

describe("MemoryVoicePresenceStore", () => {
  it("versions membership changes and ignores a late leave", async () => {
    const store = new MemoryVoicePresenceStore();
    const first = session();
    expect((await store.upsertSession(first)).version).toBe(1);
    const second = session({
      userId: first.userId,
      serverId: first.serverId,
    });
    expect((await store.upsertSession(second)).version).toBe(2);
    expect((await store.removeSession(first.userId, first.sessionId)).changed).toBe(
      false,
    );
    expect((await store.getSession(first.userId))?.sessionId).toBe(
      second.sessionId,
    );
  });

  it("deduplicates move requests and rejects concurrent moves", async () => {
    const store = new MemoryVoicePresenceStore();
    const source = session();
    const first = move(source);
    expect((await store.createMove(first, 15)).status).toBe("created");
    expect((await store.createMove(first, 15)).status).toBe("existing");
    expect((await store.createMove(move(source), 15)).status).toBe("conflict");
    await store.updateMove(first.movementId, "confirmed");
    await store.finishMove(first.movementId);
    expect((await store.createMove(move(source), 15)).status).toBe("created");
  });

  it("deduplicates webhook event ids", async () => {
    const store = new MemoryVoicePresenceStore();
    expect(await store.acceptWebhook("event-1")).toBe(true);
    expect(await store.acceptWebhook("event-1")).toBe(false);
  });
});
