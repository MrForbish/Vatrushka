import { createClient, type RedisClientType } from "redis";

import type { AppConfig } from "../config.js";

export type VoiceConnectionQuality =
  | "excellent"
  | "good"
  | "poor"
  | "unknown";

export interface VoiceSession {
  sessionId: string;
  userId: string;
  serverId: string;
  channelId: string;
  livekitRoomName: string;
  participantIdentity: string;
  participantSid: string | null;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
  screenSharing: boolean;
  connectionQuality: VoiceConnectionQuality;
  joinedAt: string;
  updatedAt: string;
}

export type VoiceMoveStatus =
  | "requested"
  | "authorized"
  | "dispatching"
  | "waiting_for_target_join"
  | "confirmed"
  | "failed"
  | "timed_out"
  | "cancelled";

export interface PendingVoiceMove {
  movementId: string;
  clientRequestId: string;
  actorUserId: string;
  subjectUserId: string;
  serverId: string;
  fromChannelId: string;
  toChannelId: string;
  voiceSessionId: string;
  status: VoiceMoveStatus;
  createdAt: string;
  expiresAt: string;
  failureCode: string | null;
}

export interface VoiceStateSnapshot {
  serverId: string;
  version: number;
  generatedAt: string;
  sessions: VoiceSession[];
}

export interface VoiceProjectionMutation {
  changed: boolean;
  version: number;
  previousChannelId: string | null;
  previousSessionId: string | null;
}

export type CreateVoiceMoveResult =
  | { status: "created"; move: PendingVoiceMove }
  | { status: "existing"; move: PendingVoiceMove }
  | { status: "conflict"; move: PendingVoiceMove };

export interface VoicePresenceStore {
  healthCheck(): Promise<void>;
  upsertSession(session: VoiceSession): Promise<VoiceProjectionMutation>;
  removeSession(
    userId: string,
    expectedSessionId: string | null,
    expectedChannelId?: string | null,
  ): Promise<VoiceProjectionMutation>;
  updateSessionState(
    userId: string,
    expectedSessionId: string,
    patch: Partial<
      Pick<
        VoiceSession,
        | "muted"
        | "deafened"
        | "speaking"
        | "screenSharing"
        | "connectionQuality"
      >
    >,
  ): Promise<VoiceSession | null>;
  getSession(userId: string): Promise<VoiceSession | null>;
  snapshot(serverId: string): Promise<VoiceStateSnapshot>;
  activeServerIds(): Promise<string[]>;
  createMove(
    move: PendingVoiceMove,
    ttlSeconds: number,
  ): Promise<CreateVoiceMoveResult>;
  getMove(movementId: string): Promise<PendingVoiceMove | null>;
  getMoveForUser(userId: string): Promise<PendingVoiceMove | null>;
  updateMove(
    movementId: string,
    status: VoiceMoveStatus,
    failureCode?: string | null,
  ): Promise<PendingVoiceMove | null>;
  finishMove(movementId: string): Promise<void>;
  acceptWebhook(eventId: string, ttlSeconds?: number): Promise<boolean>;
  close(): Promise<void>;
}

function parseBoolean(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

function parseSession(value: Record<string, string>): VoiceSession | null {
  if (
    !value.sessionId ||
    !value.userId ||
    !value.serverId ||
    !value.channelId ||
    !value.livekitRoomName ||
    !value.participantIdentity ||
    !value.joinedAt ||
    !value.updatedAt
  )
    return null;
  return {
    sessionId: value.sessionId,
    userId: value.userId,
    serverId: value.serverId,
    channelId: value.channelId,
    livekitRoomName: value.livekitRoomName,
    participantIdentity: value.participantIdentity,
    participantSid: value.participantSid || null,
    muted: parseBoolean(value.muted),
    deafened: parseBoolean(value.deafened),
    speaking: parseBoolean(value.speaking),
    screenSharing: parseBoolean(value.screenSharing),
    connectionQuality:
      value.connectionQuality === "excellent" ||
      value.connectionQuality === "good" ||
      value.connectionQuality === "poor"
        ? value.connectionQuality
        : "unknown",
    joinedAt: value.joinedAt,
    updatedAt: value.updatedAt,
  };
}

function parseMove(value: Record<string, string>): PendingVoiceMove | null {
  if (
    !value.movementId ||
    !value.clientRequestId ||
    !value.actorUserId ||
    !value.subjectUserId ||
    !value.serverId ||
    !value.fromChannelId ||
    !value.toChannelId ||
    !value.voiceSessionId ||
    !value.status ||
    !value.createdAt ||
    !value.expiresAt
  )
    return null;
  return {
    movementId: value.movementId,
    clientRequestId: value.clientRequestId,
    actorUserId: value.actorUserId,
    subjectUserId: value.subjectUserId,
    serverId: value.serverId,
    fromChannelId: value.fromChannelId,
    toChannelId: value.toChannelId,
    voiceSessionId: value.voiceSessionId,
    status: value.status as VoiceMoveStatus,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
    failureCode: value.failureCode || null,
  };
}

export class MemoryVoicePresenceStore implements VoicePresenceStore {
  private readonly sessions = new Map<string, VoiceSession>();
  private readonly versions = new Map<string, number>();
  private readonly moves = new Map<string, PendingVoiceMove>();
  private readonly moveByUser = new Map<string, string>();
  private readonly moveByRequest = new Map<string, string>();
  private readonly webhookIds = new Set<string>();

  healthCheck(): Promise<void> {
    return Promise.resolve();
  }

  upsertSession(session: VoiceSession): Promise<VoiceProjectionMutation> {
    const previous = this.sessions.get(session.userId) ?? null;
    const changed =
      previous?.sessionId !== session.sessionId ||
      previous.channelId !== session.channelId;
    this.sessions.set(session.userId, { ...session });
    const version = changed
      ? (this.versions.get(session.serverId) ?? 0) + 1
      : (this.versions.get(session.serverId) ?? 0);
    this.versions.set(session.serverId, version);
    return Promise.resolve({
      changed,
      version,
      previousChannelId: previous?.channelId ?? null,
      previousSessionId: previous?.sessionId ?? null,
    });
  }

  removeSession(
    userId: string,
    expectedSessionId: string | null,
    expectedChannelId: string | null = null,
  ): Promise<VoiceProjectionMutation> {
    const previous = this.sessions.get(userId) ?? null;
    if (
      !previous ||
      (expectedSessionId && previous.sessionId !== expectedSessionId) ||
      (expectedChannelId && previous.channelId !== expectedChannelId)
    )
      return Promise.resolve({
        changed: false,
        version: previous ? (this.versions.get(previous.serverId) ?? 0) : 0,
        previousChannelId: previous?.channelId ?? null,
        previousSessionId: previous?.sessionId ?? null,
      });
    this.sessions.delete(userId);
    const version = (this.versions.get(previous.serverId) ?? 0) + 1;
    this.versions.set(previous.serverId, version);
    return Promise.resolve({
      changed: true,
      version,
      previousChannelId: previous.channelId,
      previousSessionId: previous.sessionId,
    });
  }

  updateSessionState(
    userId: string,
    expectedSessionId: string,
    patch: Partial<VoiceSession>,
  ): Promise<VoiceSession | null> {
    const current = this.sessions.get(userId);
    if (!current || current.sessionId !== expectedSessionId)
      return Promise.resolve(null);
    const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
    this.sessions.set(userId, updated);
    return Promise.resolve(updated);
  }

  getSession(userId: string): Promise<VoiceSession | null> {
    const value = this.sessions.get(userId);
    return Promise.resolve(value ? { ...value } : null);
  }

  snapshot(serverId: string): Promise<VoiceStateSnapshot> {
    return Promise.resolve({
      serverId,
      version: this.versions.get(serverId) ?? 0,
      generatedAt: new Date().toISOString(),
      sessions: [...this.sessions.values()].filter(
        (session) => session.serverId === serverId,
      ),
    });
  }

  activeServerIds(): Promise<string[]> {
    return Promise.resolve([
      ...new Set([...this.sessions.values()].map((session) => session.serverId)),
    ]);
  }

  createMove(
    move: PendingVoiceMove,
    ttlSeconds: number,
  ): Promise<CreateVoiceMoveResult> {
    void ttlSeconds;
    const requestKey = `${move.actorUserId}:${move.clientRequestId}`;
    const existingRequestId = this.moveByRequest.get(requestKey);
    if (existingRequestId) {
      const existing = this.moves.get(existingRequestId);
      if (existing) return Promise.resolve({ status: "existing", move: existing });
    }
    const activeId = this.moveByUser.get(move.subjectUserId);
    if (activeId) {
      const active = this.moves.get(activeId);
      if (
        active &&
        !["confirmed", "failed", "timed_out", "cancelled"].includes(
          active.status,
        )
      )
        return Promise.resolve({ status: "conflict", move: active });
    }
    this.moves.set(move.movementId, { ...move });
    this.moveByUser.set(move.subjectUserId, move.movementId);
    this.moveByRequest.set(requestKey, move.movementId);
    return Promise.resolve({ status: "created", move });
  }

  getMove(movementId: string): Promise<PendingVoiceMove | null> {
    const move = this.moves.get(movementId);
    return Promise.resolve(move ? { ...move } : null);
  }

  async getMoveForUser(userId: string): Promise<PendingVoiceMove | null> {
    const movementId = this.moveByUser.get(userId);
    return movementId ? this.getMove(movementId) : null;
  }

  updateMove(
    movementId: string,
    status: VoiceMoveStatus,
    failureCode: string | null = null,
  ): Promise<PendingVoiceMove | null> {
    const move = this.moves.get(movementId);
    if (!move) return Promise.resolve(null);
    const updated = { ...move, status, failureCode };
    this.moves.set(movementId, updated);
    return Promise.resolve({ ...updated });
  }

  finishMove(movementId: string): Promise<void> {
    const move = this.moves.get(movementId);
    if (!move) return Promise.resolve();
    this.moveByUser.delete(move.subjectUserId);
    return Promise.resolve();
  }

  acceptWebhook(eventId: string): Promise<boolean> {
    if (this.webhookIds.has(eventId)) return Promise.resolve(false);
    this.webhookIds.add(eventId);
    return Promise.resolve(true);
  }

  close(): Promise<void> {
    this.sessions.clear();
    this.versions.clear();
    this.moves.clear();
    this.moveByUser.clear();
    this.moveByRequest.clear();
    this.webhookIds.clear();
    return Promise.resolve();
  }
}

export class RedisVoicePresenceStore implements VoicePresenceStore {
  constructor(private readonly client: RedisClientType) {}

  private userKey(userId: string): string {
    return `vatrushka:voice:user:${userId}`;
  }

  private serverUsersKey(serverId: string): string {
    return `vatrushka:voice:server:${serverId}:users`;
  }

  private serverVersionKey(serverId: string): string {
    return `vatrushka:voice:server:${serverId}:version`;
  }

  private channelMembersKey(channelId: string): string {
    return `vatrushka:voice:channel:${channelId}:members`;
  }

  private moveKey(movementId: string): string {
    return `vatrushka:voice:move:${movementId}`;
  }

  private moveUserKey(userId: string): string {
    return `vatrushka:voice:move:user:${userId}`;
  }

  private moveRequestKey(actorUserId: string, clientRequestId: string): string {
    return `vatrushka:voice:move:request:${actorUserId}:${clientRequestId}`;
  }

  async healthCheck(): Promise<void> {
    await this.client.ping();
  }

  async upsertSession(session: VoiceSession): Promise<VoiceProjectionMutation> {
    const result = (await this.client.eval(
      `
local previousChannel = redis.call('HGET', KEYS[1], 'channelId')
local previousSession = redis.call('HGET', KEYS[1], 'sessionId')
local changed = previousChannel ~= ARGV[4] or previousSession ~= ARGV[1]
if previousChannel and previousChannel ~= ARGV[4] then
  redis.call('SREM', ARGV[15] .. previousChannel .. ':members', ARGV[2])
end
redis.call('HSET', KEYS[1],
  'sessionId', ARGV[1], 'userId', ARGV[2], 'serverId', ARGV[3],
  'channelId', ARGV[4], 'livekitRoomName', ARGV[5],
  'participantIdentity', ARGV[6], 'participantSid', ARGV[7],
  'muted', ARGV[8], 'deafened', ARGV[9], 'speaking', ARGV[10],
  'screenSharing', ARGV[11], 'connectionQuality', ARGV[12],
  'joinedAt', ARGV[13], 'updatedAt', ARGV[14])
redis.call('SADD', KEYS[2], ARGV[2])
redis.call('SADD', KEYS[3], ARGV[2])
local version = tonumber(redis.call('GET', KEYS[4]) or '0')
if changed then version = redis.call('INCR', KEYS[4]) end
return {changed and 1 or 0, version, previousChannel or '', previousSession or ''}
`,
      {
        keys: [
          this.userKey(session.userId),
          this.channelMembersKey(session.channelId),
          this.serverUsersKey(session.serverId),
          this.serverVersionKey(session.serverId),
        ],
        arguments: [
          session.sessionId,
          session.userId,
          session.serverId,
          session.channelId,
          session.livekitRoomName,
          session.participantIdentity,
          session.participantSid ?? "",
          session.muted ? "1" : "0",
          session.deafened ? "1" : "0",
          session.speaking ? "1" : "0",
          session.screenSharing ? "1" : "0",
          session.connectionQuality,
          session.joinedAt,
          session.updatedAt,
          "vatrushka:voice:channel:",
        ],
      },
    )) as Array<number | string>;
    await this.client.sAdd("vatrushka:voice:servers", session.serverId);
    return {
      changed: Number(result[0]) === 1,
      version: Number(result[1]),
      previousChannelId: String(result[2] ?? "") || null,
      previousSessionId: String(result[3] ?? "") || null,
    };
  }

  async removeSession(
    userId: string,
    expectedSessionId: string | null,
    expectedChannelId: string | null = null,
  ): Promise<VoiceProjectionMutation> {
    const current = await this.getSession(userId);
    if (!current)
      return {
        changed: false,
        version: 0,
        previousChannelId: null,
        previousSessionId: null,
      };
    const result = (await this.client.eval(
      `
local currentSession = redis.call('HGET', KEYS[1], 'sessionId')
local currentChannel = redis.call('HGET', KEYS[1], 'channelId')
if not currentSession or (ARGV[1] ~= '' and currentSession ~= ARGV[1]) or (ARGV[3] ~= '' and currentChannel ~= ARGV[3]) then
  return {0, tonumber(redis.call('GET', KEYS[4]) or '0')}
end
redis.call('DEL', KEYS[1])
redis.call('SREM', KEYS[2], ARGV[2])
redis.call('SREM', KEYS[3], ARGV[2])
local version = redis.call('INCR', KEYS[4])
return {1, version}
`,
      {
        keys: [
          this.userKey(userId),
          this.channelMembersKey(current.channelId),
          this.serverUsersKey(current.serverId),
          this.serverVersionKey(current.serverId),
        ],
        arguments: [expectedSessionId ?? "", userId, expectedChannelId ?? ""],
      },
    )) as Array<number | string>;
    return {
      changed: Number(result[0]) === 1,
      version: Number(result[1]),
      previousChannelId: current.channelId,
      previousSessionId: current.sessionId,
    };
  }

  async updateSessionState(
    userId: string,
    expectedSessionId: string,
    patch: Partial<VoiceSession>,
  ): Promise<VoiceSession | null> {
    const current = await this.getSession(userId);
    if (!current || current.sessionId !== expectedSessionId) return null;
    const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
    await this.client.hSet(this.userKey(userId), {
      muted: updated.muted ? "1" : "0",
      deafened: updated.deafened ? "1" : "0",
      speaking: updated.speaking ? "1" : "0",
      screenSharing: updated.screenSharing ? "1" : "0",
      connectionQuality: updated.connectionQuality,
      updatedAt: updated.updatedAt,
    });
    return updated;
  }

  async getSession(userId: string): Promise<VoiceSession | null> {
    return parseSession(await this.client.hGetAll(this.userKey(userId)));
  }

  async snapshot(serverId: string): Promise<VoiceStateSnapshot> {
    const userIds = await this.client.sMembers(this.serverUsersKey(serverId));
    const sessions = (
      await Promise.all(userIds.map((userId) => this.getSession(userId)))
    ).filter(
      (session): session is VoiceSession => session?.serverId === serverId,
    );
    return {
      serverId,
      version: Number((await this.client.get(this.serverVersionKey(serverId))) ?? 0),
      generatedAt: new Date().toISOString(),
      sessions,
    };
  }

  activeServerIds(): Promise<string[]> {
    return this.client.sMembers("vatrushka:voice:servers");
  }

  async createMove(
    move: PendingVoiceMove,
    ttlSeconds: number,
  ): Promise<CreateVoiceMoveResult> {
    const requestKey = this.moveRequestKey(
      move.actorUserId,
      move.clientRequestId,
    );
    const existingRequestId = await this.client.get(requestKey);
    if (existingRequestId) {
      const existing = await this.getMove(existingRequestId);
      if (existing) return { status: "existing", move: existing };
    }
    const userKey = this.moveUserKey(move.subjectUserId);
    const locked = await this.client.set(userKey, move.movementId, {
      NX: true,
      EX: ttlSeconds,
    });
    if (locked !== "OK") {
      const activeId = await this.client.get(userKey);
      const active = activeId ? await this.getMove(activeId) : null;
      if (active) return { status: "conflict", move: active };
      await this.client.del(userKey);
      return this.createMove(move, ttlSeconds);
    }
    await this.client
      .multi()
      .hSet(this.moveKey(move.movementId), {
        ...move,
        failureCode: move.failureCode ?? "",
      })
      .expire(this.moveKey(move.movementId), ttlSeconds * 2)
      .set(requestKey, move.movementId, { EX: ttlSeconds * 2 })
      .exec();
    return { status: "created", move };
  }

  async getMove(movementId: string): Promise<PendingVoiceMove | null> {
    return parseMove(await this.client.hGetAll(this.moveKey(movementId)));
  }

  async getMoveForUser(userId: string): Promise<PendingVoiceMove | null> {
    const movementId = await this.client.get(this.moveUserKey(userId));
    return movementId ? this.getMove(movementId) : null;
  }

  async updateMove(
    movementId: string,
    status: VoiceMoveStatus,
    failureCode: string | null = null,
  ): Promise<PendingVoiceMove | null> {
    const current = await this.getMove(movementId);
    if (!current) return null;
    await this.client.hSet(this.moveKey(movementId), {
      status,
      failureCode: failureCode ?? "",
    });
    return { ...current, status, failureCode };
  }

  async finishMove(movementId: string): Promise<void> {
    const move = await this.getMove(movementId);
    if (!move) return;
    const userKey = this.moveUserKey(move.subjectUserId);
    const active = await this.client.get(userKey);
    if (active === movementId) await this.client.del(userKey);
  }

  async acceptWebhook(eventId: string, ttlSeconds = 24 * 60 * 60): Promise<boolean> {
    return (
      (await this.client.set(`vatrushka:voice:webhook:${eventId}`, "1", {
        NX: true,
        EX: ttlSeconds,
      })) === "OK"
    );
  }

  async close(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
  }
}

export async function createVoicePresenceStore(
  config: AppConfig,
): Promise<VoicePresenceStore> {
  if (!config.REDIS_URL) return new MemoryVoicePresenceStore();
  const client = createClient({ url: config.REDIS_URL });
  client.on("error", () => undefined);
  await client.connect();
  const store = new RedisVoicePresenceStore(client);
  await store.healthCheck();
  return store;
}
