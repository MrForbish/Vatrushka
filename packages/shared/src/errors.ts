import { z } from "zod";

export const apiErrorCodes = [
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "SESSION_EXPIRED",
  "SESSION_REVOKED",
  "INVALID_OTP",
  "INVALID_CREDENTIALS",
  "INVALID_SECOND_FACTOR",
  "PASSWORD_REQUIRED",
  "ACCOUNT_EXISTS",
  "TWO_FACTOR_NOT_CONFIGURED",
  "OTP_EXPIRED",
  "OTP_ATTEMPTS_EXCEEDED",
  "RATE_LIMITED",
  "PROFILE_INCOMPLETE",
  "PARTICIPANT_NOT_FOUND",
  "PARTICIPANT_NOT_IN_VOICE",
  "SCREEN_SHARE_BUSY",
  "SERVER_NOT_FOUND",
  "CHANNEL_NOT_FOUND",
  "ROLE_NOT_FOUND",
  "MESSAGE_NOT_FOUND",
  "ATTACHMENT_NOT_FOUND",
  "ATTACHMENT_TOO_LARGE",
  "ATTACHMENT_TYPE_NOT_ALLOWED",
  "MEDIA_STORAGE_UNAVAILABLE",
  "DIRECT_CONVERSATION_NOT_FOUND",
  "DIRECT_MESSAGE_NOT_FOUND",
  "DIRECT_MESSAGE_NOT_ALLOWED",
  "ALREADY_SERVER_MEMBER",
  "SERVER_PERMISSION_DENIED",
  "LIVEKIT_UNAVAILABLE",
  "EMAIL_DELIVERY_FAILED",
  "INTERNAL_ERROR",
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
  VALIDATION_ERROR: "Переданы некорректные данные",
  UNAUTHORIZED: "Требуется авторизация",
  SESSION_EXPIRED: "Сессия истекла",
  SESSION_REVOKED: "Сессия отозвана",
  INVALID_OTP: "Неверный одноразовый код",
  INVALID_CREDENTIALS: "Неверный email или пароль",
  INVALID_SECOND_FACTOR: "Неверный код подтверждения",
  PASSWORD_REQUIRED: "Для этого аккаунта требуется вход с паролем",
  ACCOUNT_EXISTS: "Аккаунт с таким email уже существует",
  TWO_FACTOR_NOT_CONFIGURED: "Двухфакторная аутентификация не настроена",
  OTP_EXPIRED: "Срок действия кода истёк",
  OTP_ATTEMPTS_EXCEEDED: "Превышено количество попыток ввода кода",
  RATE_LIMITED: "Слишком много запросов. Попробуйте позже",
  PROFILE_INCOMPLETE: "Сначала укажите отображаемое имя",
  PARTICIPANT_NOT_FOUND: "Участник не найден",
  PARTICIPANT_NOT_IN_VOICE: "Участник сейчас не находится в голосовом канале",
  SCREEN_SHARE_BUSY: "Другой участник уже демонстрирует экран",
  SERVER_NOT_FOUND: "Сервер не найден",
  CHANNEL_NOT_FOUND: "Канал не найден",
  ROLE_NOT_FOUND: "Роль не найдена",
  MESSAGE_NOT_FOUND: "Сообщение не найдено",
  ATTACHMENT_NOT_FOUND: "Вложение не найдено",
  ATTACHMENT_TOO_LARGE: "Размер вложения превышает допустимый лимит",
  ATTACHMENT_TYPE_NOT_ALLOWED: "Этот тип файла нельзя прикрепить",
  MEDIA_STORAGE_UNAVAILABLE: "Файловое хранилище временно недоступно",
  DIRECT_CONVERSATION_NOT_FOUND: "Личный диалог не найден",
  DIRECT_MESSAGE_NOT_FOUND: "Личное сообщение не найдено",
  DIRECT_MESSAGE_NOT_ALLOWED:
    "Нельзя начать личный диалог с этим пользователем",
  ALREADY_SERVER_MEMBER: "Вы уже состоите на этом сервере",
  SERVER_PERMISSION_DENIED: "Недостаточно прав для этого действия",
  LIVEKIT_UNAVAILABLE: "Медиасервис временно недоступен",
  EMAIL_DELIVERY_FAILED: "Не удалось отправить письмо с кодом",
  INTERNAL_ERROR: "Внутренняя ошибка сервера",
};

export function createApiError(
  code: ApiErrorCode,
  requestId: string,
  details: ApiErrorBody["details"] = null,
  message = errorMessages[code],
): ApiErrorBody {
  return { code, message, details, requestId };
}
