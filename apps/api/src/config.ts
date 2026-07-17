import { existsSync } from 'node:fs';

import { z } from 'zod';

import {
  ACCESS_TOKEN_TTL_SECONDS,
  APP_NAME,
  APP_PROTOCOL,
  OTP_RESEND_SECONDS,
  OTP_TTL_SECONDS,
  SCREEN_SHARE_HEARTBEAT_SECONDS,
  SCREEN_SHARE_LEASE_SECONDS,
} from '@vatrushka/shared';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const booleanFromStringDefaultTrue = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    PUBLIC_API_URL: z.url().default('http://localhost:3000'),
    PUBLIC_INVITE_URL: z.url().default('http://localhost:3000'),
    APP_NAME: z.string().min(1).default(APP_NAME),
    APP_PROTOCOL: z.string().regex(/^[a-z][a-z0-9+.-]+$/).default(APP_PROTOCOL),
    PLATFORM_OWNER_EMAIL: z.string().trim().toLowerCase().email().optional().or(z.literal('')),
    DATABASE_URL: z.string().min(1).default('postgresql://vatrushka:vatrushka@localhost:5432/vatrushka'),
    ACCESS_TOKEN_SECRET: z.string().min(32).default('development-access-secret-change-me-now'),
    CREDENTIAL_ENCRYPTION_KEY: z.string().min(32).default('development-credential-key-change-now'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(ACCESS_TOKEN_TTL_SECONDS),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    OTP_PEPPER: z.string().min(32).default('development-otp-pepper-change-me-now'),
    OTP_TTL_SECONDS: z.coerce.number().int().positive().default(OTP_TTL_SECONDS),
    OTP_RESEND_SECONDS: z.coerce.number().int().positive().default(OTP_RESEND_SECONDS),
    DEV_FIXED_OTP: z.string().regex(/^\d{6}$/).optional().or(z.literal('')),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(1025),
    SMTP_SECURE: booleanFromString,
    SMTP_USER: z.string().default(''),
    SMTP_PASSWORD: z.string().default(''),
    SMTP_FROM_EMAIL: z.email().default('no-reply@vatrushka.local'),
    SMTP_FROM_NAME: z.string().min(1).default(APP_NAME),
    LIVEKIT_URL: z.string().min(1).default('ws://localhost:7880'),
    LIVEKIT_HTTP_URL: z.url().default('http://localhost:7880'),
    LIVEKIT_API_KEY: z.string().min(1).default('devkey'),
    LIVEKIT_API_SECRET: z.string().min(1).default('secret'),
    MEDIA_STORAGE_DRIVER: z.enum(['database', 's3']).default('database'),
    S3_ENDPOINT: z.string().default(''),
    S3_REGION: z.string().min(1).default('ru-1'),
    S3_BUCKET: z.string().default(''),
    S3_ACCESS_KEY_ID: z.string().default(''),
    S3_SECRET_ACCESS_KEY: z.string().default(''),
    S3_FORCE_PATH_STYLE: booleanFromStringDefaultTrue,
    S3_KEY_PREFIX: z.string().regex(/^[a-z0-9](?:[a-z0-9/_-]*[a-z0-9])?$/).default('prod'),
    PRESENCE_STORAGE_DRIVER: z.enum(['memory', 'redis']).default('memory'),
    REDIS_URL: z.string().default(''),
    PRESENCE_HEARTBEAT_SECONDS: z.coerce.number().int().min(5).max(60).default(20),
    PRESENCE_TTL_SECONDS: z.coerce.number().int().min(15).max(300).default(75),
    SCREEN_SHARE_LEASE_SECONDS: z.coerce.number().int().positive().default(SCREEN_SHARE_LEASE_SECONDS),
    SCREEN_SHARE_HEARTBEAT_SECONDS: z.coerce.number().int().positive().default(SCREEN_SHARE_HEARTBEAT_SECONDS),
    CORS_ALLOWED_ORIGINS: z.string().default(''),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  })
  .superRefine((env, context) => {
    if (env.MEDIA_STORAGE_DRIVER === 's3') {
      const requiredS3 = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const;
      for (const key of requiredS3) {
        if (!env[key]) context.addIssue({ code: 'custom', path: [key], message: `${key} is required when MEDIA_STORAGE_DRIVER=s3` });
      }
      if (env.S3_ENDPOINT) {
        try {
          if (new URL(env.S3_ENDPOINT).protocol !== 'https:') context.addIssue({ code: 'custom', path: ['S3_ENDPOINT'], message: 'S3_ENDPOINT must use HTTPS' });
        } catch {
          context.addIssue({ code: 'custom', path: ['S3_ENDPOINT'], message: 'S3_ENDPOINT must be a valid URL' });
        }
      }
    }
    if (env.PRESENCE_STORAGE_DRIVER === 'redis' && !env.REDIS_URL) context.addIssue({ code: 'custom', path: ['REDIS_URL'], message: 'REDIS_URL is required when PRESENCE_STORAGE_DRIVER=redis' });
    if (env.PRESENCE_TTL_SECONDS <= env.PRESENCE_HEARTBEAT_SECONDS * 2) context.addIssue({ code: 'custom', path: ['PRESENCE_TTL_SECONDS'], message: 'PRESENCE_TTL_SECONDS must be greater than two heartbeat intervals' });
    if (env.NODE_ENV === 'production') {
      const required: Array<keyof typeof env> = [
        'DATABASE_URL',
        'ACCESS_TOKEN_SECRET',
        'CREDENTIAL_ENCRYPTION_KEY',
        'OTP_PEPPER',
        'SMTP_HOST',
        'SMTP_FROM_EMAIL',
        'LIVEKIT_URL',
        'LIVEKIT_HTTP_URL',
        'LIVEKIT_API_KEY',
        'LIVEKIT_API_SECRET',
      ];
      for (const key of required) {
        if (!env[key]) context.addIssue({ code: 'custom', path: [key], message: `${key} is required in production` });
      }
      if (env.ACCESS_TOKEN_SECRET.startsWith('development-') || env.CREDENTIAL_ENCRYPTION_KEY.startsWith('development-') || env.OTP_PEPPER.startsWith('development-')) {
        context.addIssue({ code: 'custom', message: 'Development secrets are forbidden in production' });
      }
      if (new URL(env.PUBLIC_API_URL).protocol !== 'https:') context.addIssue({ code: 'custom', path: ['PUBLIC_API_URL'], message: 'PUBLIC_API_URL must use HTTPS in production' });
      if (new URL(env.PUBLIC_INVITE_URL).protocol !== 'https:') context.addIssue({ code: 'custom', path: ['PUBLIC_INVITE_URL'], message: 'PUBLIC_INVITE_URL must use HTTPS in production' });
      if (env.DEV_FIXED_OTP) context.addIssue({ code: 'custom', path: ['DEV_FIXED_OTP'], message: 'DEV_FIXED_OTP is forbidden in production' });
      if (env.PRESENCE_STORAGE_DRIVER !== 'redis') context.addIssue({ code: 'custom', path: ['PRESENCE_STORAGE_DRIVER'], message: 'Production presence storage must use Redis' });
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  if (environment === process.env && existsSync('.env') && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile('.env');
  }
  return envSchema.parse(environment);
}
