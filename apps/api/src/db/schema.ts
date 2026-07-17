import { bigint, boolean, customType, foreignKey, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import type { DirectMessagePrivacy, HomeActivityType, PermissionOverwriteTargetType, PlatformRole, PresencePreference, PresenceVisibility, SecurityEventType, ServerChannelType, ServerPermission, ServerRoleKind } from '@vatrushka/shared';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export const conversationType = pgEnum('conversation_type', ['server_channel', 'direct', 'group_direct']);
export const conversationMentionType = pgEnum('conversation_mention_type', ['user', 'role', 'everyone']);
export const notificationType = pgEnum('notification_type', ['direct_message', 'mention', 'reply', 'server_invite', 'moderation', 'system']);

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
    presencePreference: text('presence_preference').$type<PresencePreference>().notNull().default('online'),
    customStatusText: text('custom_status_text'),
    customStatusExpiresAt: timestamp('custom_status_expires_at', { withTimezone: true }),
    directMessagePrivacy: text('direct_message_privacy').$type<DirectMessagePrivacy>().notNull().default('shared_servers'),
    presenceVisibility: text('presence_visibility').$type<PresenceVisibility>().notNull().default('shared_servers'),
    activityVisible: boolean('activity_visible').notNull().default(true),
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
    trustedAt: timestamp('trusted_at', { withTimezone: true }),
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

export const userRecoveryCodes = pgTable(
  'user_recovery_codes',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (table) => [uniqueIndex('user_recovery_codes_hash_unique').on(table.codeHash), index('user_recovery_codes_user_idx').on(table.userId)],
);

export const securityEvents = pgTable(
  'security_events',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<SecurityEventType>().notNull(),
    deviceName: text('device_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('security_events_user_created_idx').on(table.userId, table.createdAt)],
);

export const servers = pgTable(
  'servers',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    inviteToken: text('invite_code').notNull(),
    ownerUserId: uuid('owner_user_id').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex('servers_invite_code_unique').on(table.inviteToken), index('servers_owner_idx').on(table.ownerUserId)],
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

export const userActivity = pgTable(
  'user_activity',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<HomeActivityType>().notNull(),
    title: text('title').notNull(),
    context: text('context').notNull(),
    serverId: uuid('server_id').references(() => servers.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id').references(() => serverChannels.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('user_activity_user_created_idx').on(table.userId, table.createdAt)],
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

export const messageMentions = pgTable(
  'message_mentions',
  {
    messageId: uuid('message_id').notNull().references(() => textMessages.id, { onDelete: 'cascade' }),
    mentionedUserId: uuid('mentioned_user_id').notNull().references(() => users.id),
    start: integer('start').notNull(),
    length: integer('length').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.start] }),
    index('message_mentions_message_idx').on(table.messageId),
    index('message_mentions_user_idx').on(table.mentionedUserId, table.messageId),
  ],
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
    storageKey: text('storage_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('message_attachments_message_idx').on(table.messageId), uniqueIndex('message_attachments_storage_key_unique').on(table.storageKey)],
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
    storageKey: text('storage_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('direct_message_attachments_message_idx').on(table.messageId), uniqueIndex('direct_message_attachments_storage_key_unique').on(table.storageKey)],
);

// Canonical messaging model. Legacy text/direct tables remain mapped above for one
// compatibility release and are migrated through the explicit backfill migration.
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey(),
    type: conversationType('type').notNull(),
    serverId: uuid('server_id').references(() => servers.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id').references(() => serverChannels.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('conversations_channel_unique').on(table.channelId),
    index('conversations_server_updated_idx').on(table.serverId, table.updatedAt),
    index('conversations_type_updated_idx').on(table.type, table.updatedAt),
  ],
);

export const conversationMembers = pgTable(
  'conversation_members',
  {
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
    notificationsMutedUntil: timestamp('notifications_muted_until', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.userId] }),
    index('conversation_members_user_active_idx').on(table.userId, table.leftAt),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').notNull().references(() => users.id),
    content: text('content').notNull().default(''),
    replyToMessageId: bigint('reply_to_message_id', { mode: 'bigint' }),
    clientMessageId: uuid('client_message_id').notNull(),
    legacyTextMessageId: uuid('legacy_text_message_id'),
    legacyDirectMessageId: uuid('legacy_direct_message_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [
    uniqueIndex('messages_author_client_message_unique').on(table.authorId, table.clientMessageId),
    uniqueIndex('messages_legacy_text_unique').on(table.legacyTextMessageId),
    uniqueIndex('messages_legacy_direct_unique').on(table.legacyDirectMessageId),
    index('messages_conversation_history_idx').on(table.conversationId, table.id),
    index('messages_author_history_idx').on(table.authorId, table.id),
    foreignKey({ columns: [table.replyToMessageId], foreignColumns: [table.id], name: 'messages_reply_to_message_id_fk' }).onDelete('set null'),
  ],
);

export const conversationMessageAttachments = pgTable(
  'conversation_message_attachments',
  {
    id: uuid('id').primaryKey(),
    messageId: bigint('message_id', { mode: 'bigint' }).references(() => messages.id, { onDelete: 'cascade' }),
    uploaderUserId: uuid('uploader_user_id').notNull().references(() => users.id),
    objectKey: text('object_key').notNull(),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'bigint' }).notNull(),
    width: integer('width'),
    height: integer('height'),
    durationMs: integer('duration_ms'),
    previewObjectKey: text('preview_object_key'),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('conversation_message_attachments_object_key_unique').on(table.objectKey),
    index('conversation_message_attachments_message_idx').on(table.messageId),
    index('conversation_message_attachments_uploader_idx').on(table.uploaderUserId, table.createdAt),
  ],
);

export const conversationMessageReactions = pgTable(
  'conversation_message_reactions',
  {
    messageId: bigint('message_id', { mode: 'bigint' }).notNull().references(() => messages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.userId, table.emoji] }),
    index('conversation_message_reactions_message_idx').on(table.messageId),
  ],
);

export const conversationMessageMentions = pgTable(
  'conversation_message_mentions',
  {
    id: uuid('id').primaryKey(),
    messageId: bigint('message_id', { mode: 'bigint' }).notNull().references(() => messages.id, { onDelete: 'cascade' }),
    type: conversationMentionType('mention_type').notNull(),
    mentionedUserId: uuid('mentioned_user_id').references(() => users.id, { onDelete: 'cascade' }),
    mentionedRoleId: uuid('mentioned_role_id').references(() => serverRoles.id, { onDelete: 'cascade' }),
    start: integer('start'),
    length: integer('length'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('conversation_message_mentions_message_idx').on(table.messageId),
    index('conversation_message_mentions_user_idx').on(table.mentionedUserId, table.messageId),
    index('conversation_message_mentions_role_idx').on(table.mentionedRoleId, table.messageId),
  ],
);

export const conversationReadStates = pgTable(
  'conversation_read_states',
  {
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    lastDeliveredMessageId: bigint('last_delivered_message_id', { mode: 'bigint' }).references(() => messages.id, { onDelete: 'set null' }),
    lastReadMessageId: bigint('last_read_message_id', { mode: 'bigint' }).references(() => messages.id, { onDelete: 'set null' }),
    lastDeliveredAt: timestamp('last_delivered_at', { withTimezone: true }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    mentionCount: integer('mention_count').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.userId] }),
    index('conversation_read_states_user_idx').on(table.userId),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: notificationType('type').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }),
    messageId: bigint('message_id', { mode: 'bigint' }).references(() => messages.id, { onDelete: 'cascade' }),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  },
  (table) => [
    index('notifications_user_created_idx').on(table.userId, table.createdAt),
    index('notifications_conversation_idx').on(table.conversationId, table.createdAt),
  ],
);

export const userNotificationPreferences = pgTable(
  'user_notification_preferences',
  {
    userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
    desktopEnabled: boolean('desktop_enabled').notNull().default(true),
    soundEnabled: boolean('sound_enabled').notNull().default(true),
    showPreview: boolean('show_preview').notNull().default(true),
    directMessagesEnabled: boolean('direct_messages_enabled').notNull().default(true),
    mentionsEnabled: boolean('mentions_enabled').notNull().default(true),
    quietHoursStart: text('quiet_hours_start'),
    quietHoursEnd: text('quiet_hours_end'),
    quietHoursTimezone: text('quiet_hours_timezone'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const serverNotificationPreferences = pgTable(
  'server_notification_preferences',
  {
    serverId: uuid('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    level: text('level').notNull().default('mentions'),
    mutedUntil: timestamp('muted_until', { withTimezone: true }),
    suppressEveryone: boolean('suppress_everyone').notNull().default(false),
    suppressRoles: boolean('suppress_roles').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.serverId, table.userId] }), index('server_notification_preferences_user_idx').on(table.userId)],
);

export const conversationNotificationPreferences = pgTable(
  'conversation_notification_preferences',
  {
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    level: text('level').notNull().default('mentions'),
    mutedUntil: timestamp('muted_until', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.conversationId, table.userId] }), index('conversation_notification_preferences_user_idx').on(table.userId)],
);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    eventType: text('event_type').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (table) => [index('outbox_events_available_idx').on(table.availableAt, table.id)],
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
