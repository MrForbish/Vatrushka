import { createClient, type RedisClientType } from 'redis';

import type { AppConfig } from '../config.js';
import type { EphemeralPresenceStatus, PresenceStore } from '../ports.js';

interface SessionHeartbeat {
  idle: boolean;
  expiresAt: number;
}

export class MemoryPresenceStore implements PresenceStore {
  private readonly sessions = new Map<string, Map<string, SessionHeartbeat>>();

  healthCheck(): Promise<void> { return Promise.resolve(); }

  heartbeat(userId: string, sessionId: string, idle: boolean, now: Date, ttlSeconds: number): Promise<void> {
    const sessions = this.sessions.get(userId) ?? new Map<string, SessionHeartbeat>();
    sessions.set(sessionId, { idle, expiresAt: now.getTime() + ttlSeconds * 1_000 });
    this.sessions.set(userId, sessions);
    return Promise.resolve();
  }

  removeSession(userId: string, sessionId: string): Promise<void> {
    const sessions = this.sessions.get(userId);
    sessions?.delete(sessionId);
    if (sessions?.size === 0) this.sessions.delete(userId);
    return Promise.resolve();
  }

  status(userId: string, now: Date): Promise<EphemeralPresenceStatus> {
    const sessions = this.sessions.get(userId);
    if (!sessions) return Promise.resolve('offline');
    for (const [sessionId, heartbeat] of sessions) if (heartbeat.expiresAt <= now.getTime()) sessions.delete(sessionId);
    if (sessions.size === 0) {
      this.sessions.delete(userId);
      return Promise.resolve('offline');
    }
    return Promise.resolve([...sessions.values()].some((heartbeat) => !heartbeat.idle) ? 'online' : 'idle');
  }

  close(): Promise<void> {
    this.sessions.clear();
    return Promise.resolve();
  }
}

export class RedisPresenceStore implements PresenceStore {
  constructor(private readonly client: RedisClientType) {}

  private sessionsKey(userId: string): string { return `vatrushka:presence:${userId}:sessions`; }
  private statesKey(userId: string): string { return `vatrushka:presence:${userId}:states`; }

  async healthCheck(): Promise<void> {
    await this.client.ping();
  }

  async heartbeat(userId: string, sessionId: string, idle: boolean, now: Date, ttlSeconds: number): Promise<void> {
    const expiresAt = now.getTime() + ttlSeconds * 1_000;
    await this.client.multi()
      .zAdd(this.sessionsKey(userId), { score: expiresAt, value: sessionId })
      .hSet(this.statesKey(userId), sessionId, idle ? 'idle' : 'online')
      .expire(this.sessionsKey(userId), ttlSeconds * 2)
      .expire(this.statesKey(userId), ttlSeconds * 2)
      .exec();
  }

  async removeSession(userId: string, sessionId: string): Promise<void> {
    await this.client.multi().zRem(this.sessionsKey(userId), sessionId).hDel(this.statesKey(userId), sessionId).exec();
  }

  async status(userId: string, now: Date): Promise<EphemeralPresenceStatus> {
    const sessionsKey = this.sessionsKey(userId);
    const statesKey = this.statesKey(userId);
    const expired = await this.client.zRangeByScore(sessionsKey, 0, now.getTime());
    if (expired.length > 0) await this.client.multi().zRem(sessionsKey, expired).hDel(statesKey, expired).exec();
    const active = await this.client.zRangeByScore(sessionsKey, now.getTime() + 1, Number.POSITIVE_INFINITY);
    if (active.length === 0) return 'offline';
    const states = await this.client.hmGet(statesKey, active);
    return states.some((state) => state === 'online') ? 'online' : 'idle';
  }

  async close(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
  }
}

export async function createPresenceStore(config: AppConfig): Promise<PresenceStore> {
  if (config.PRESENCE_STORAGE_DRIVER === 'memory') return new MemoryPresenceStore();
  const client = createClient({ url: config.REDIS_URL });
  client.on('error', () => undefined);
  await client.connect();
  const store = new RedisPresenceStore(client);
  await store.healthCheck();
  return store;
}
