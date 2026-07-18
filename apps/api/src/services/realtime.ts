import { createClient } from 'redis';

import type { RealtimeEvent, RealtimeEventType } from '@vatrushka/shared';

import type { AppConfig } from '../config.js';
import type { CanonicalMessagingStore, OutboxEventRecord } from './canonical-messaging.js';
import { technicalMetrics } from './metrics.js';

type RedisClient = ReturnType<typeof createClient>;
type EventListener = (event: RealtimeEvent) => void;

export class RedisRealtimeBus {
  private readonly publisher: RedisClient;
  private readonly subscriber: RedisClient;
  private readonly listeners = new Set<EventListener>();
  private readonly channel = 'vatrushka:realtime:v1';

  constructor(redisUrl: string) {
    this.publisher = createClient({ url: redisUrl });
    this.subscriber = this.publisher.duplicate();
    this.publisher.on('error', () => undefined);
    this.subscriber.on('error', () => undefined);
  }

  async start(): Promise<void> {
    await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
    await this.subscriber.subscribe(this.channel, (value) => {
      try {
        const event = JSON.parse(value) as RealtimeEvent;
        for (const listener of this.listeners) listener(event);
      } catch {
        // Invalid Pub/Sub payloads are ignored and never reach clients.
      }
    });
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async publish(event: RealtimeEvent): Promise<boolean> {
    const dedupeKey = `vatrushka:realtime:dedupe:${event.id}`;
    const accepted = await this.publisher.set(dedupeKey, '1', { NX: true, EX: 24 * 60 * 60 });
    if (accepted !== 'OK') return false;
    try {
      await this.publisher.publish(this.channel, JSON.stringify(event));
      return true;
    } catch (error) {
      technicalMetrics.increment('chat_redis_publish_errors_total');
      throw error;
    }
  }

  async registerConnection(userId: string, connectionId: string, deviceId: string): Promise<void> {
    await this.publisher.hSet(`vatrushka:ws:user:${userId}`, connectionId, JSON.stringify({ deviceId, instanceId: process.pid, connectedAt: new Date().toISOString() }));
    await this.publisher.expire(`vatrushka:ws:user:${userId}`, 120);
  }

  async refreshConnection(userId: string): Promise<void> {
    await this.publisher.expire(`vatrushka:ws:user:${userId}`, 120);
  }

  async unregisterConnection(userId: string, connectionId: string): Promise<void> {
    await this.publisher.hDel(`vatrushka:ws:user:${userId}`, connectionId);
  }

  async setTyping(conversationId: string, userId: string, active: boolean): Promise<void> {
    const key = `vatrushka:typing:${conversationId}:${userId}`;
    if (active) await this.publisher.set(key, '1', { EX: 8 });
    else await this.publisher.del(key);
    await this.publish({ id: `typing:${conversationId}:${userId}:${active ? 'start' : 'stop'}:${Date.now()}`, type: active ? 'typing.started' : 'typing.stopped', occurredAt: new Date().toISOString(), conversationId, targetUserIds: [], payload: { conversationId, userId } });
  }

  async setActiveConversation(userId: string, deviceId: string, conversationId: string | null): Promise<void> {
    const key = `vatrushka:active-conversation:${userId}:${deviceId}`;
    if (conversationId) await this.publisher.set(key, conversationId, { EX: 120 });
    else await this.publisher.del(key);
  }

  async publishPresence(userId: string, targetUserIds: string[], payload: Record<string, unknown>): Promise<boolean> {
    const fingerprint = JSON.stringify(payload);
    const stateKey = `vatrushka:realtime:presence-state:${userId}`;
    const previous = await this.publisher.get(stateKey);
    await this.publisher.set(stateKey, fingerprint, { EX: 5 * 60 });
    if (previous === fingerprint) return false;
    return this.publish({ id: `presence:${userId}:${Date.now()}`, type: 'presence.updated', occurredAt: new Date().toISOString(), conversationId: null, targetUserIds: [...new Set(targetUserIds)], payload: { userId, ...payload } });
  }

  async close(): Promise<void> {
    if (this.subscriber.isOpen) await this.subscriber.quit();
    if (this.publisher.isOpen) await this.publisher.quit();
  }
}

export class OutboxWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly store: CanonicalMessagingStore, private readonly bus: RedisRealtimeBus, private readonly intervalMs = 500) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  async drainOnce(): Promise<number> {
    const events = await this.store.claimOutboxBatch(100, new Date());
    for (const event of events) await this.process(event);
    const metrics = await this.store.outboxMetrics(new Date());
    technicalMetrics.set('chat_outbox_pending_total', metrics.pending);
    technicalMetrics.set('chat_outbox_failed_total', metrics.failed);
    technicalMetrics.set('chat_outbox_oldest_age_seconds', metrics.oldestAgeSeconds);
    return events.length;
  }

  private async tick(): Promise<void> {
    try {
      await this.drainOnce();
    } catch {
      // The next poll retries; durable state remains in PostgreSQL.
    } finally {
      if (this.running) this.timer = setTimeout(() => void this.tick(), this.intervalMs);
    }
  }

  private async process(event: OutboxEventRecord): Promise<void> {
    try {
      const recipientIds = Array.isArray(event.payload.recipientIds) ? event.payload.recipientIds.filter((value): value is string => typeof value === 'string') : [];
      if (event.eventType === 'conversation.read_state.updated' && typeof event.payload.userId === 'string') recipientIds.push(event.payload.userId);
      const conversationId = typeof event.payload.conversationId === 'string' ? event.payload.conversationId : event.aggregateType === 'conversation' ? event.aggregateId : null;
      await this.bus.publish({
        id: `outbox:${event.id}`,
        type: event.eventType as RealtimeEventType,
        occurredAt: event.createdAt.toISOString(),
        conversationId,
        targetUserIds: recipientIds,
        payload: event.payload,
      });
      await this.store.completeOutboxEvent(event.id, new Date());
    } catch (error) {
      await this.store.retryOutboxEvent(event.id, event.attempts, error instanceof Error ? error.message : 'Unknown realtime publish error', new Date());
    }
  }
}

export async function createRealtimeBus(config: AppConfig): Promise<RedisRealtimeBus | null> {
  if (!config.REDIS_URL) return null;
  const bus = new RedisRealtimeBus(config.REDIS_URL);
  await bus.start();
  return bus;
}
