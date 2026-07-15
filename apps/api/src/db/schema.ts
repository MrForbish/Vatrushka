import { boolean, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    displayName: text('display_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
);

export const authCodes = pgTable(
  'auth_codes',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    codeHash: text('code_hash').notNull(),
    purpose: text('purpose').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('auth_codes_email_idx').on(table.email), index('auth_codes_expires_at_idx').on(table.expiresAt)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    tokenFamilyId: uuid('token_family_id').notNull(),
    deviceName: text('device_name').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    replacedBySessionId: uuid('replaced_by_session_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_family_id_idx').on(table.tokenFamilyId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
);

export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').primaryKey(),
    code: text('code').notNull(),
    ownerUserId: uuid('owner_user_id').notNull().references(() => users.id),
    livekitRoomName: text('livekit_room_name').notNull(),
    status: text('status').notNull(),
    isLocked: boolean('is_locked').notNull().default(false),
    maxParticipants: integer('max_participants').notNull().default(5),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('rooms_code_unique').on(table.code),
    uniqueIndex('rooms_livekit_name_unique').on(table.livekitRoomName),
    index('rooms_owner_idx').on(table.ownerUserId),
    index('rooms_status_expires_idx').on(table.status, table.expiresAt),
  ],
);

export const guestSessions = pgTable(
  'guest_sessions',
  {
    id: uuid('id').primaryKey(),
    roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('guest_sessions_token_hash_unique').on(table.tokenHash),
    index('guest_sessions_room_idx').on(table.roomId),
    index('guest_sessions_expires_idx').on(table.expiresAt),
  ],
);

export const screenShareLeases = pgTable(
  'screen_share_leases',
  {
    roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
    participantIdentity: text('participant_identity').notNull(),
    participantDisplayName: text('participant_display_name').notNull(),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.roomId] }), index('screen_share_lease_expires_idx').on(table.expiresAt)],
);
