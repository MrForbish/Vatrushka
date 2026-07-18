import { z } from 'zod';

import { serverPermissions } from './contracts.js';

const controlCharacterPattern = /[\p{Cc}\p{Cf}]/u;
const displayNamePattern = /^[\p{L}\p{M}\p{N} _-]+$/u;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Некорректный формат email')
  .max(254, 'Email слишком длинный');

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, 'Имя должно содержать минимум 2 символа')
  .max(30, 'Имя должно содержать не более 30 символов')
  .refine((value) => !controlCharacterPattern.test(value), 'Управляющие символы запрещены')
  .refine((value) => displayNamePattern.test(value), 'Разрешены буквы, цифры, пробел, дефис и подчёркивание');

export const otpCodeSchema = z.string().regex(/^\d{6}$/, 'Код должен содержать 6 цифр');
export const recoveryCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){2}$/, 'Некорректный резервный код');
export const passwordSchema = z
  .string()
  .min(10, 'Пароль должен содержать минимум 10 символов')
  .max(128, 'Пароль должен содержать не более 128 символов')
  .refine((value) => /\p{L}/u.test(value) && /\p{N}/u.test(value), 'Пароль должен содержать букву и цифру');
export const uuidSchema = z.uuid();

export const requestRegistrationSchema = z.object({ email: emailSchema, password: passwordSchema }).strict();
export const verifyRegistrationSchema = z.object({ email: emailSchema, code: otpCodeSchema, deviceName: z.string().trim().min(1).max(100) }).strict();
export const beginPasswordLoginSchema = z.object({ email: emailSchema, password: passwordSchema, factor: z.enum(['auto', 'email', 'totp', 'recovery']).default('auto') }).strict();
export const completePasswordLoginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  code: z.string().trim().toUpperCase().min(6).max(32),
  factor: z.enum(['email', 'totp', 'recovery']),
  deviceName: z.string().trim().min(1).max(100),
}).strict().superRefine((value, context) => {
  const result = value.factor === 'recovery' ? recoveryCodeSchema.safeParse(value.code) : otpCodeSchema.safeParse(value.code);
  if (!result.success) context.addIssue({ code: 'custom', path: ['code'], message: result.error.issues[0]?.message ?? 'Некорректный код' });
});
export const setPasswordSchema = z.object({ code: otpCodeSchema, password: passwordSchema }).strict();
export const twoFactorCodeSchema = z.object({ code: otpCodeSchema }).strict();
export const sessionTrustSchema = z.object({ trusted: z.boolean() }).strict();
export const refreshSchema = z.object({ refreshToken: z.string().min(32).max(512) }).strict();
export const updateProfileSchema = z.object({ displayName: displayNameSchema }).strict();
export const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,32}$/u, 'Username: 3–32 символа, латиница, цифры и подчёркивание');
export const updateUserProfileSettingsSchema = z.object({
  displayName: displayNameSchema,
  username: usernameSchema.nullable(),
  bio: z.string().trim().max(280).nullable(),
}).strict();
export const userAvatarUploadIntentSchema = z.object({ mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']), sizeBytes: z.number().int().positive().max(5 * 1024 * 1024) }).strict();
export const updateUserAvatarSchema = z.object({ objectKey: z.string().trim().min(1).max(512).nullable() }).strict();
export const requestEmailChangeSchema = z.object({ email: emailSchema, password: passwordSchema, totpCode: otpCodeSchema.nullable().default(null) }).strict();
export const confirmEmailChangeSchema = z.object({ code: otpCodeSchema }).strict();
export const accountReauthenticationSchema = z.object({ password: passwordSchema, totpCode: otpCodeSchema.nullable().default(null) }).strict();
export const presencePreferenceSchema = z.enum(['online', 'idle', 'do_not_disturb', 'invisible']);
export const updatePresenceSchema = z.object({
  preference: presencePreferenceSchema,
  customText: z.string().trim().max(128, 'Статус должен содержать не более 128 символов').nullable().default(null),
  customTextExpiresAt: z.iso.datetime().nullable().default(null),
}).strict();
export const presenceHeartbeatSchema = z.object({ idle: z.boolean() }).strict();
export const updatePrivacySettingsSchema = z.object({
  directMessages: z.enum(['shared_servers', 'nobody']),
  presenceVisibility: z.enum(['shared_servers', 'nobody']),
  activityVisible: z.boolean(),
}).strict();
export const screenShareActionSchema = z
  .object({ participantIdentity: z.string().min(3).max(200) })
  .strict();

export const serverNameSchema = z.string().trim().min(2).max(60).refine((value) => !controlCharacterPattern.test(value));
export const channelNameSchema = z.string().trim().toLowerCase().min(1).max(50).regex(/^[\p{L}\p{N}_ -]+$/u);
export const roleNameSchema = z.string().trim().min(1).max(40).refine((value) => !controlCharacterPattern.test(value));
export const inviteTokenSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{8,32}$/u);
export const messageContentSchema = z.string().trim().min(1).max(4_000).refine((value) => !controlCharacterPattern.test(value));
export const newMessageContentSchema = z.string().trim().max(4_000).refine((value) => !controlCharacterPattern.test(value));
export const messageReactionSchema = z.string().trim().min(1).max(32).refine((value) => !controlCharacterPattern.test(value));
export const createServerSchema = z.object({ name: serverNameSchema }).strict();
export const createChannelSchema = z.object({ name: channelNameSchema, type: z.enum(['text', 'voice']) }).strict();
export const updateServerOverviewSchema = z.object({
  name: serverNameSchema,
  description: z.string().trim().max(1_000).nullable(),
  language: z.string().trim().min(2).max(16),
  timezone: z.string().trim().min(1).max(100),
  systemChannelId: uuidSchema.nullable(),
  welcomeChannelId: uuidSchema.nullable(),
  defaultNotificationLevel: z.enum(['all', 'mentions', 'none']),
  defaultVoiceInactivitySeconds: z.number().int().min(0).max(86_400),
  version: z.number().int().positive(),
}).strict();
export const updateServerAppearanceSchema = z.object({
  iconObjectKey: z.string().trim().min(1).max(512).nullable().optional(),
  bannerObjectKey: z.string().trim().min(1).max(512).nullable().optional(),
  accentColor: z.string().regex(/^#[0-9a-f]{6}$/iu).nullable(),
  version: z.number().int().positive(),
}).strict();
export const serverAppearanceUploadIntentSchema = z.object({
  kind: z.enum(['icon', 'banner']),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z.number().int().positive().max(12 * 1024 * 1024),
}).strict();
export const updateServerMemberSchema = z.object({
  nickname: z.string().trim().min(1).max(32).nullable().optional(),
  mutedUntil: z.iso.datetime().nullable().optional(),
  deafened: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export const createServerCategorySchema = z.object({ name: z.string().trim().min(1).max(50), position: z.number().int().min(0).max(999).optional() }).strict();
export const updateServerCategorySchema = z.object({ name: z.string().trim().min(1).max(50).optional(), position: z.number().int().min(0).max(999).optional() }).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export const updateServerChannelSettingsSchema = z.object({
  name: channelNameSchema.optional(),
  position: z.number().int().min(0).max(999).optional(),
  categoryId: uuidSchema.nullable().optional(),
  slowModeSeconds: z.number().int().min(0).max(21_600).optional(),
  maxParticipants: z.number().int().min(1).max(1_000).nullable().optional(),
  bitrate: z.number().int().min(16_000).max(510_000).nullable().optional(),
  archived: z.boolean().optional(),
  version: z.number().int().positive(),
}).strict();
export const createServerInviteSchema = z.object({
  destinationChannelId: uuidSchema.nullable().default(null),
  expiresInSeconds: z.number().int().min(300).max(2_592_000).nullable().default(604_800),
  maxUses: z.number().int().min(1).max(10_000).nullable().default(null),
}).strict();
export const updateServerModerationSchema = z.object({
  verificationLevel: z.enum(['none', 'email_verified', 'account_age']),
  newMemberRestrictionMinutes: z.number().int().min(0).max(43_200),
  messageRateLimitPerMinute: z.number().int().min(1).max(600),
  mentionLimitPerMessage: z.number().int().min(0).max(100),
  rules: z.string().trim().max(10_000).nullable(),
  version: z.number().int().positive(),
}).strict();
export const banServerMemberSchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict();
export const serverAuditQuerySchema = z.object({
  before: z.iso.datetime().optional(),
  action: z.string().trim().min(1).max(80).optional(),
  actorUserId: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();
const serverReauthenticationFields = { password: passwordSchema, totpCode: otpCodeSchema.nullable().default(null) };
export const serverDangerReauthenticationSchema = z.object(serverReauthenticationFields).strict();
export const archiveServerSchema = z.object({ archived: z.boolean(), ...serverReauthenticationFields }).strict();
export const transferServerOwnershipSchema = z.object({ userId: uuidSchema, ...serverReauthenticationFields }).strict();
export const deleteServerSchema = z.object({ confirmation: serverNameSchema, ...serverReauthenticationFields }).strict();
export const createRoleSchema = z.object({
  name: roleNameSchema,
  color: z.string().regex(/^#[0-9a-f]{6}$/iu).default('#a86b4b'),
  permissions: z.array(z.enum(serverPermissions)).max(serverPermissions.length),
}).strict();
export const updateRoleSchema = z.object({
  name: roleNameSchema.optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/iu).optional(),
  permissions: z.array(z.enum(serverPermissions)).max(serverPermissions.length).optional(),
}).strict();
export const assignMemberRolesSchema = z.object({ roleIds: z.array(uuidSchema).max(20) }).strict();
export const reorderRoleSchema = z.object({ position: z.number().int().min(1).max(99) }).strict();
export const channelPermissionOverwriteSchema = z.object({
  allow: z.array(z.enum(serverPermissions)).max(serverPermissions.length),
  deny: z.array(z.enum(serverPermissions)).max(serverPermissions.length),
}).strict().refine((value) => value.allow.every((permission) => !value.deny.includes(permission)), 'Permission cannot be allowed and denied at the same time');
export const messageMentionInputSchema = z.object({
  userId: uuidSchema,
  start: z.number().int().min(0).max(4_000),
  length: z.number().int().min(2).max(257),
}).strict();
export const createMessageSchema = z.object({ content: newMessageContentSchema, mentions: z.array(messageMentionInputSchema).max(20).default([]), replyToMessageId: uuidSchema.nullish() }).strict();
export const updateMessageSchema = z.object({ content: messageContentSchema, mentions: z.array(messageMentionInputSchema).max(20).default([]) }).strict();
export const messageQuerySchema = z.object({ before: z.iso.datetime().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).strict();
export const messageNotificationQuerySchema = z.object({ since: z.iso.datetime().optional(), afterId: uuidSchema.optional(), limit: z.coerce.number().int().min(1).max(50).default(20) }).strict();
export const markChannelReadSchema = z.object({ messageId: uuidSchema }).strict();
export const createDirectConversationSchema = z.object({ userId: uuidSchema }).strict();
export const createDirectMessageSchema = z.object({ content: newMessageContentSchema, replyToMessageId: uuidSchema.nullish() }).strict();

export const canonicalMessageIdSchema = z.string().regex(/^[1-9]\d*$/u);
export const conversationHistoryQuerySchema = z.object({
  before: canonicalMessageIdSchema.optional(),
  after: canonicalMessageIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict().refine((value) => !(value.before && value.after), 'before and after are mutually exclusive');
export const conversationMentionInputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('user'), userId: uuidSchema, start: z.number().int().min(0).max(4_000).optional(), length: z.number().int().min(1).max(257).optional() }).strict(),
  z.object({ type: z.literal('role'), roleId: uuidSchema }).strict(),
  z.object({ type: z.literal('everyone') }).strict(),
]);
export const createConversationMessageSchema = z.object({
  clientMessageId: uuidSchema,
  content: newMessageContentSchema.default(''),
  replyToMessageId: canonicalMessageIdSchema.nullish(),
  attachmentIds: z.array(uuidSchema).max(10).default([]),
  mentions: z.array(conversationMentionInputSchema).max(100).default([]),
}).strict().refine((value) => value.content.length > 0 || value.attachmentIds.length > 0, 'Message must contain text or an attachment');
export const updateConversationMessageSchema = z.object({
  content: messageContentSchema,
  mentions: z.array(conversationMentionInputSchema).max(100).default([]),
}).strict();
export const updateConversationReadStateSchema = z.object({
  lastDeliveredMessageId: canonicalMessageIdSchema.optional(),
  lastReadMessageId: canonicalMessageIdSchema.optional(),
}).strict().refine((value) => Boolean(value.lastDeliveredMessageId || value.lastReadMessageId), 'At least one cursor is required');
export const notificationQuerySchema = z.object({
  before: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  unreadOnly: z.coerce.boolean().default(false),
}).strict();
export const notificationPreferenceLevelSchema = z.enum(['all', 'mentions', 'none']);
export const notificationPreviewModeSchema = z.enum(['full', 'sender_only', 'hidden']);
export const updateUserNotificationPreferencesSchema = z.object({
  desktopEnabled: z.boolean(),
  soundEnabled: z.boolean(),
  previewMode: notificationPreviewModeSchema,
  directMessagesEnabled: z.boolean(),
  mentionsEnabled: z.boolean(),
  quietHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u).nullable(),
  quietHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u).nullable(),
  quietHoursTimezone: z.string().trim().min(1).max(100).nullable(),
}).strict().refine((value) => (value.quietHoursStart === null) === (value.quietHoursEnd === null), 'Quiet hours require both start and end');
export const createAttachmentIntentSchema = z.object({
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.string().trim().min(3).max(127),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive().max(32_768).optional(),
  height: z.number().int().positive().max(32_768).optional(),
  durationMs: z.number().int().positive().max(86_400_000).optional(),
}).strict();
export const realtimeClientCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('auth'), token: z.string().min(32).max(4_096), deviceId: z.string().trim().min(1).max(128) }).strict(),
  z.object({ type: z.literal('subscribe'), conversationId: uuidSchema }).strict(),
  z.object({ type: z.literal('unsubscribe'), conversationId: uuidSchema }).strict(),
  z.object({ type: z.literal('typing.start'), conversationId: uuidSchema }).strict(),
  z.object({ type: z.literal('typing.stop'), conversationId: uuidSchema }).strict(),
  z.object({ type: z.literal('active_conversation.set'), conversationId: uuidSchema.nullable() }).strict(),
  z.object({ type: z.literal('delivery.ack'), conversationId: uuidSchema, messageId: canonicalMessageIdSchema }).strict(),
  z.object({ type: z.literal('conversation.read'), conversationId: uuidSchema, messageId: canonicalMessageIdSchema }).strict(),
  z.object({ type: z.literal('ping') }).strict(),
]);

export const desktopSourceSelectionSchema = z
  .object({ sourceId: z.string().min(1).max(512), includeAudio: z.boolean() })
  .strict();

export const localSettingsSchema = z
  .object({
    microphoneDeviceId: z.string().max(512).optional(),
    outputDeviceId: z.string().max(512).optional(),
    volume: z.number().min(0).max(1).default(1),
    desktopNotificationsEnabled: z.boolean().default(true),
    messageSoundsEnabled: z.boolean().default(true),
    windowBounds: z
      .object({
        x: z.number().int().optional(),
        y: z.number().int().optional(),
        width: z.number().int().min(900).max(7680),
        height: z.number().int().min(620).max(4320),
      })
      .optional(),
  })
  .strict();

export type LocalSettings = z.infer<typeof localSettingsSchema>;
export type RequestRegistrationInput = z.infer<typeof requestRegistrationSchema>;
export type BeginPasswordLoginInput = z.infer<typeof beginPasswordLoginSchema>;
export type CompletePasswordLoginInput = z.infer<typeof completePasswordLoginSchema>;
