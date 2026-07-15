import type { ApiErrorCode } from '@vatrushka/shared';

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;
  readonly details: Record<string, unknown> | null;

  constructor(code: ApiErrorCode, statusCode: number, message?: string, details: Record<string, unknown> | null = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}
