import { z } from 'zod';

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
export const uuidSchema = z.uuid();

export const requestCodeSchema = z.object({ email: emailSchema }).strict();
export const verifyCodeSchema = z
  .object({
    email: emailSchema,
    code: otpCodeSchema,
    deviceName: z.string().trim().min(1).max(100),
  })
  .strict();
export const refreshSchema = z.object({ refreshToken: z.string().min(32).max(512) }).strict();
export const updateProfileSchema = z.object({ displayName: displayNameSchema }).strict();
export const guestJoinSchema = z.object({ code: roomCodeSchema, displayName: displayNameSchema }).strict();
export const roomJoinSchema = z.object({}).strict();
export const roomLockSchema = z.object({ isLocked: z.boolean() }).strict();
export const screenShareActionSchema = z
  .object({ participantIdentity: z.string().min(3).max(200) })
  .strict();

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
export type RequestCodeInput = z.infer<typeof requestCodeSchema>;
export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>;
export type GuestJoinInput = z.infer<typeof guestJoinSchema>;
