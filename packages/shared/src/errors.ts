import { z } from 'zod';

export const apiErrorCodes = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'SESSION_EXPIRED',
  'SESSION_REVOKED',
  'INVALID_OTP',
  'OTP_EXPIRED',
  'OTP_ATTEMPTS_EXCEEDED',
  'RATE_LIMITED',
  'PROFILE_INCOMPLETE',
  'ROOM_NOT_FOUND',
  'ROOM_CLOSED',
  'ROOM_EXPIRED',
  'ROOM_LOCKED',
  'ROOM_FULL',
  'NOT_ROOM_OWNER',
  'PARTICIPANT_NOT_FOUND',
  'SCREEN_SHARE_BUSY',
  'LIVEKIT_UNAVAILABLE',
  'EMAIL_DELIVERY_FAILED',
  'INTERNAL_ERROR',
] as const;

export const apiErrorCodeSchema = z.enum(apiErrorCodes);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export interface ValidationDetail {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  details: ValidationDetail[] | Record<string, unknown> | null;
  requestId: string;
}

export const errorMessages: Record<ApiErrorCode, string> = {
  VALIDATION_ERROR: 'Переданы некорректные данные',
  UNAUTHORIZED: 'Требуется авторизация',
  SESSION_EXPIRED: 'Сессия истекла',
  SESSION_REVOKED: 'Сессия отозвана',
  INVALID_OTP: 'Неверный одноразовый код',
  OTP_EXPIRED: 'Срок действия кода истёк',
  OTP_ATTEMPTS_EXCEEDED: 'Превышено количество попыток ввода кода',
  RATE_LIMITED: 'Слишком много запросов. Попробуйте позже',
  PROFILE_INCOMPLETE: 'Сначала укажите отображаемое имя',
  ROOM_NOT_FOUND: 'Комната не найдена',
  ROOM_CLOSED: 'Комната закрыта',
  ROOM_EXPIRED: 'Срок действия комнаты истёк',
  ROOM_LOCKED: 'Владелец закрыл вход в комнату',
  ROOM_FULL: 'В комнате уже находится максимальное количество участников',
  NOT_ROOM_OWNER: 'Действие доступно только владельцу комнаты',
  PARTICIPANT_NOT_FOUND: 'Участник не найден',
  SCREEN_SHARE_BUSY: 'Другой участник уже демонстрирует экран',
  LIVEKIT_UNAVAILABLE: 'Медиасервис временно недоступен',
  EMAIL_DELIVERY_FAILED: 'Не удалось отправить письмо с кодом',
  INTERNAL_ERROR: 'Внутренняя ошибка сервера',
};

export function createApiError(
  code: ApiErrorCode,
  requestId: string,
  details: ApiErrorBody['details'] = null,
  message = errorMessages[code],
): ApiErrorBody {
  return { code, message, details, requestId };
}
