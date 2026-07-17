import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresStore } from '../src/db/postgres-store.js';
import { createPresenceStore } from '../src/services/presence-store.js';
import { createCanonicalMessagingStore } from '../src/services/canonical-messaging.js';
import { loadConfig } from '../src/config.js';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const redisUrl = process.env.INTEGRATION_REDIS_URL;

if (!databaseUrl || !redisUrl) {
  throw new Error('INTEGRATION_DATABASE_URL and INTEGRATION_REDIS_URL are required for integration tests');
}

const adminPool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
const postgres = createPostgresStore(databaseUrl);
const messaging = createCanonicalMessagingStore(databaseUrl);
const presence = await createPresenceStore(loadConfig({
  NODE_ENV: 'test',
  PRESENCE_STORAGE_DRIVER: 'redis',
  REDIS_URL: redisUrl,
}));

beforeAll(async () => {
  await adminPool.query('drop schema if exists public cascade');
  await adminPool.query('create schema public');
  await migrate(drizzle(adminPool), {
    migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
  });
});

afterAll(async () => {
  await presence.close();
  await postgres.close();
  await messaging.close();
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
      'messages_author_client_message_unique',
    ]));
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
    const serverId = randomUUID();
    await adminPool.query('insert into servers (id, name, invite_code, owner_user_id, created_at, updated_at) values ($1, $2, $3, $4, $5, $5)', [serverId, 'Integration', randomUUID(), first.id, now]);
    await adminPool.query('insert into server_members (server_id, user_id, joined_at) values ($1, $2, $4), ($1, $3, $4)', [serverId, first.id, second.id, now]);
    const direct = await messaging.getOrCreateDirectConversation(first.id, second.id, now);
    expect(direct.allowed).toBe(true);

    const clientMessageId = randomUUID();
    const created = await messaging.createMessage({ conversationId: direct.conversation.id, authorId: first.id, clientMessageId, content: 'hello', replyToMessageId: null, attachmentIds: [], mentions: [], now });
    const retried = await messaging.createMessage({ conversationId: direct.conversation.id, authorId: first.id, clientMessageId, content: 'duplicate', replyToMessageId: null, attachmentIds: [], mentions: [], now });
    expect(created.created).toBe(true);
    expect(retried.created).toBe(false);
    expect(retried.message.id).toBe(created.message.id);

    const state = await messaging.updateReadState(direct.conversation.id, second.id, created.message.id, created.message.id, now);
    const stale = await messaging.updateReadState(direct.conversation.id, second.id, created.message.id, created.message.id, new Date(now.getTime() + 1_000));
    expect(stale?.lastReadMessageId).toBe(state?.lastReadMessageId);
    expect(await messaging.listNotifications(second.id, null, 10, true)).toHaveLength(1);
    expect(await messaging.softDeleteMessage(created.message.id, first.id, false, new Date(now.getTime() + 2_000))).toBe(true);
    expect((await messaging.findMessage(created.message.id, second.id))?.deletedAt).not.toBeNull();
  });
});
