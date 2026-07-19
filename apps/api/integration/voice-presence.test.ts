import { randomUUID } from "node:crypto";

import { createClient } from "redis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  RedisVoicePresenceStore,
  type VoiceSession,
} from "../src/services/voice-presence-store.js";

const redisUrl = process.env.INTEGRATION_REDIS_URL;
const describeRedis = redisUrl ? describe : describe.skip;

describeRedis("Redis voice presence projection", () => {
  const client = createClient({ url: redisUrl });
  let store: RedisVoicePresenceStore;
  const serverId = randomUUID();
  const userId = randomUUID();
  const channelIds: string[] = [];

  beforeAll(async () => {
    await client.connect();
    store = new RedisVoicePresenceStore(client);
  });

  afterAll(async () => {
    if (!client.isOpen) return;
    const keys: string[] = [];
    for await (const key of client.scanIterator({
      MATCH: `vatrushka:voice:*${serverId}*`,
    }))
      keys.push(key);
    keys.push(`vatrushka:voice:user:${userId}`);
    keys.push(
      ...channelIds.map(
        (channelId) => `vatrushka:voice:channel:${channelId}:members`,
      ),
    );
    if (keys.length > 0) await client.del(...keys);
    await client.sRem("vatrushka:voice:servers", serverId);
    await client.quit();
  });

  it("atomically moves the logical session and rejects a stale leave", async () => {
    const now = new Date().toISOString();
    const first: VoiceSession = {
      sessionId: randomUUID(),
      userId,
      serverId,
      channelId: randomUUID(),
      livekitRoomName: `channel_${randomUUID()}`,
      participantIdentity: `user_${userId}_first`,
      participantSid: "PA_first",
      muted: false,
      deafened: false,
      speaking: false,
      screenSharing: false,
      connectionQuality: "unknown",
      joinedAt: now,
      updatedAt: now,
    };
    const second: VoiceSession = {
      ...first,
      sessionId: randomUUID(),
      channelId: randomUUID(),
      livekitRoomName: `channel_${randomUUID()}`,
      participantIdentity: `user_${userId}_second`,
      participantSid: "PA_second",
    };
    channelIds.push(first.channelId, second.channelId);
    expect((await store.upsertSession(first)).version).toBe(1);
    expect((await store.upsertSession(second)).version).toBe(2);
    expect((await store.removeSession(userId, first.sessionId)).changed).toBe(
      false,
    );
    const snapshot = await store.snapshot(serverId);
    expect(snapshot.version).toBe(2);
    expect(snapshot.sessions).toHaveLength(1);
    expect(snapshot.sessions[0]?.sessionId).toBe(second.sessionId);
  });
});
