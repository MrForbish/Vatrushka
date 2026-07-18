import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresStore } from '../src/db/postgres-store.js';
import { createPresenceStore } from '../src/services/presence-store.js';
import { createCanonicalMessagingStore } from '../src/services/canonical-messaging.js';
import { OutboxWorker, RedisRealtimeBus } from '../src/services/realtime.js';
import { createServerSettingsStore } from '../src/services/server-settings.js';
import { createIdentitySettingsStore } from '../src/services/identity-settings.js';
import { loadConfig } from '../src/config.js';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const redisUrl = process.env.INTEGRATION_REDIS_URL;

if (!databaseUrl || !redisUrl) {
  throw new Error('INTEGRATION_DATABASE_URL and INTEGRATION_REDIS_URL are required for integration tests');
}

const adminPool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
const postgres = createPostgresStore(databaseUrl);
const messaging = createCanonicalMessagingStore(databaseUrl);
const serverSettings = createServerSettingsStore(databaseUrl);
const identitySettings = createIdentitySettingsStore(databaseUrl);
const presence = await createPresenceStore(loadConfig({
  NODE_ENV: 'test',
  PRESENCE_STORAGE_DRIVER: 'redis',
  REDIS_URL: redisUrl,
}));
const realtime = new RedisRealtimeBus(redisUrl);
await realtime.start();

beforeAll(async () => {
  await adminPool.query('drop schema if exists public cascade');
  await adminPool.query('create schema public');
  await migrate(drizzle(adminPool), {
    migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
  });
});

afterAll(async () => {
  await presence.close();
  await realtime.close();
  await postgres.close();
  await messaging.close();
  await serverSettings.close();
  await identitySettings.close();
  await adminPool.end();
});

describe('production infrastructure adapters', () => {
  it('applies every PostgreSQL migration and exposes the expected contract', async () => {
    const result = await adminPool.query<{ table_name: string }>(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
      order by table_name
    `);

    expect(result.rows.map((row) => row.table_name)).toEqual(expect.arrayContaining([
      'users',
      'servers',
      'server_channels',
      'conversations',
      'conversation_members',
      'messages',
      'conversation_read_states',
      'notifications',
      'outbox_events',
      'blocked_users',
      'server_channel_categories',
      'server_invites',
      'server_bans',
      'text_messages',
      'direct_conversations',
      'direct_messages',
    ]));
    await expect(postgres.store.healthCheck()).resolves.toBeUndefined();
  });

  it('enforces canonical conversation and idempotency invariants', async () => {
    const rows = await adminPool.query<{ constraint_name: string }>(`
      select constraint_name
      from information_schema.table_constraints
      where table_schema = 'public'
        and table_name in ('conversations', 'conversation_message_mentions', 'messages')
    `);

    expect(rows.rows.map((row) => row.constraint_name)).toEqual(expect.arrayContaining([
      'conversations_shape_check',
      'conversation_message_mentions_target_check',
    ]));
    const indexes = await adminPool.query<{ indexname: string }>("select indexname from pg_indexes where schemaname = 'public' and tablename = 'messages'");
    expect(indexes.rows.map((row) => row.indexname)).toContain('messages_author_client_message_unique');
  });

  it('keeps get-or-create user idempotent under concurrent PostgreSQL writes', async () => {
    const now = new Date('2026-07-18T00:00:00.000Z');
    const email = `${randomUUID()}@integration.vatrushka.test`;
    const results = await Promise.all(Array.from({ length: 8 }, () => postgres.store.getOrCreateUser(email, now)));

    expect(new Set(results.map(({ user }) => user.id))).toHaveLength(1);
    expect(results.filter(({ isNewUser }) => isNewUser)).toHaveLength(1);
  });

  it('aggregates and expires presence sessions in Redis', async () => {
    const userId = randomUUID();
    const now = new Date('2026-07-18T10:00:00.000Z');
    await presence.heartbeat(userId, 'desktop', true, now, 75);
    await presence.heartbeat(userId, 'laptop', false, now, 75);

    await expect(presence.status(userId, now)).resolves.toBe('online');
    await presence.removeSession(userId, 'laptop');
    await expect(presence.status(userId, now)).resolves.toBe('idle');
    await expect(presence.status(userId, new Date(now.getTime() + 76_000))).resolves.toBe('offline');
  });

  it('persists idempotent messages, monotonic read state, notifications, and soft deletes', async () => {
    const now = new Date('2026-07-18T12:00:00.000Z');
    const first = (await postgres.store.getOrCreateUser(`${randomUUID()}@integration.test`, now)).user;
    const second = (await postgres.store.getOrCreateUser(`${randomUUID()}@integration.test`, now)).user;
    const third = (await postgres.store.getOrCreateUser(`${randomUUID()}@integration.test`, now)).user;
    const serverId = randomUUID();
    await adminPool.query('insert into servers (id, name, invite_code, owner_user_id, created_at, updated_at) values ($1, $2, $3, $4, $5, $5)', [serverId, 'Integration', randomUUID(), first.id, now]);
    await adminPool.query('insert into server_members (server_id, user_id, joined_at) values ($1, $2, $5), ($1, $3, $5), ($1, $4, $5)', [serverId, first.id, second.id, third.id, now]);
    const direct = await messaging.getOrCreateDirectConversation(first.id, second.id, now);
    expect(direct.allowed).toBe(true);

    const clientMessageId = randomUUID();
    const created = await messaging.createMessage({ conversationId: direct.conversation.id, authorId: first.id, clientMessageId, content: 'hello', replyToMessageId: null, attachmentIds: [], mentions: [], now });
    const retried = await messaging.createMessage({ conversationId: direct.conversation.id, authorId: first.id, clientMessageId, content: 'duplicate', replyToMessageId: null, attachmentIds: [], mentions: [], now });
    expect(created.created).toBe(true);
    expect(retried.created).toBe(false);
    expect(retried.message.id).toBe(created.message.id);
    expect(await messaging.listNotifications(second.id, null, 10, true)).toHaveLength(1);

    const state = await messaging.updateReadState(direct.conversation.id, second.id, created.message.id, created.message.id, now);
    const stale = await messaging.updateReadState(direct.conversation.id, second.id, created.message.id, created.message.id, new Date(now.getTime() + 1_000));
    expect(stale?.lastReadMessageId).toBe(state?.lastReadMessageId);
    expect(await messaging.listReadStates(direct.conversation.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: first.id, lastReadMessageId: null }),
      expect.objectContaining({ userId: second.id, lastReadMessageId: created.message.id }),
    ]));
    expect(await messaging.listNotifications(second.id, null, 10, true)).toHaveLength(0);
    const mentioned = await messaging.createMessage({ conversationId: direct.conversation.id, authorId: first.id, clientMessageId: randomUUID(), content: 'hello @second', replyToMessageId: created.message.id, attachmentIds: [], mentions: [{ type: 'user', userId: second.id, start: 6, length: 7 }], now: new Date(now.getTime() + 1_500) });
    const reply = await messaging.createMessage({ conversationId: direct.conversation.id, authorId: second.id, clientMessageId: randomUUID(), content: 'reply to first', replyToMessageId: created.message.id, attachmentIds: [], mentions: [], now: new Date(now.getTime() + 1_550) });
    const unread = await messaging.unreadSummary(second.id);
    expect(unread.conversations.find((item) => item.conversationId === direct.conversation.id)?.mentionCount).toBe(1);
    expect((await messaging.unreadSummary(first.id)).totalReplyUnread).toBe(1);
    await messaging.updateReadState(direct.conversation.id, first.id, reply.message.id, reply.message.id, new Date(now.getTime() + 1_575));
    expect((await messaging.unreadSummary(first.id)).totalReplyUnread).toBe(0);
    const preferences = await messaging.updateNotificationPreferences(second.id, { desktopEnabled: false, soundEnabled: true, previewMode: 'sender_only', directMessagesEnabled: true, mentionsEnabled: true, quietHoursStart: '22:00', quietHoursEnd: '08:00', quietHoursTimezone: 'Europe/Moscow' }, now);
    expect((await messaging.getNotificationPreferences(second.id, now)).previewMode).toBe('sender_only');
    expect(preferences.desktopEnabled).toBe(false);
    const channelId = randomUUID();
    const roleId = randomUUID();
    await adminPool.query("insert into server_channels (id, server_id, name, type, position, created_at, updated_at) values ($1, $2, 'mentions', 'text', 0, $3, $3)", [channelId, serverId, now]);
    await adminPool.query("insert into conversations (id, type, server_id, channel_id, created_by_user_id, created_at, updated_at) values ($1, 'server_channel', $2, $1, $3, $4, $4)", [channelId, serverId, first.id, now]);
    await adminPool.query("insert into server_roles (id, server_id, name, color, position, is_default, kind, permissions, created_at, updated_at) values ($1, $2, 'Developers', '#5865f2', 10, false, 'CUSTOM', '[]'::jsonb, $3, $3)", [roleId, serverId, now]);
    await adminPool.query('insert into server_member_roles (server_id, user_id, role_id) values ($1, $2, $3)', [serverId, second.id, roleId]);
    expect(await messaging.getServerNotificationPreferences(serverId, second.id, now)).toMatchObject({ level: 'mentions', suppressEveryone: false });
    await messaging.createMessage({ conversationId: channelId, authorId: first.id, clientMessageId: randomUUID(), content: '@Developers deploy', replyToMessageId: null, attachmentIds: [], mentions: [{ type: 'role', roleId, start: 0, length: 11 }], now: new Date(now.getTime() + 1_600) });
    expect((await messaging.listNotifications(second.id, null, 20, true)).some((notification) => notification.type === 'mention' && notification.conversationId === channelId)).toBe(true);
    await messaging.createMessage({ conversationId: channelId, authorId: first.id, clientMessageId: randomUUID(), content: '@everyone release', replyToMessageId: null, attachmentIds: [], mentions: [{ type: 'everyone', start: 0, length: 9 }], now: new Date(now.getTime() + 1_700) });
    expect((await messaging.listNotifications(third.id, null, 20, true)).some((notification) => notification.type === 'mention' && notification.conversationId === channelId)).toBe(true);
    await messaging.updateServerNotificationPreferences(serverId, second.id, { level: 'all', mutedUntil: null, suppressEveryone: false, suppressRoles: false }, new Date(now.getTime() + 1_710));
    await messaging.updateConversationNotificationPreferences(channelId, second.id, { level: 'all', mutedUntil: null }, new Date(now.getTime() + 1_720));
    await messaging.createMessage({ conversationId: channelId, authorId: first.id, clientMessageId: randomUUID(), content: 'ordinary update', replyToMessageId: null, attachmentIds: [], mentions: [], now: new Date(now.getTime() + 1_730) });
    expect((await messaging.listNotifications(second.id, null, 30, true)).some((notification) => notification.type === 'message' && notification.conversationId === channelId)).toBe(true);
    await messaging.updateReadState(direct.conversation.id, second.id, mentioned.message.id, mentioned.message.id, new Date(now.getTime() + 1_800));
    expect((await messaging.unreadSummary(second.id)).totalReplyUnread).toBe(0);
    expect(await messaging.softDeleteMessage(created.message.id, first.id, false, new Date(now.getTime() + 2_000))).toBe(true);
    expect((await messaging.findMessage(created.message.id, second.id))?.deletedAt).not.toBeNull();
    const staleAttachmentId = randomUUID();
    const staleObjectKey = `integration/stale/${staleAttachmentId}`;
    await messaging.createAttachmentIntent({ id: staleAttachmentId, uploaderUserId: first.id, objectKey: staleObjectKey, originalName: 'stale.txt', mimeType: 'text/plain', sizeBytes: '5', width: null, height: null, durationMs: null, createdAt: now });
    expect(await messaging.scheduleStaleAttachmentCleanup(new Date(now.getTime() + 1), new Date(now.getTime() + 2_500))).toBe(1);
    const deletionJobs = await messaging.claimObjectDeletionBatch(10, new Date(now.getTime() + 2_500));
    expect(deletionJobs).toEqual(expect.arrayContaining([expect.objectContaining({ objectKey: staleObjectKey, attempts: 1 })]));
    await messaging.completeObjectDeletion(deletionJobs.find((job) => job.objectKey === staleObjectKey)!.id, new Date(now.getTime() + 2_600));
  });

  it('persists versioned server settings and constrained invite links', async () => {
    const now = new Date('2026-07-18T13:00:00.000Z');
    const owner = (await postgres.store.getOrCreateUser(`${randomUUID()}@settings.integration.test`, now)).user;
    const serverId = randomUUID();
    const channelId = randomUUID();
    await adminPool.query('insert into servers (id, name, invite_code, owner_user_id, created_at, updated_at) values ($1, $2, $3, $4, $5, $5)', [serverId, 'Settings', randomUUID(), owner.id, now]);
    await adminPool.query('insert into server_members (server_id, user_id, joined_at) values ($1, $2, $3)', [serverId, owner.id, now]);
    await adminPool.query("insert into server_channels (id, server_id, name, type, position, created_at, updated_at) values ($1, $2, 'general', 'text', 0, $3, $3)", [channelId, serverId, now]);

    const initial = await serverSettings.getOverview(serverId);
    expect(initial?.version).toBe(1);
    const updated = await serverSettings.updateOverview(serverId, { name: 'Updated settings', description: 'Description', language: 'ru', timezone: 'Europe/Moscow', systemChannelId: channelId, welcomeChannelId: channelId, defaultNotificationLevel: 'mentions', defaultVoiceInactivitySeconds: 600, version: 1 }, new Date(now.getTime() + 1_000));
    expect(updated).toMatchObject({ name: 'Updated settings', version: 2, systemChannelId: channelId });
    await expect(serverSettings.updateOverview(serverId, { name: 'Stale', description: null, language: 'ru', timezone: 'UTC', systemChannelId: null, welcomeChannelId: null, defaultNotificationLevel: 'none', defaultVoiceInactivitySeconds: 0, version: 1 }, now)).resolves.toBeNull();

    const rawToken = randomUUID();
    const created = await serverSettings.createInvite({ id: randomUUID(), serverId, actorUserId: owner.id, destinationChannelId: channelId, tokenHash: rawToken, tokenPreview: '…token', expiresAt: new Date(now.getTime() + 60_000), maxUses: 1, now });
    expect(created.destinationChannelId).toBe(channelId);
    await expect(serverSettings.consumeInvite(rawToken, now)).resolves.toMatchObject({ serverId, destinationChannelId: channelId });
    await expect(serverSettings.consumeInvite(rawToken, now)).resolves.toBeNull();
  });

  it('persists profile, blocking, email change, and delayed anonymization', async () => {
    const now = new Date('2026-07-18T14:00:00.000Z');
    const first = (await postgres.store.getOrCreateUser(`${randomUUID()}@identity.integration.test`, now)).user;
    const second = (await postgres.store.getOrCreateUser(`${randomUUID()}@identity.integration.test`, now)).user;
    expect((await identitySettings.updateProfile(first.id, { displayName: 'Identity User', username: `user_${first.id.slice(0, 8)}`, bio: 'Bio' }, now)).updated).toBe(true);
    expect(await identitySettings.getProfile(first.id, async (key) => key)).toMatchObject({ displayName: 'Identity User', bio: 'Bio' });
    expect(await identitySettings.blockUser(first.id, second.id, now)).toBe(true);
    expect(await identitySettings.listBlockedUsers(first.id)).toHaveLength(1);

    const pendingEmail = `${randomUUID()}@changed.integration.test`;
    await identitySettings.createPendingEmailChange({ id: randomUUID(), userId: first.id, newEmail: pendingEmail, codeHash: 'hash', expiresAt: new Date(now.getTime() + 60_000), now });
    await expect(identitySettings.confirmEmailChange(first.id, 'hash', now)).resolves.toBe(pendingEmail);
    expect(await identitySettings.exportPersonalData(first.id)).toMatchObject({ profile: expect.objectContaining({ email: pendingEmail }) });

    expect(await identitySettings.scheduleDeactivation(first.id, now)).toBe(true);
    await adminPool.query("update users set deactivation_scheduled_at = $2::timestamptz - interval '15 days' where id = $1", [first.id, now]);
    expect(await identitySettings.anonymizeDueAccounts(now)).toBe(1);
    const deleted = await adminPool.query<{ display_name: string; deleted_at: Date | null }>('select display_name, deleted_at from users where id = $1', [first.id]);
    expect(deleted.rows[0]).toMatchObject({ display_name: 'Удалённый пользователь', deleted_at: expect.any(Date) });
  });

  it('publishes the transactional outbox through Redis with deduplication', async () => {
    const received = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Realtime event timeout')), 5_000);
      const unsubscribe = realtime.onEvent((event) => {
        if (!event.id.startsWith('outbox:')) return;
        clearTimeout(timeout);
        unsubscribe();
        resolve(event.id);
      });
    });
    const worker = new OutboxWorker(messaging, realtime);
    await adminPool.query('update outbox_events set available_at = now() where processed_at is null and failed_at is null');
    expect(await worker.drainOnce()).toBeGreaterThan(0);
    await expect(received).resolves.toMatch(/^outbox:/u);
    const pending = await adminPool.query<{ count: number }>('select count(*)::int as count from outbox_events where processed_at is null and failed_at is null');
    expect(pending.rows[0]?.count).toBe(0);
  });

  it('fans Redis Pub/Sub events across backend instances and deduplicates event ids', async () => {
    const secondInstance = new RedisRealtimeBus(redisUrl);
    await secondInstance.start();
    try {
      const eventId = `integration:${randomUUID()}`;
      const received = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Cross-instance event timeout')), 5_000);
        const unsubscribe = secondInstance.onEvent((event) => {
          if (event.id !== eventId) return;
          clearTimeout(timeout);
          unsubscribe();
          resolve(event.id);
        });
      });
      const event = { id: eventId, type: 'message.created' as const, occurredAt: new Date().toISOString(), conversationId: null, targetUserIds: [], payload: {} };
      await expect(realtime.publish(event)).resolves.toBe(true);
      await expect(received).resolves.toBe(eventId);
      await expect(realtime.publish(event)).resolves.toBe(false);
    } finally {
      await secondInstance.close();
    }
  });
});
