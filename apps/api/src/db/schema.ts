import { boolean, customType, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import type { PermissionOverwriteTargetType, PlatformRole, ServerChannelType, ServerPermission, ServerRoleKind } from '@vatrushka/shared';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    displayName: text('display_name'),
    platformRole: text('platform_role').$type<PlatformRole>().notNull().default('member'),
    passwordHash: text('password_hash'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    totpSecretEncrypted: text('totp_secret_encrypted'),
    twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
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
    credentialHash: text('credential_hash'),
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

export const servers = pgTable(
  'servers',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    inviteCode: text('invite_code').notNull(),
    ownerUserId: uuid('owner_user_id').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex('servers_invite_code_unique').on(table.inviteCode), index('servers_owner_idx').on(table.ownerUserId)],
);

export const serverMembers = pgTable(
  'server_members',
  {
    serverId: uuid('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.serverId, table.userId] }), index('server_members_user_idx').on(table.userId)],
);

export const serverRoles = pgTable(
  'server_roles',
  {
    id: uuid('id').primaryKey(),
    serverId: uuid('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull(),
    position: integer('position').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    kind: text('kind').$type<ServerRoleKind>().notNull().default('CUSTOM'),
    permissions: jsonb('permissions').$type<ServerPermission[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('server_roles_server_position_idx').on(table.serverId, table.position)],
);

export const serverMemberRoles = pgTable(
  'server_member_roles',
  {
    serverId: uuid('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id').notNull().references(() => serverRoles.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.serverId, table.userId, table.roleId] }), index('server_member_roles_role_idx').on(table.roleId)],
);

export const serverChannels = pgTable(
  'server_channels',
  {
    id: uuid('id').primaryKey(),
    serverId: uuid('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').$type<ServerChannelType>().notNull(),
    position: integer('position').notNull(),
    livekitRoomName: text('livekit_room_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('server_channels_server_position_idx').on(table.serverId, table.position), uniqueIndex('server_channels_livekit_name_unique').on(table.livekitRoomName)],
);

export const channelPermissionOverwrites = pgTable(
  'channel_permission_overwrites',
  {
    channelId: uuid('channel_id').notNull().references(() => serverChannels.id, { onDelete: 'cascade' }),
    targetType: text('target_type').$type<PermissionOverwriteTargetType>().notNull(),
    targetId: uuid('target_id').notNull(),
    allow: jsonb('allow').$type<ServerPermission[]>().notNull(),
    deny: jsonb('deny').$type<ServerPermission[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.channelId, table.targetType, table.targetId] }), index('channel_overwrites_target_idx').on(table.targetType, table.targetId)],
);

export const serverAuditLogs = pgTable(
  'server_audit_logs',
  {
    id: uuid('id').primaryKey(),
    serverId: uuid('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('server_audit_logs_server_created_idx').on(table.serverId, table.createdAt), index('server_audit_logs_actor_idx').on(table.actorUserId)],
);

export const textMessages = pgTable(
  'text_messages',
  {
    id: uuid('id').primaryKey(),
    channelId: uuid('channel_id').notNull().references(() => serverChannels.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id').notNull().references(() => users.id),
    content: text('content').notNull(),
    replyToMessageId: uuid('reply_to_message_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
  },
  (table) => [index('text_messages_channel_created_idx').on(table.channelId, table.createdAt), foreignKey({ columns: [table.replyToMessageId], foreignColumns: [table.id], name: 'text_messages_reply_to_message_id_fk' }).onDelete('set null')],
);

export const messageReactions = pgTable(
  'message_reactions',
  {
    messageId: uuid('message_id').notNull().references(() => textMessages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.messageId, table.userId, table.emoji] }), index('message_reactions_message_idx').on(table.messageId)],
);

export const channelReadStates = pgTable(
  'channel_read_states',
  {
    channelId: uuid('channel_id').notNull().references(() => serverChannels.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.channelId, table.userId] }), index('channel_read_states_user_idx').on(table.userId)],
);

export const messageAttachments = pgTable(
  'message_attachments',
  {
    id: uuid('id').primaryKey(),
    messageId: uuid('message_id').notNull().references(() => textMessages.id, { onDelete: 'cascade' }),
    uploaderUserId: uuid('uploader_user_id').notNull().references(() => users.id),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    content: bytea('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('message_attachments_message_idx').on(table.messageId)],
);

export const directConversations = pgTable(
  'direct_conversations',
  {
    id: uuid('id').primaryKey(),
    userAId: uuid('user_a_id').notNull().references(() => users.id),
    userBId: uuid('user_b_id').notNull().references(() => users.id),
    userAReadAt: timestamp('user_a_read_at', { withTimezone: true }).notNull(),
    userBReadAt: timestamp('user_b_read_at', { withTimezone: true }).notNull(),
    userAReadMessageId: uuid('user_a_read_message_id'),
    userBReadMessageId: uuid('user_b_read_message_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex('direct_conversations_pair_unique').on(table.userAId, table.userBId), index('direct_conversations_user_a_idx').on(table.userAId, table.updatedAt), index('direct_conversations_user_b_idx').on(table.userBId, table.updatedAt)],
);

export const directMessages = pgTable(
  'direct_messages',
  {
    id: uuid('id').primaryKey(),
    conversationId: uuid('conversation_id').notNull().references(() => directConversations.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id').notNull().references(() => users.id),
    content: text('content').notNull(),
    replyToMessageId: uuid('reply_to_message_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
  },
  (table) => [index('direct_messages_conversation_created_idx').on(table.conversationId, table.createdAt), foreignKey({ columns: [table.replyToMessageId], foreignColumns: [table.id], name: 'direct_messages_reply_to_message_id_fk' }).onDelete('set null')],
);

export const directMessageReactions = pgTable(
  'direct_message_reactions',
  {
    messageId: uuid('message_id').notNull().references(() => directMessages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.messageId, table.userId, table.emoji] }), index('direct_message_reactions_message_idx').on(table.messageId)],
);

export const directMessageAttachments = pgTable(
  'direct_message_attachments',
  {
    id: uuid('id').primaryKey(),
    messageId: uuid('message_id').notNull().references(() => directMessages.id, { onDelete: 'cascade' }),
    uploaderUserId: uuid('uploader_user_id').notNull().references(() => users.id),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    content: bytea('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('direct_message_attachments_message_idx').on(table.messageId)],
);

export const channelScreenShareLeases = pgTable(
  'channel_screen_share_leases',
  {
    channelId: uuid('channel_id').notNull().references(() => serverChannels.id, { onDelete: 'cascade' }),
    participantIdentity: text('participant_identity').notNull(),
    participantDisplayName: text('participant_display_name').notNull(),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.channelId] }), index('channel_screen_share_lease_expires_idx').on(table.expiresAt)],
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
