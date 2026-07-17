import { z } from 'zod';

import { serverPermissions } from './contracts.js';
import { ROOM_CODE_ALPHABET } from './constants.js';

const controlCharacterPattern = /[\p{Cc}\p{Cf}]/u;
const displayNamePattern = /^[\p{L}\p{M}\p{N} _-]+$/u;
const roomAlphabetPattern = new RegExp(`^[${ROOM_CODE_ALPHABET}]{6,8}$`);

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

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((value) => roomAlphabetPattern.test(value), 'Некорректный код комнаты');

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
export const screenShareActionSchema = z
  .object({ participantIdentity: z.string().min(3).max(200) })
  .strict();

export const serverNameSchema = z.string().trim().min(2).max(60).refine((value) => !controlCharacterPattern.test(value));
export const channelNameSchema = z.string().trim().toLowerCase().min(1).max(50).regex(/^[\p{L}\p{N}_ -]+$/u);
export const roleNameSchema = z.string().trim().min(1).max(40).refine((value) => !controlCharacterPattern.test(value));
export const inviteTokenSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{8,32}$/u);
export const messageContentSchema = z.string().trim().min(1).max(4_000).refine((value) => !controlCharacterPattern.test(value));
export const messageReactionSchema = z.string().trim().min(1).max(32).refine((value) => !controlCharacterPattern.test(value));
export const createServerSchema = z.object({ name: serverNameSchema }).strict();
export const createChannelSchema = z.object({ name: channelNameSchema, type: z.enum(['text', 'voice']) }).strict();
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
export const createMessageSchema = z.object({ content: messageContentSchema, replyToMessageId: uuidSchema.nullish() }).strict();
export const updateMessageSchema = z.object({ content: messageContentSchema }).strict();
export const messageQuerySchema = z.object({ before: z.iso.datetime().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).strict();
export const messageNotificationQuerySchema = z.object({ since: z.iso.datetime().optional(), afterId: uuidSchema.optional(), limit: z.coerce.number().int().min(1).max(50).default(20) }).strict();
export const markChannelReadSchema = z.object({ messageId: uuidSchema }).strict();
export const createDirectConversationSchema = z.object({ userId: uuidSchema }).strict();
export const createDirectMessageSchema = z.object({ content: messageContentSchema, replyToMessageId: uuidSchema.nullish() }).strict();

export const desktopSourceSelectionSchema = z
  .object({ sourceId: z.string().min(1).max(512), includeAudio: z.boolean() })
  .strict();

export const localSettingsSchema = z
  .object({
    microphoneDeviceId: z.string().max(512).optional(),
    outputDeviceId: z.string().max(512).optional(),
    volume: z.number().min(0).max(1).default(1),
    windowBounds: z
      .object({
        x: z.number().int().optional(),
        y: z.number().int().optional(),
        width: z.number().int().min(900).max(7680),
        height: z.number().int().min(620).max(4320),
      })
      .optional(),
    lastRoomCode: roomCodeSchema.optional(),
  })
  .strict();

export type LocalSettings = z.infer<typeof localSettingsSchema>;
export type RequestRegistrationInput = z.infer<typeof requestRegistrationSchema>;
export type BeginPasswordLoginInput = z.infer<typeof beginPasswordLoginSchema>;
export type CompletePasswordLoginInput = z.infer<typeof completePasswordLoginSchema>;
