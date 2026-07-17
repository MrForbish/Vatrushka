import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresStore } from '../src/db/postgres-store.js';
import { createPresenceStore } from '../src/services/presence-store.js';
import { loadConfig } from '../src/config.js';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const redisUrl = process.env.INTEGRATION_REDIS_URL;

if (!databaseUrl || !redisUrl) {
  throw new Error('INTEGRATION_DATABASE_URL and INTEGRATION_REDIS_URL are required for integration tests');
}

const adminPool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
const postgres = createPostgresStore(databaseUrl);
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
});
