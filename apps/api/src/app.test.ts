import { createHash, createHmac } from 'node:crypto';

import { AccessToken } from 'livekit-server-sdk';
import { beforeEach, describe, expect, it } from 'vitest';

import { API_PREFIX, type RealtimeEvent } from '@vatrushka/shared';

import { buildApp, logRedactPaths } from './app.js';
import { loadConfig } from './config.js';
import { MAX_ATTACHMENT_BYTES, VatrushkaService } from './service.js';
import type { RedisRealtimeBus } from './services/realtime.js';
import { FakeMailer, FakeMediaService, FakeObjectStorage } from './testing/fakes.js';
import { MemoryStore } from './testing/memory-store.js';

interface TestContext {
  app: Awaited<ReturnType<typeof buildApp>>;
  service: VatrushkaService;
  store: MemoryStore;
  mailer: FakeMailer;
  media: FakeMediaService;
  objectStorage: FakeObjectStorage | null;
  clock: { now: Date };
  config: ReturnType<typeof loadConfig>;
  realtimeEvents: RealtimeEvent[];
}

let context: TestContext;

describe('structured logging policy', () => {
  it('redacts authentication, cookie, storage and infrastructure secrets', () => {
    for (const path of [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.recoveryCode',
      'accessToken',
      'livekitToken',
      'S3_SECRET_ACCESS_KEY',
      'ACCESS_TOKEN_SECRET',
      'CREDENTIAL_ENCRYPTION_KEY',
      'OTP_PEPPER',
    ]) {
      expect(logRedactPaths).toContain(path);
    }
  });
});

function inviteTokenFromUrl(inviteUrl: string): string {
  const token = new URL(inviteUrl).pathname.split('/').filter(Boolean).at(-1);
  if (!token) throw new Error('Missing invite token');
  return token;
}

async function makeContext(objectStorage: FakeObjectStorage | null = null): Promise<TestContext> {
  const store = new MemoryStore();
  const mailer = new FakeMailer();
  const media = new FakeMediaService();
  const clock = { now: new Date('2026-01-01T00:00:00.000Z') };
  const config = loadConfig({
    NODE_ENV: 'test',
    DEV_FIXED_OTP: '123456',
    ACCESS_TOKEN_SECRET: 'test-access-token-secret-at-least-32-bytes',
    OTP_PEPPER: 'test-otp-pepper-at-least-thirty-two-bytes',
    LIVEKIT_API_KEY: 'test-key',
    LIVEKIT_API_SECRET: 'test-secret',
    LIVEKIT_URL: 'ws://livekit.test',
    LIVEKIT_HTTP_URL: 'http://livekit.test',
    VOICE_MOVE_STRATEGY: 'livekit-cloud',
  });
  const realtimeEvents: RealtimeEvent[] = [];
  const realtimeBus = {
    publish: async (event: RealtimeEvent) => { realtimeEvents.push(event); return true; },
    publishPresence: async () => true,
  } as unknown as RedisRealtimeBus;
  const service = new VatrushkaService({ config, store, mailer, media, objectStorage, realtimeBus, clock: () => clock.now });
  const app = await buildApp({ config, service, logger: false });
  return { app, service, store, mailer, media, objectStorage, clock, config, realtimeEvents };
}

async function login(email = 'anna@example.com', displayName = 'Anna'): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
  const password = 'secure-vatrushka-42';
  const existing = await context.store.findUserByEmail(email);
  const verified = existing
    ? await (async () => {
        const challenge = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/auth/password/begin`, payload: { email, password, factor: 'email' } });
        expect(challenge.statusCode).toBe(200);
        return context.app.inject({ method: 'POST', url: `${API_PREFIX}/auth/password/complete`, payload: { email, password, code: '123456', factor: 'email', deviceName: 'Test Desktop' } });
      })()
    : await (async () => {
        const requested = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/auth/register/request-code`, payload: { email, password } });
        expect(requested.statusCode).toBe(200);
        return context.app.inject({ method: 'POST', url: `${API_PREFIX}/auth/register/verify-code`, payload: { email, code: '123456', deviceName: 'Test Desktop' } });
      })();
  expect(verified.statusCode).toBe(200);
  const auth = verified.json<{ accessToken: string; refreshToken: string; user: { id: string } }>();
  const profile = await context.app.inject({
    method: 'PATCH',
    url: `${API_PREFIX}/me`,
    headers: { authorization: `Bearer ${auth.accessToken}` },
    payload: { displayName },
  });
  expect(profile.statusCode).toBe(200);
  return { accessToken: auth.accessToken, refreshToken: auth.refreshToken, userId: auth.user.id };
}

function totp(secret: string, timestampMs: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let accumulator = 0;
  const bytes: number[] = [];
  for (const character of secret) {
    accumulator = (accumulator << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bytes.push((accumulator >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timestampMs / 30_000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  return ((digest.readUInt32BE(offset) & 0x7fff_ffff) % 1_000_000).toString().padStart(6, '0');
}

function multipartFile(filename: string, mimeType: string, content: Buffer): { contentType: string; payload: Buffer } {
  const boundary = 'vatrushka-test-boundary';
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    payload: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`),
      content,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}

beforeEach(async () => {
  context = await makeContext();
});

describe('health and metrics API', () => {
  it('publishes bounded HTTP/runtime metrics after readiness checks', async () => {
    const readiness = await context.app.inject({ method: 'GET', url: '/health/ready' });
    expect(readiness.statusCode).toBe(200);

    const missing = await context.app.inject({ method: 'GET', url: '/not-a-real-route' });
    expect(missing.statusCode).toBe(404);

    const metrics = await context.app.inject({ method: 'GET', url: '/metrics' });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.headers['content-type']).toContain('text/plain');
    expect(metrics.body).toContain('api_readiness 1');
    expect(metrics.body).toContain('api_http_requests_total{method="GET",route="/health/ready",status_class="2xx"}');
    expect(metrics.body).toContain('api_http_requests_total{method="GET",route="unmatched",status_class="4xx"}');
    expect(metrics.body).toContain('api_http_request_duration_seconds_bucket');
    expect(metrics.body).toContain('nodejs_event_loop_lag_seconds');
  });
});

describe('authentication API', () => {
  it('returns a validation error for malformed JSON bodies', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/auth/register/request-code`,
      headers: { 'content-type': 'application/json' },
      payload: '{',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string; details: Array<{ field: string; message: string }> }>()).toEqual(expect.objectContaining({
      code: 'VALIDATION_ERROR',
      details: [{ field: 'body', message: 'Некорректный JSON' }],
    }));
  });

  it('does not expose retired passwordless endpoints', async () => {
    const requested = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/auth/request-code`, payload: { email: 'user@example.com' } });
    const verified = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/auth/verify-code`, payload: { email: 'user@example.com', code: '123456', deviceName: 'Windows Desktop' } });
    expect(requested.statusCode).toBe(404);
    expect(verified.statusCode).toBe(404);
    expect(context.mailer.messages).toEqual([]);
  });

  it('rejects and revokes a legacy passwordless refresh session', async () => {
    const legacy = await context.store.getOrCreateUser('legacy@example.com', context.clock.now);
    const refreshToken = 'legacy-refresh-token-that-is-long-enough-42';
    await context.store.createSession({
      id: '11111111-1111-4111-8111-111111111111',
      userId: legacy.user.id,
      tokenHash: createHash('sha256').update(refreshToken, 'utf8').digest('hex'),
      tokenFamilyId: '22222222-2222-4222-8222-222222222222',
      deviceName: 'Legacy Desktop',
      trustedAt: null,
      expiresAt: new Date(context.clock.now.getTime() + 60_000),
      revokedAt: null,
      replacedBySessionId: null,
      createdAt: context.clock.now,
      lastUsedAt: context.clock.now,
    });
    const response = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/auth/refresh`, payload: { refreshToken } });
    expect(response.statusCode).toBe(401);
    expect(response.json<{ code: string }>().code).toBe('SESSION_REVOKED');
    expect([...context.store.sessions.values()].filter((session) => session.tokenFamilyId === '22222222-2222-4222-8222-222222222222').every((session) => session.revokedAt !== null)).toBe(true);
  });

  it('verifies registration email and creates a password account', async () => {
    const requested = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/auth/register/request-code`, payload: { email: 'anna@example.com', password: 'secure-vatrushka-42' } });
    expect(requested.statusCode).toBe(200);
    const response = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/auth/register/verify-code`,
      payload: { email: 'anna@example.com', code: '123456', deviceName: 'Windows Desktop' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ isNewUser: boolean; user: { displayName: null; hasPassword: boolean } }>()).toEqual(expect.objectContaining({ isNewUser: true, user: expect.objectContaining({ displayName: null, hasPassword: true }) }));
    expect(context.mailer.messages).toEqual([{ email: 'anna@example.com', code: '123456' }]);
    expect([...context.store.authCodes.values()][0]?.codeHash).not.toContain('123456');
    expect([...context.store.sessions.values()][0]?.tokenHash).not.toBe(response.json<{ refreshToken: string }>().refreshToken);
  });

  it('resets a password without account enumeration and revokes every active session', async () => {
    const first = await login('reset@example.com', 'Reset User');
    const second = await login('reset@example.com', 'Reset User');
    context.clock.now = new Date(context.clock.now.getTime() + 61_000);

    const requested = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/auth/password/reset/request-code`,
      payload: { email: 'reset@example.com' },
    });
    const unknownRequested = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/auth/password/reset/request-code`,
      payload: { email: 'unknown@example.com' },
    });
    expect(requested.statusCode).toBe(200);
    expect(unknownRequested.statusCode).toBe(200);
    expect(requested.json()).toEqual(unknownRequested.json());

    const completed = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/auth/password/reset/complete`,
      payload: { email: 'reset@example.com', code: '123456', password: 'new-secure-password-73' },
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toEqual({ status: 'PASSWORD_RESET' });
    expect([...context.store.sessions.values()].filter((session) => session.userId === first.userId).every((session) => session.revokedAt !== null)).toBe(true);
    expect(context.mailer.securityNotices.at(-1)?.title).toBe('Пароль восстановлен');
    expect([...context.store.securityEvents.values()].some((event) => event.userId === first.userId && event.type === 'PASSWORD_RESET')).toBe(true);

    const oldPassword = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/auth/password/begin`,
      payload: { email: 'reset@example.com', password: 'secure-vatrushka-42', factor: 'email' },
    });
    const newPassword = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/auth/password/begin`,
      payload: { email: 'reset@example.com', password: 'new-secure-password-73', factor: 'email' },
    });
    expect(oldPassword.statusCode).toBe(401);
    expect(newPassword.statusCode).toBe(200);

    const firstRefresh = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/auth/refresh`, payload: { refreshToken: first.refreshToken } });
    const secondRefresh = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/auth/refresh`, payload: { refreshToken: second.refreshToken } });
    expect(firstRefresh.statusCode).toBe(401);
    expect(secondRefresh.statusCode).toBe(401);

    const unknownCompleted = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/auth/password/reset/complete`,
      payload: { email: 'unknown@example.com', code: '123456', password: 'new-secure-password-73' },
    });
    expect(unknownCompleted.statusCode).toBe(401);
    expect(unknownCompleted.json<{ code: string }>().code).toBe('INVALID_OTP');
  });

  it('rate limits password-reset requests by client address', async () => {
    const responses = [];
    for (let index = 0; index < 6; index += 1) {
      responses.push(await context.app.inject({
        method: 'POST',
        url: `${API_PREFIX}/auth/password/reset/request-code`,
        payload: { email: `reset-rate-${index}@example.com` },
      }));
    }
    expect(responses.slice(0, 5).every((response) => response.statusCode === 200)).toBe(true);
    expect(responses[5]?.statusCode).toBe(429);
    expect(responses[5]?.json<{ code: string }>().code).toBe('RATE_LIMITED');
  });

  it('rejects an invalid, expired, and exhausted registration code', async () => {
    await context.app.inject({ method: 'POST', url: `${API_PREFIX}/auth/register/request-code`, payload: { email: 'anna@example.com', password: 'secure-vatrushka-42' } });
    const invalid = await context.app.inject({
      method: 'POST', url: `${API_PREFIX}/auth/register/verify-code`, payload: { email: 'anna@example.com', code: '999999', deviceName: 'Desktop' },
    });
    expect(invalid.statusCode).toBe(401);
    expect(invalid.json<{ code: string }>().code).toBe('INVALID_OTP');

    const code = [...context.store.authCodes.values()][0];
    if (!code) throw new Error('Missing code');
    code.expiresAt = new Date(context.clock.now.getTime() - 1);
    const expired = await context.app.inject({
      method: 'POST', url: `${API_PREFIX}/auth/register/verify-code`, payload: { email: 'anna@example.com', code: '123456', deviceName: 'Desktop' },
    });
    expect(expired.statusCode).toBe(401);
    expect(expired.json<{ code: string }>().code).toBe('OTP_EXPIRED');

    code.expiresAt = new Date(context.clock.now.getTime() + 60_000);
    code.attempts = 4;
    const exhausted = await context.app.inject({
      method: 'POST', url: `${API_PREFIX}/auth/register/verify-code`, payload: { email: 'anna@example.com', code: '999999', deviceName: 'Desktop' },
    });
    expect(exhausted.statusCode).toBe(429);
    expect(exhausted.json<{ code: string }>().code).toBe('OTP_ATTEMPTS_EXCEEDED');
  });

  it('rotates refresh tokens and revokes a family when an old token is reused', async () => {
    const auth = await login();
    const rotated = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/auth/refresh`, payload: { refreshToken: auth.refreshToken } });
    expect(rotated.statusCode).toBe(200);
    const nextToken = rotated.json<{ refreshToken: string }>().refreshToken;
    expect(nextToken).not.toBe(auth.refreshToken);

    const reuse = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/auth/refresh`, payload: { refreshToken: auth.refreshToken } });
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json<{ code: string }>().code).toBe('SESSION_REVOKED');

    const familyRevoked = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/auth/refresh`, payload: { refreshToken: nextToken } });
    expect(familyRevoked.statusCode).toBe(401);
  });

  it('logs out and revokes the current refresh session', async () => {
    const auth = await login();
    const logout = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/auth/logout`, payload: { refreshToken: auth.refreshToken } });
    expect(logout.statusCode).toBe(204);
    const refresh = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/auth/refresh`, payload: { refreshToken: auth.refreshToken } });
    expect(refresh.statusCode).toBe(401);
  });

  it('registers with a password and requires a second factor for password login', async () => {
    const email = 'password@example.com';
    const password = 'secure-vatrushka-42';
    const requested = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/auth/register/request-code`,
      payload: { email, password },
    });
    expect(requested.statusCode).toBe(200);
    const storedCode = [...context.store.authCodes.values()][0];
    expect(storedCode?.credentialHash).toMatch(/^scrypt\$/u);
    expect(storedCode?.credentialHash).not.toContain(password);

    const registered = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/auth/register/verify-code`,
      payload: { email, code: '123456', deviceName: 'Windows Desktop' },
    });
    expect(registered.statusCode).toBe(200);
    expect(registered.json<{ user: { hasPassword: boolean } }>().user.hasPassword).toBe(true);

    const legacyLogin = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/auth/request-code`, payload: { email } });
    expect(legacyLogin.statusCode).toBe(404);

    context.clock.now = new Date(context.clock.now.getTime() + 61_000);
    const challenge = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/auth/password/begin`,
      payload: { email, password, factor: 'auto' },
    });
    expect(challenge.statusCode).toBe(200);
    expect(challenge.json<{ factor: string }>().factor).toBe('email');

    const completed = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/auth/password/complete`,
      payload: { email, password, code: '123456', factor: 'email', deviceName: 'Windows Desktop' },
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json<{ isNewUser: boolean }>().isNewUser).toBe(false);
  });

  it('enables TOTP and uses it for subsequent password login', async () => {
    const email = 'totp@example.com';
    const password = 'secure-vatrushka-73';
    await context.app.inject({ method: 'POST', url: `${API_PREFIX}/auth/register/request-code`, payload: { email, password } });
    const registered = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/auth/register/verify-code`,
      payload: { email, code: '123456', deviceName: 'Windows Desktop' },
    });
    const accessToken = registered.json<{ accessToken: string }>().accessToken;
    const setup = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/me/2fa/setup`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(setup.statusCode).toBe(200);
    const secret = setup.json<{ secret: string }>().secret;
    const code = totp(secret, context.clock.now.getTime());
    const enabled = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/me/2fa/enable`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { code },
    });
    expect(enabled.statusCode).toBe(200);
    const enabledBody = enabled.json<{ user: { twoFactorEnabled: boolean }; recoveryCodes: string[] }>();
    expect(enabledBody.user.twoFactorEnabled).toBe(true);
    expect(enabledBody.recoveryCodes).toHaveLength(10);
    expect(enabledBody.recoveryCodes[0]).toMatch(/^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){2}$/u);
    expect([...context.store.recoveryCodes.values()][0]?.codeHash).not.toBe(enabledBody.recoveryCodes[0]);

    const challenge = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/auth/password/begin`,
      payload: { email, password, factor: 'auto' },
    });
    expect(challenge.statusCode).toBe(200);
    expect(challenge.json<{ factor: string }>().factor).toBe('totp');

    const completed = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/auth/password/complete`,
      payload: { email, password, code, factor: 'totp', deviceName: 'Windows Desktop' },
    });
    expect(completed.statusCode).toBe(200);

    const recoveryChallenge = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/auth/password/begin`,
      payload: { email, password, factor: 'recovery' },
    });
    expect(recoveryChallenge.statusCode).toBe(200);
    expect(recoveryChallenge.json<{ factor: string }>().factor).toBe('recovery');

    const recoveryLogin = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/auth/password/complete`,
      payload: { email, password, code: enabledBody.recoveryCodes[0], factor: 'recovery', deviceName: 'Recovery Desktop' },
    });
    expect(recoveryLogin.statusCode).toBe(200);

    const reusedRecoveryCode = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/auth/password/complete`,
      payload: { email, password, code: enabledBody.recoveryCodes[0], factor: 'recovery', deviceName: 'Recovery Desktop' },
    });
    expect(reusedRecoveryCode.statusCode).toBe(401);
  });

  it('lists logical device sessions, marks trust, and revokes a whole token family', async () => {
    const first = await login('sessions@example.com', 'Sessions');
    context.clock.now = new Date(context.clock.now.getTime() + 61_000);
    const second = await login('sessions@example.com', 'Sessions');
    const listed = await context.app.inject({
      method: 'GET', url: `${API_PREFIX}/auth/sessions`, headers: { authorization: `Bearer ${second.accessToken}` },
    });
    expect(listed.statusCode).toBe(200);
    const sessions = listed.json<Array<{ id: string; current: boolean; trusted: boolean }>>();
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((session) => session.current)).toHaveLength(1);

    const current = sessions.find((session) => session.current);
    const previous = sessions.find((session) => !session.current);
    if (!current || !previous) throw new Error('Missing sessions');
    const trusted = await context.app.inject({
      method: 'PATCH', url: `${API_PREFIX}/auth/sessions/${current.id}`,
      headers: { authorization: `Bearer ${second.accessToken}` }, payload: { trusted: true },
    });
    expect(trusted.statusCode).toBe(204);

    const rotatedSecond = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/auth/refresh`, payload: { refreshToken: second.refreshToken } });
    expect(rotatedSecond.statusCode).toBe(200);
    const secondCurrentAccessToken = rotatedSecond.json<{ accessToken: string }>().accessToken;
    const listedAfterRotation = await context.app.inject({
      method: 'GET', url: `${API_PREFIX}/auth/sessions`, headers: { authorization: `Bearer ${secondCurrentAccessToken}` },
    });
    const sessionsAfterRotation = listedAfterRotation.json<Array<{ current: boolean; trusted: boolean }>>();
    expect(sessionsAfterRotation).toHaveLength(2);
    expect(sessionsAfterRotation.find((session) => session.current)?.trusted).toBe(true);

    const revoked = await context.app.inject({
      method: 'DELETE', url: `${API_PREFIX}/auth/sessions/${previous.id}`,
      headers: { authorization: `Bearer ${secondCurrentAccessToken}` },
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json()).toEqual({ current: false });
    const oldAccess = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/me`, headers: { authorization: `Bearer ${first.accessToken}` } });
    expect(oldAccess.statusCode).toBe(401);

    context.clock.now = new Date(context.clock.now.getTime() + 61_000);
    const third = await login('sessions@example.com', 'Sessions');
    const revokedOthers = await context.app.inject({
      method: 'DELETE', url: `${API_PREFIX}/auth/sessions`, headers: { authorization: `Bearer ${third.accessToken}` },
    });
    expect(revokedOthers.statusCode).toBe(200);
    expect(revokedOthers.json()).toEqual({ revokedCount: 1 });
    const secondAccess = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/me`, headers: { authorization: `Bearer ${secondCurrentAccessToken}` } });
    expect(secondAccess.statusCode).toBe(401);
  });

  it('exposes security events and applies route rate limits', async () => {
    const auth = await login('events@example.com', 'Events');
    const events = await context.app.inject({
      method: 'GET', url: `${API_PREFIX}/me/security-events`, headers: { authorization: `Bearer ${auth.accessToken}` },
    });
    expect(events.statusCode).toBe(200);
    expect(events.json<Array<{ type: string }>>().some((event) => event.type === 'SESSION_CREATED')).toBe(true);
    expect(context.mailer.securityNotices.some((notice) => notice.title === 'Новый вход в аккаунт')).toBe(true);

    let limitedStatus = 0;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await context.app.inject({
        method: 'POST', url: `${API_PREFIX}/auth/password/begin`,
        payload: { email: 'missing@example.com', password: 'missing-password-42', factor: 'auto' },
      });
      limitedStatus = response.statusCode;
    }
    expect(limitedStatus).toBe(429);
  });
});

describe('retired standalone room API', () => {
  it('does not expose creation, guest join, or room lookup routes', async () => {
    const responses = await Promise.all([
      context.app.inject({ method: 'POST', url: `${API_PREFIX}/rooms` }),
      context.app.inject({ method: 'POST', url: `${API_PREFIX}/rooms/guest/join`, payload: { code: 'ABC234', displayName: 'Guest' } }),
      context.app.inject({ method: 'GET', url: `${API_PREFIX}/rooms/by-code/ABC234` }),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([404, 404, 404]);
  });
});

describe('home dashboard API', () => {
  it('returns onboarding without any manual-code flow for a new user', async () => {
    const auth = await login('home-new@example.com', 'New User');
    const response = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/home`, headers: { authorization: `Bearer ${auth.accessToken}` } });

    expect(response.statusCode).toBe(200);
    const home = response.json<{ servers: unknown[]; continueItems: unknown[]; onboarding: { visible: boolean; steps: Array<{ id: string }> }; gaming: { quickReturn: unknown[]; activeSpaces: unknown[]; friendsInGame: unknown[] } }>();
    expect(home.servers).toEqual([]);
    expect(home.continueItems).toEqual([]);
    expect(home.onboarding.visible).toBe(true);
    expect(home.onboarding.steps.map((step) => step.id)).toEqual(['create_server', 'configure_channels', 'invite_members']);
    expect(home.gaming).toMatchObject({ quickReturn: [], activeSpaces: [], friendsInGame: [] });
    expect(JSON.stringify(home)).not.toMatch(/join.by.code|inviteCode|по коду/iu);
  });

  it('aggregates voice presence, unread channels, and meaningful recent activity', async () => {
    const owner = await login('home-owner@example.com', 'Home Owner');
    const member = await login('home-member@example.com', 'Home Member');
    const created = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/servers`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { name: 'Home Space' } });
    const server = created.json<{ id: string; inviteUrl: string; channels: Array<{ id: string; type: 'text' | 'voice' }> }>();
    await context.app.inject({ method: 'POST', url: `${API_PREFIX}/invites/${inviteTokenFromUrl(server.inviteUrl)}/accept`, headers: { authorization: `Bearer ${member.accessToken}` } });
    const textChannel = server.channels.find((channel) => channel.type === 'text');
    const voiceChannel = server.channels.find((channel) => channel.type === 'voice');
    if (!textChannel || !voiceChannel) throw new Error('Missing default channels');
    await context.app.inject({ method: 'POST', url: `${API_PREFIX}/channels/${textChannel.id}/messages`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { content: 'Важное обновление' } });
    await context.app.inject({ method: 'POST', url: `${API_PREFIX}/channels/${textChannel.id}/activity/open`, headers: { authorization: `Bearer ${member.accessToken}` } });
    const connected = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/channels/${voiceChannel.id}/connect`, headers: { authorization: `Bearer ${owner.accessToken}` } });
    const connection = connected.json<{
      participantIdentity: string;
      voiceSessionId: string;
    }>();
    const voiceRecord = context.store.serverChannels.get(voiceChannel.id);
    if (!voiceRecord?.livekitRoomName) throw new Error('Missing voice room');
    context.media.connect(voiceRecord.livekitRoomName, connection.participantIdentity);
    await context.service.handleWebhookEvent({
      id: 'home-owner-voice-joined',
      event: 'participant_joined',
      participant: {
        identity: connection.participantIdentity,
        metadata: JSON.stringify({
          serverId: server.id,
          channelId: voiceChannel.id,
          userId: owner.userId,
          voiceSessionId: connection.voiceSessionId,
        }),
      },
      room: { name: voiceRecord.livekitRoomName },
    });

    const response = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/home`, headers: { authorization: `Bearer ${member.accessToken}` } });
    expect(response.statusCode).toBe(200);
    const home = response.json<{ servers: Array<{ unreadCount: number; activeVoiceCount: number }>; activeSpaces: Array<{ type: string; id: string }>; recentActivity: Array<{ type: string }>; gaming: { voiceStatus: { connectionQuality: string }; activeSpaces: Array<{ channelId: string; participantCount: number; canJoin: boolean }>; quickReturn: unknown[] } }>();
    expect(home.servers[0]).toEqual(expect.objectContaining({ unreadCount: 1, activeVoiceCount: 1 }));
    expect(home.activeSpaces).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: voiceChannel.id, type: 'voice_channel' }),
      expect.objectContaining({ id: textChannel.id, type: 'text_channel' }),
    ]));
    expect(home.recentActivity.map((item) => item.type)).toContain('opened_channel');
    expect(home.gaming.voiceStatus.connectionQuality).toBe('excellent');
    expect(home.gaming.activeSpaces).toEqual(expect.arrayContaining([
      expect.objectContaining({ channelId: voiceChannel.id, participantCount: 1, canJoin: true }),
    ]));

    const ownerHomeResponse = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/home`, headers: { authorization: `Bearer ${owner.accessToken}` } });
    expect(ownerHomeResponse.statusCode).toBe(200);
    expect(ownerHomeResponse.json<{ gaming: { quickReturn: Array<{ channelId: string; returnReason: string }> } }>().gaming.quickReturn[0]).toMatchObject({
      channelId: voiceChannel.id,
      returnReason: 'current_voice',
    });
  });
});

describe('servers, channels, messages, and roles API', () => {
  it('separates a public server display name from viewer-private member aliases', async () => {
    const owner = await login('alias-owner@example.com', 'Owner');
    const member = await login('alias-member@example.com', 'Member');
    const created = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/servers`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { name: 'Имена' } });
    const server = created.json<{ id: string; inviteUrl: string; channels: Array<{ id: string; type: string }> }>();
    await context.app.inject({ method: 'POST', url: `${API_PREFIX}/invites/${inviteTokenFromUrl(server.inviteUrl)}/accept`, headers: { authorization: `Bearer ${member.accessToken}` } });

    const publicName = await context.app.inject({ method: 'PATCH', url: `${API_PREFIX}/servers/${server.id}/members/me/display-name`, headers: { authorization: `Bearer ${member.accessToken}` }, payload: { displayName: 'Местный участник' } });
    expect(publicName.statusCode).toBe(204);
    const privateAlias = await context.app.inject({ method: 'PATCH', url: `${API_PREFIX}/servers/${server.id}/members/${member.userId}/private-alias`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { alias: 'Мой помощник' } });
    expect(privateAlias.statusCode).toBe(204);

    const ownerView = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/servers/${server.id}`, headers: { authorization: `Bearer ${owner.accessToken}` } });
    expect(ownerView.json<{ members: Array<{ userId: string; displayName: string; serverDisplayName: string | null; privateAlias: string | null }> }>().members.find((candidate) => candidate.userId === member.userId)).toMatchObject({ displayName: 'Мой помощник', serverDisplayName: 'Местный участник', privateAlias: 'Мой помощник' });
    const memberView = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/servers/${server.id}`, headers: { authorization: `Bearer ${member.accessToken}` } });
    expect(memberView.json<{ members: Array<{ userId: string; displayName: string; serverDisplayName: string | null; privateAlias: string | null }> }>().members.find((candidate) => candidate.userId === member.userId)).toMatchObject({ displayName: 'Местный участник', serverDisplayName: 'Местный участник', privateAlias: null });

    const voice = server.channels.find((channel) => channel.type === 'voice');
    if (!voice) throw new Error('Missing voice channel');
    const connected = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/channels/${voice.id}/connect`, headers: { authorization: `Bearer ${member.accessToken}` } });
    expect(connected.json<{ participantDisplayName: string }>().participantDisplayName).toBe('Местный участник');
  });

  it('creates a server and lets another user join through its short invite link', async () => {
    const owner = await login('community-owner@example.com', 'Owner');
    const created = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/servers`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { name: 'Тёплая компания' },
    });
    expect(created.statusCode).toBe(201);
    const server = created.json<{ id: string; inviteUrl: string; channels: Array<{ name: string; type: string }>; permissions: string[] }>();
    expect(created.json()).toHaveProperty('description', null);
    expect(server.inviteUrl).toMatch(/^http:\/\/localhost:3000\/i\/[A-Za-z0-9_-]{8,32}$/u);
    expect(created.json()).not.toHaveProperty('inviteCode');
    const inviteToken = inviteTokenFromUrl(server.inviteUrl);
    const redirect = await context.app.inject({ method: 'GET', url: `/i/${inviteToken}` });
    expect(redirect.statusCode).toBe(302);
    expect(redirect.headers.location).toBe(`vatrushka://invite/${inviteToken}`);
    expect(redirect.headers['cache-control']).toBe('no-store');
    expect(server.channels).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'общий', type: 'text' }),
      expect.objectContaining({ name: 'Голосовой', type: 'voice' }),
    ]));
    expect(server.permissions).toContain('MANAGE_ROLES');

    const member = await login('community-member@example.com', 'Member');
    const joined = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/invites/${inviteToken}/accept`,
      headers: { authorization: `Bearer ${member.accessToken}` },
    });
    expect(joined.statusCode).toBe(200);
    expect(joined.json<{ memberCount: number; permissions: string[] }>().memberCount).toBe(2);
    expect(joined.json<{ permissions: string[] }>().permissions).toContain('SEND_MESSAGES');
    const reopened = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/invites/${inviteToken}/accept`, headers: { authorization: `Bearer ${member.accessToken}` } });
    expect(reopened.statusCode).toBe(200);
    expect(reopened.json<{ memberCount: number }>().memberCount).toBe(2);
    const addedChannel = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/servers/${server.id}/channels`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { name: 'релизы', type: 'text' } });
    expect(addedChannel.statusCode).toBe(201);
    expect(context.realtimeEvents).toContainEqual(expect.objectContaining({
      type: 'server.channel.updated',
      targetUserIds: expect.arrayContaining([owner.userId, member.userId]),
      payload: expect.objectContaining({ serverId: server.id, channelId: addedChannel.json<{ id: string }>().id, action: 'created' }),
    }));
    const retiredCodeJoin = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/servers/join`, headers: { authorization: `Bearer ${member.accessToken}` }, payload: { inviteCode: inviteToken } });
    expect(retiredCodeJoin.statusCode).toBe(404);

    const list = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/servers`, headers: { authorization: `Bearer ${member.accessToken}` } });
    expect(list.statusCode).toBe(200);
    expect(list.json<Array<{ id: string }>>()).toEqual([expect.objectContaining({ id: server.id })]);

    const kicked = await context.app.inject({
      method: 'DELETE',
      url: `${API_PREFIX}/servers/${server.id}/members/${member.userId}`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(kicked.statusCode).toBe(204);
    const afterKick = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/servers`, headers: { authorization: `Bearer ${member.accessToken}` } });
    expect(afterKick.json()).toEqual([]);
  });

  it('persists text messages and enforces role permissions', async () => {
    const owner = await login('role-owner@example.com', 'Owner');
    const member = await login('role-member@example.com', 'Member');
    const created = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/servers`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { name: 'Редакция' } });
    const server = created.json<{ id: string; inviteUrl: string; channels: Array<{ id: string; type: string }>; roles: Array<{ id: string; isDefault: boolean }> }>();
    await context.app.inject({ method: 'POST', url: `${API_PREFIX}/invites/${inviteTokenFromUrl(server.inviteUrl)}/accept`, headers: { authorization: `Bearer ${member.accessToken}` } });
    const textChannel = server.channels.find((channel) => channel.type === 'text');
    const defaultRole = server.roles.find((role) => role.isDefault);
    if (!textChannel || !defaultRole) throw new Error('Missing default server graph');

    const deniedManagement = await context.app.inject({
      method: 'POST', url: `${API_PREFIX}/servers/${server.id}/channels`, headers: { authorization: `Bearer ${member.accessToken}` }, payload: { name: 'секреты', type: 'text' },
    });
    expect(deniedManagement.statusCode).toBe(403);

    const restricted = await context.app.inject({
      method: 'PATCH',
      url: `${API_PREFIX}/servers/${server.id}/roles/${defaultRole.id}`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { permissions: ['VIEW_SERVER', 'VIEW_CHANNEL', 'READ_MESSAGE_HISTORY'] },
    });
    expect(restricted.statusCode).toBe(200);

    const deniedMessage = await context.app.inject({
      method: 'POST', url: `${API_PREFIX}/channels/${textChannel.id}/messages`, headers: { authorization: `Bearer ${member.accessToken}` }, payload: { content: 'Пока нельзя' },
    });
    expect(deniedMessage.statusCode).toBe(403);

    const roleResponse = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/servers/${server.id}/roles`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { name: 'Автор', color: '#47a878', permissions: ['VIEW_SERVER', 'VIEW_CHANNEL', 'READ_MESSAGE_HISTORY', 'SEND_MESSAGES', 'SEND_ATTACHMENTS', 'ADD_REACTIONS', 'MANAGE_OWN_MESSAGES'] },
    });
    expect(roleResponse.statusCode).toBe(201);
    const roleId = roleResponse.json<{ id: string }>().id;
    const assigned = await context.app.inject({
      method: 'PUT',
      url: `${API_PREFIX}/servers/${server.id}/members/${member.userId}/roles`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { roleIds: [roleId] },
    });
    expect(assigned.statusCode).toBe(204);

    const sent = await context.app.inject({
      method: 'POST', url: `${API_PREFIX}/channels/${textChannel.id}/messages`, headers: { authorization: `Bearer ${member.accessToken}` }, payload: { content: 'Теперь можно писать' },
    });
    expect(sent.statusCode).toBe(201);
    const sentMessage = sent.json<{ id: string; authorDisplayName: string; replyTo: unknown; reactions: unknown[]; attachments: unknown[] }>();
    expect(sentMessage.authorDisplayName).toBe('Member');
    expect(sentMessage.replyTo).toBeNull();
    expect(sentMessage.reactions).toEqual([]);
    expect(sentMessage.attachments).toEqual([]);

    const attachmentOnly = await context.app.inject({
      method: 'POST', url: `${API_PREFIX}/channels/${textChannel.id}/messages`, headers: { authorization: `Bearer ${member.accessToken}` }, payload: { content: '' },
    });
    expect(attachmentOnly.statusCode).toBe(201);
    expect(attachmentOnly.json<{ content: string }>().content).toBe('');

    const fileContent = Buffer.from('Vatrushka attachment');
    const multipart = multipartFile('notes.txt', 'text/plain', fileContent);
    const uploaded = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/messages/${sentMessage.id}/attachments`,
      headers: { authorization: `Bearer ${member.accessToken}`, 'content-type': multipart.contentType },
      payload: multipart.payload,
    });
    expect(uploaded.statusCode).toBe(201);
    const attachmentMessage = uploaded.json<{ attachments: Array<{ id: string; fileName: string; mimeType: string; size: number }> }>();
    expect(attachmentMessage.attachments).toEqual([expect.objectContaining({ fileName: 'notes.txt', mimeType: 'text/plain', size: fileContent.length })]);
    const attachmentId = attachmentMessage.attachments[0]?.id;
    if (!attachmentId) throw new Error('Attachment was not created');

    const downloaded = await context.app.inject({
      method: 'GET',
      url: `${API_PREFIX}/attachments/${attachmentId}/content`,
      headers: { authorization: `Bearer ${member.accessToken}` },
    });
    expect(downloaded.statusCode).toBe(200);
    expect(downloaded.headers['x-content-type-options']).toBe('nosniff');
    expect(downloaded.rawPayload).toEqual(fileContent);

    const ownerCannotAppend = multipartFile('owner.txt', 'text/plain', Buffer.from('no'));
    const deniedAttachment = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/messages/${sentMessage.id}/attachments`,
      headers: { authorization: `Bearer ${owner.accessToken}`, 'content-type': ownerCannotAppend.contentType },
      payload: ownerCannotAppend.payload,
    });
    expect(deniedAttachment.statusCode).toBe(403);

    const disallowed = multipartFile('script.html', 'text/html', Buffer.from('<script></script>'));
    const rejectedAttachment = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/messages/${sentMessage.id}/attachments`,
      headers: { authorization: `Bearer ${member.accessToken}`, 'content-type': disallowed.contentType },
      payload: disallowed.payload,
    });
    expect(rejectedAttachment.statusCode).toBe(400);
    expect(rejectedAttachment.json<{ code: string }>().code).toBe('ATTACHMENT_TYPE_NOT_ALLOWED');

    const tooLarge = multipartFile('too-large.txt', 'text/plain', Buffer.alloc(MAX_ATTACHMENT_BYTES + 1, 1));
    const rejectedSize = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/messages/${sentMessage.id}/attachments`,
      headers: { authorization: `Bearer ${member.accessToken}`, 'content-type': tooLarge.contentType },
      payload: tooLarge.payload,
    });
    expect(rejectedSize.statusCode).toBe(413);
    expect(rejectedSize.json<{ code: string }>().code).toBe('ATTACHMENT_TOO_LARGE');

    const replied = await context.app.inject({
      method: 'POST', url: `${API_PREFIX}/channels/${textChannel.id}/messages`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { content: 'Отвечаю по теме', replyToMessageId: sentMessage.id },
    });
    expect(replied.statusCode).toBe(201);
    const repliedMessage = replied.json<{ id: string; replyTo: { messageId: string; authorDisplayName: string } }>();
    expect(repliedMessage.replyTo).toEqual(expect.objectContaining({ messageId: sentMessage.id, authorDisplayName: 'Member' }));

    const notificationBaseline = await context.app.inject({
      method: 'GET',
      url: `${API_PREFIX}/notifications/messages?limit=20`,
      headers: { authorization: `Bearer ${member.accessToken}` },
    });
    expect(notificationBaseline.statusCode).toBe(200);
    expect(notificationBaseline.json()).toEqual({ items: [], cursor: { createdAt: context.clock.now.toISOString(), id: null } });

    const notifications = await context.app.inject({
      method: 'GET',
      url: `${API_PREFIX}/notifications/messages?since=${encodeURIComponent('2025-12-31T23:59:59.000Z')}&limit=20`,
      headers: { authorization: `Bearer ${member.accessToken}` },
    });
    expect(notifications.statusCode).toBe(200);
    expect(notifications.json<{ items: Array<{ id: string; serverId: string; channelId: string; authorDisplayName: string }>; cursor: { id: string } }>().items).toEqual([
      expect.objectContaining({ id: repliedMessage.id, serverId: server.id, channelId: textChannel.id, authorDisplayName: 'Owner' }),
    ]);
    expect(notifications.json<{ cursor: { id: string } }>().cursor.id).toBe(repliedMessage.id);
    const afterNotification = await context.app.inject({
      method: 'GET',
      url: `${API_PREFIX}/notifications/messages?since=${encodeURIComponent(context.clock.now.toISOString())}&afterId=${repliedMessage.id}&limit=20`,
      headers: { authorization: `Bearer ${member.accessToken}` },
    });
    expect(afterNotification.statusCode).toBe(200);
    expect(afterNotification.json<{ items: unknown[]; cursor: null }>()).toEqual({ items: [], cursor: null });

    const unreadServer = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/servers/${server.id}`, headers: { authorization: `Bearer ${member.accessToken}` } });
    const unreadChannel = unreadServer.json<{ channels: Array<{ id: string; unreadCount: number }> }>().channels.find((channel) => channel.id === textChannel.id);
    expect(unreadChannel?.unreadCount).toBe(1);
    const markedRead = await context.app.inject({ method: 'PUT', url: `${API_PREFIX}/channels/${textChannel.id}/read`, headers: { authorization: `Bearer ${member.accessToken}` }, payload: { messageId: repliedMessage.id } });
    expect(markedRead.statusCode).toBe(204);
    const readServer = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/servers/${server.id}`, headers: { authorization: `Bearer ${member.accessToken}` } });
    expect(readServer.json<{ channels: Array<{ id: string; unreadCount: number }> }>().channels.find((channel) => channel.id === textChannel.id)?.unreadCount).toBe(0);

    const reacted = await context.app.inject({ method: 'PUT', url: `${API_PREFIX}/messages/${sentMessage.id}/reactions/${encodeURIComponent('👍')}`, headers: { authorization: `Bearer ${member.accessToken}` } });
    expect(reacted.statusCode).toBe(200);
    expect(reacted.json<{ reactions: Array<{ emoji: string; count: number; reactedByCurrentUser: boolean }> }>().reactions).toEqual([{ emoji: '👍', count: 1, reactedByCurrentUser: true }]);
    const duplicateReaction = await context.app.inject({ method: 'PUT', url: `${API_PREFIX}/messages/${sentMessage.id}/reactions/${encodeURIComponent('👍')}`, headers: { authorization: `Bearer ${member.accessToken}` } });
    expect(duplicateReaction.json<{ reactions: Array<{ count: number }> }>().reactions[0]?.count).toBe(1);
    const unreacted = await context.app.inject({ method: 'DELETE', url: `${API_PREFIX}/messages/${sentMessage.id}/reactions/${encodeURIComponent('👍')}`, headers: { authorization: `Bearer ${member.accessToken}` } });
    expect(unreacted.statusCode).toBe(200);
    expect(unreacted.json<{ reactions: unknown[] }>().reactions).toEqual([]);

    const messages = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/channels/${textChannel.id}/messages`, headers: { authorization: `Bearer ${member.accessToken}` } });
    expect(messages.statusCode).toBe(200);
    const listedMessage = messages.json<Array<{ id: string; attachments: Array<{ id: string }> }>>().find((message) => message.id === sentMessage.id);
    expect(listedMessage?.attachments).toEqual([expect.objectContaining({ id: attachmentId })]);
    const removedAttachment = await context.app.inject({ method: 'DELETE', url: `${API_PREFIX}/attachments/${attachmentId}`, headers: { authorization: `Bearer ${member.accessToken}` } });
    expect(removedAttachment.statusCode).toBe(200);
    expect(removedAttachment.json<{ attachments: unknown[] }>().attachments).toEqual([]);
    expect(messages.json<Array<{ content: string }>>()).toEqual(expect.arrayContaining([expect.objectContaining({ content: 'Теперь можно писать' }), expect.objectContaining({ content: 'Отвечаю по теме' })]));
  });

  it('stores structured mentions, validates recipients, and counts each mentioned message once', async () => {
    const owner = await login('mention-owner@example.com', 'Owner');
    const member = await login('mention-member@example.com', 'Member');
    const outsider = await login('mention-outsider@example.com', 'Outsider');
    const created = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/servers`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { name: 'Mentions' } });
    const server = created.json<{ id: string; inviteUrl: string; channels: Array<{ id: string; type: string }> }>();
    await context.app.inject({ method: 'POST', url: `${API_PREFIX}/invites/${inviteTokenFromUrl(server.inviteUrl)}/accept`, headers: { authorization: `Bearer ${member.accessToken}` } });
    const channel = server.channels.find((candidate) => candidate.type === 'text');
    if (!channel) throw new Error('Text channel was not created');

    const content = '👋 @Member и снова @Member';
    const sent = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/channels/${channel.id}/messages`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { content, mentions: [{ userId: member.userId, start: 2, length: 7 }, { userId: member.userId, start: 18, length: 7 }] },
    });
    expect(sent.statusCode).toBe(201);
    const message = sent.json<{ id: string; mentions: Array<{ userId: string; start: number; length: number; displayName: string }> }>();
    expect(message.mentions).toEqual([
      { userId: member.userId, start: 2, length: 7, displayName: 'Member' },
      { userId: member.userId, start: 18, length: 7, displayName: 'Member' },
    ]);

    const detail = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/servers/${server.id}`, headers: { authorization: `Bearer ${member.accessToken}` } });
    expect(detail.json<{ channels: Array<{ id: string; mentionCount: number }> }>().channels.find((candidate) => candidate.id === channel.id)?.mentionCount).toBe(1);
    const notifications = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/notifications/messages?since=${encodeURIComponent('2025-12-31T23:59:59.000Z')}`, headers: { authorization: `Bearer ${member.accessToken}` } });
    expect(notifications.json<{ items: Array<{ id: string; mention: boolean }> }>().items).toEqual([expect.objectContaining({ id: message.id, mention: true })]);

    const rejected = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/channels/${channel.id}/messages`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { content: '@Outsider', mentions: [{ userId: outsider.userId, start: 0, length: 9 }] },
    });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json<{ details: { field: string } }>().details.field).toBe('mentions');

    await context.app.inject({ method: 'PATCH', url: `${API_PREFIX}/me`, headers: { authorization: `Bearer ${member.accessToken}` }, payload: { displayName: 'Renamed' } });
    const listed = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/channels/${channel.id}/messages`, headers: { authorization: `Bearer ${member.accessToken}` } });
    expect(listed.json<Array<{ id: string; mentions: Array<{ displayName: string }> }>>().find((candidate) => candidate.id === message.id)?.mentions.map((mention) => mention.displayName)).toEqual(['Renamed', 'Renamed']);

    const edited = await context.app.inject({ method: 'PATCH', url: `${API_PREFIX}/messages/${message.id}`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { content: 'Без упоминаний', mentions: [] } });
    expect(edited.statusCode).toBe(200);
    expect(edited.json<{ mentions: unknown[] }>().mentions).toEqual([]);
    const afterEdit = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/servers/${server.id}`, headers: { authorization: `Bearer ${member.accessToken}` } });
    expect(afterEdit.json<{ channels: Array<{ id: string; mentionCount: number }> }>().channels.find((candidate) => candidate.id === channel.id)?.mentionCount).toBe(0);
  });

  it('stores new attachments in private object storage and keeps authorization in the API', async () => {
    const objectStorage = new FakeObjectStorage();
    context = await makeContext(objectStorage);
    const owner = await login('storage-owner@example.com', 'Storage Owner');
    const created = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/servers`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { name: 'Media storage' } });
    const server = created.json<{ channels: Array<{ id: string; type: string }> }>();
    const channel = server.channels.find((candidate) => candidate.type === 'text');
    if (!channel) throw new Error('Text channel was not created');
    const sent = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/channels/${channel.id}/messages`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { content: 'S3 attachment' } });
    const messageId = sent.json<{ id: string }>().id;
    const fileContent = Buffer.from('private object content');
    const multipart = multipartFile('private.txt', 'text/plain', fileContent);

    const uploaded = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/messages/${messageId}/attachments`, headers: { authorization: `Bearer ${owner.accessToken}`, 'content-type': multipart.contentType }, payload: multipart.payload });
    expect(uploaded.statusCode).toBe(201);
    const attachmentId = uploaded.json<{ attachments: Array<{ id: string }> }>().attachments[0]?.id;
    if (!attachmentId) throw new Error('Attachment was not created');
    const record = await context.store.findMessageAttachment(attachmentId);
    expect(record?.storageKey).toMatch(/^prod\/attachments\/channels\//u);
    expect(Buffer.from(record?.content ?? [])).toEqual(fileContent);
    if (!record?.storageKey) throw new Error('Object storage key was not persisted');
    expect(objectStorage.objects.get(record.storageKey)?.content).toEqual(fileContent);

    const downloaded = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/attachments/${attachmentId}/content`, headers: { authorization: `Bearer ${owner.accessToken}` } });
    expect(downloaded.statusCode).toBe(200);
    expect(downloaded.rawPayload).toEqual(fileContent);

    objectStorage.available = false;
    const unavailable = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/attachments/${attachmentId}/content`, headers: { authorization: `Bearer ${owner.accessToken}` } });
    expect(unavailable.statusCode).toBe(200);
    expect(unavailable.rawPayload).toEqual(fileContent);
    const readiness = await context.app.inject({ method: 'GET', url: '/health/ready' });
    expect(readiness.statusCode).toBe(503);
    expect(readiness.json<{ code: string }>().code).toBe('MEDIA_STORAGE_UNAVAILABLE');
    const secondMessage = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/channels/${channel.id}/messages`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { content: 'Unavailable storage' } });
    const failedUpload = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/messages/${secondMessage.json<{ id: string }>().id}/attachments`, headers: { authorization: `Bearer ${owner.accessToken}`, 'content-type': multipart.contentType }, payload: multipart.payload });
    expect(failedUpload.statusCode).toBe(503);
    expect(failedUpload.json<{ code: string }>().code).toBe('MEDIA_STORAGE_UNAVAILABLE');
    objectStorage.available = true;

    const removed = await context.app.inject({ method: 'DELETE', url: `${API_PREFIX}/attachments/${attachmentId}`, headers: { authorization: `Bearer ${owner.accessToken}` } });
    expect(removed.statusCode).toBe(200);
    expect(objectStorage.objects.size).toBe(0);
  });

  it('connects to a persistent voice channel and coordinates screen sharing', async () => {
    const owner = await login('voice-owner@example.com', 'Owner');
    const member = await login('voice-member@example.com', 'Member');
    const created = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/servers`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { name: 'Эфирная' } });
    const server = created.json<{ id: string; inviteUrl: string; channels: Array<{ id: string; type: string }> }>();
    await context.app.inject({ method: 'POST', url: `${API_PREFIX}/invites/${inviteTokenFromUrl(server.inviteUrl)}/accept`, headers: { authorization: `Bearer ${member.accessToken}` } });
    const voice = server.channels.find((channel) => channel.type === 'voice');
    if (!voice) throw new Error('Missing voice channel');
    const connected = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/channels/${voice.id}/connect`, headers: { authorization: `Bearer ${owner.accessToken}` } });
    expect(connected.statusCode).toBe(200);
    const connection = connected.json<{ contextType: string; participantIdentity: string; voiceSessionId: string }>();
    expect(connection.contextType).toBe('channel');
    const channel = context.store.serverChannels.get(voice.id);
    if (!channel?.livekitRoomName) throw new Error('Missing LiveKit channel room');
    context.media.connect(channel.livekitRoomName, connection.participantIdentity);
    await context.service.handleWebhookEvent({
      id: 'voice-owner-joined-source',
      event: 'participant_joined',
      participant: {
        identity: connection.participantIdentity,
        metadata: JSON.stringify({
          serverId: server.id,
          channelId: voice.id,
          userId: owner.userId,
          voiceSessionId: connection.voiceSessionId,
        }),
      },
      room: { name: channel.livekitRoomName },
    });
    const claimed = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/channels/${voice.id}/screen-share/claim`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { participantIdentity: connection.participantIdentity },
    });
    expect(claimed.statusCode).toBe(200);
    expect(context.store.channelLeases.has(voice.id)).toBe(true);
    context.media.available = false;
    const heartbeatDuringMediaOutage = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/channels/${voice.id}/screen-share/heartbeat`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { participantIdentity: connection.participantIdentity },
    });
    expect(heartbeatDuringMediaOutage.statusCode).toBe(200);
    const heartbeatMetrics = await context.app.inject({ method: 'GET', url: '/metrics' });
    expect(heartbeatMetrics.body).toContain('screen_share_lease_heartbeat_total{result="renewed"} 1');
    context.media.available = true;

    const audioDenied = await context.app.inject({ method: 'PUT', url: `${API_PREFIX}/channels/${voice.id}/overwrites/MEMBER/${member.userId}`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { allow: [], deny: ['STREAM_APPLICATION_AUDIO'] } });
    expect(audioDenied.statusCode).toBe(204);
    const memberConnected = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/channels/${voice.id}/connect`, headers: { authorization: `Bearer ${member.accessToken}` } });
    expect(memberConnected.statusCode).toBe(200);
    const memberConnection = memberConnected.json<{ participantIdentity: string; voiceSessionId: string; canStream: boolean; canStreamApplicationAudio: boolean }>();
    expect(memberConnection).toEqual(expect.objectContaining({ canStream: true, canStreamApplicationAudio: false }));
    expect(context.media.tokens.at(-1)).toEqual(expect.objectContaining({ canPublishScreen: true, canPublishScreenAudio: false }));
    context.media.connect(channel.livekitRoomName, memberConnection.participantIdentity);
    await context.service.handleWebhookEvent({
      id: 'voice-member-joined-source',
      event: 'participant_joined',
      participant: {
        identity: memberConnection.participantIdentity,
        metadata: JSON.stringify({
          serverId: server.id,
          channelId: voice.id,
          userId: member.userId,
          voiceSessionId: memberConnection.voiceSessionId,
        }),
      },
      room: { name: channel.livekitRoomName },
    });
    context.media.available = false;
    const claimDuringMediaOutage = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/channels/${voice.id}/screen-share/claim`,
      headers: { authorization: `Bearer ${member.accessToken}` },
      payload: { participantIdentity: memberConnection.participantIdentity },
    });
    expect(claimDuringMediaOutage.statusCode).toBe(503);
    expect(claimDuringMediaOutage.json<{ code: string; requestId: string }>()).toEqual(expect.objectContaining({
      code: 'LIVEKIT_UNAVAILABLE',
      requestId: expect.any(String),
    }));
    const errorMetrics = await context.app.inject({ method: 'GET', url: '/metrics' });
    expect(errorMetrics.body).toContain('api_errors_total{code="LIVEKIT_UNAVAILABLE",route="/api/v1/channels/:channelId/screen-share/claim",status_class="5xx"} 1');
    const initialVoiceState = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/servers/${server.id}/voice-state`, headers: { authorization: `Bearer ${owner.accessToken}` } });
    context.media.available = true;
    expect(initialVoiceState.statusCode).toBe(200);
    const initialVoiceSnapshot = initialVoiceState.json<{ version: number; channels: Array<{ channelId: string; members: Array<{ userId: string }> }> }>();
    expect(initialVoiceSnapshot.version).toBeGreaterThanOrEqual(2);
    expect(initialVoiceSnapshot.channels).toEqual([
      expect.objectContaining({
        channelId: voice.id,
        members: expect.arrayContaining([
          expect.objectContaining({ userId: owner.userId }),
          expect.objectContaining({ userId: member.userId }),
        ]),
      }),
    ]);
    const updateOwnVoiceState = await context.app.inject({
      method: 'PATCH',
      url: `${API_PREFIX}/channels/${voice.id}/voice-state`,
      headers: { authorization: `Bearer ${member.accessToken}` },
      payload: {
        sessionId: memberConnection.voiceSessionId,
        muted: true,
        deafened: true,
        speaking: true,
        connectionQuality: 'good',
      },
    });
    expect(updateOwnVoiceState.statusCode).toBe(204);
    const updatedOwnVoiceState = await context.app.inject({
      method: 'GET',
      url: `${API_PREFIX}/servers/${server.id}/voice-state`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(
      updatedOwnVoiceState
        .json<{
          channels: Array<{
            channelId: string;
            members: Array<{
              userId: string;
              muted: boolean;
              deafened: boolean;
            }>;
          }>;
        }>()
        .channels.find((candidate) => candidate.channelId === voice.id)
        ?.members.find((candidate) => candidate.userId === member.userId),
    ).toEqual(expect.objectContaining({ muted: true, deafened: true }));
    const staleOwnVoiceState = await context.app.inject({
      method: 'PATCH',
      url: `${API_PREFIX}/channels/${voice.id}/voice-state`,
      headers: { authorization: `Bearer ${member.accessToken}` },
      payload: {
        sessionId: 'stale-session',
        muted: false,
        deafened: false,
        speaking: false,
        connectionQuality: 'unknown',
      },
    });
    expect(staleOwnVoiceState.statusCode).toBe(409);
    expect(staleOwnVoiceState.json<{ code: string }>().code).toBe(
      'VOICE_SOURCE_CHANGED',
    );
    const serverWithPresence = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/servers/${server.id}`, headers: { authorization: `Bearer ${owner.accessToken}` } });
    const voiceWithPresence = serverWithPresence.json<{ channels: Array<{ id: string; voiceParticipants?: Array<{ userId: string; identity: string }> }> }>().channels.find((candidate) => candidate.id === voice.id);
    expect(voiceWithPresence?.voiceParticipants).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: owner.userId, identity: connection.participantIdentity }),
      expect.objectContaining({ userId: member.userId, identity: memberConnection.participantIdentity }),
    ]));

    const busyClaim = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/channels/${voice.id}/screen-share/claim`, headers: { authorization: `Bearer ${member.accessToken}` }, payload: { participantIdentity: memberConnection.participantIdentity } });
    expect(busyClaim.statusCode).toBe(409);
    expect(busyClaim.json<{ code: string }>().code).toBe('SCREEN_SHARE_BUSY');
    context.clock.now = new Date(context.clock.now.getTime() + 31_000);
    const afterExpiry = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/channels/${voice.id}/screen-share/claim`, headers: { authorization: `Bearer ${member.accessToken}` }, payload: { participantIdentity: memberConnection.participantIdentity } });
    expect(afterExpiry.statusCode).toBe(200);

    const secondVoiceResponse = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/servers/${server.id}/channels`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { name: 'Вторая голосовая', type: 'voice' } });
    expect(secondVoiceResponse.statusCode).toBe(201);
    const secondVoice = secondVoiceResponse.json<{ id: string }>();
    const movePayload = {
      clientRequestId: '11111111-1111-4111-8111-111111111111',
      subjectUserId: member.userId,
      targetChannelId: secondVoice.id,
      expectedSourceChannelId: voice.id,
      expectedVoiceSessionId: memberConnection.voiceSessionId,
    };
    const moved = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/servers/${server.id}/voice/moves`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: movePayload });
    expect(moved.statusCode).toBe(202);
    const accepted = moved.json<{ movementId: string; status: string }>();
    expect(accepted.status).toBe('pending');
    const duplicateMove = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/servers/${server.id}/voice/moves`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: movePayload });
    expect(duplicateMove.statusCode).toBe(202);
    expect(duplicateMove.json<{ movementId: string }>().movementId).toBe(accepted.movementId);
    expect(context.media.rooms.get(channel.livekitRoomName)?.has(memberConnection.participantIdentity)).toBe(false);
    expect([...context.media.rooms.entries()].some(([roomName, participants]) => roomName !== channel.livekitRoomName && participants.has(memberConnection.participantIdentity))).toBe(true);
    const acceptedMove = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/voice/move-request`, headers: { authorization: `Bearer ${member.accessToken}` } });
    expect(acceptedMove.statusCode).toBe(200);
    expect(acceptedMove.json<{ channelId: string; channelName: string; seamlesslyMoved: boolean }>()).toEqual(expect.objectContaining({ channelId: secondVoice.id, channelName: 'вторая голосовая', seamlesslyMoved: true }));
    const targetChannel = context.store.serverChannels.get(secondVoice.id);
    if (!targetChannel?.livekitRoomName) throw new Error('Missing target LiveKit room');
    await context.service.handleWebhookEvent({
      id: 'voice-member-joined-target',
      event: 'participant_joined',
      participant: {
        identity: memberConnection.participantIdentity,
        metadata: JSON.stringify({
          serverId: server.id,
          channelId: secondVoice.id,
          userId: member.userId,
          voiceSessionId: memberConnection.voiceSessionId,
        }),
      },
      room: { name: targetChannel.livekitRoomName },
    });
    const movedVoiceState = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/servers/${server.id}/voice-state`, headers: { authorization: `Bearer ${owner.accessToken}` } });
    expect(movedVoiceState.json<{ version: number; channels: Array<{ channelId: string; members: Array<{ userId: string }> }> }>()).toEqual(expect.objectContaining({
      version: initialVoiceSnapshot.version + 1,
      channels: expect.arrayContaining([expect.objectContaining({ channelId: secondVoice.id, members: [expect.objectContaining({ userId: member.userId })] })]),
    }));
    const consumedMove = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/voice/move-request`, headers: { authorization: `Bearer ${member.accessToken}` } });
    expect(consumedMove.json()).toBeNull();
  });

  it('creates private one-to-one conversations only for users sharing a server', async () => {
    context = await makeContext(new FakeObjectStorage());
    const anna = await login('dm-anna@example.com', 'Anna');
    const boris = await login('dm-boris@example.com', 'Boris');
    const outsider = await login('dm-outsider@example.com', 'Outsider');
    const borisRecord = context.store.users.get(boris.userId);
    if (!borisRecord) throw new Error('Boris was not created');
    context.store.users.set(boris.userId, { ...borisRecord, avatarObjectKey: 'profiles/boris/avatar.webp' });

    const deniedWithoutSharedServer = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/direct-conversations`, headers: { authorization: `Bearer ${anna.accessToken}` }, payload: { userId: boris.userId } });
    expect(deniedWithoutSharedServer.statusCode).toBe(403);

    const createdServer = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/servers`, headers: { authorization: `Bearer ${anna.accessToken}` }, payload: { name: 'DM community' } });
    const server = createdServer.json<{ inviteUrl: string }>();
    await context.app.inject({ method: 'POST', url: `${API_PREFIX}/invites/${inviteTokenFromUrl(server.inviteUrl)}/accept`, headers: { authorization: `Bearer ${boris.accessToken}` } });

    const candidates = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/direct-conversations/candidates`, headers: { authorization: `Bearer ${anna.accessToken}` } });
    expect(candidates.statusCode).toBe(200);
    expect(candidates.json<Array<{ userId: string; displayName: string; avatarUrl: string; sharedServerNames: string[] }>>()).toEqual([expect.objectContaining({ userId: boris.userId, displayName: 'Boris', avatarUrl: 'https://storage.test/get/profiles%2Fboris%2Favatar.webp', sharedServerNames: ['DM community'] })]);

    const createdConversation = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/direct-conversations`, headers: { authorization: `Bearer ${anna.accessToken}` }, payload: { userId: boris.userId } });
    expect(createdConversation.statusCode).toBe(201);
    const conversation = createdConversation.json<{ id: string; participant: { userId: string; avatarUrl: string }; unreadCount: number }>();
    expect(conversation.participant.userId).toBe(boris.userId);
    expect(conversation.participant.avatarUrl).toBe('https://storage.test/get/profiles%2Fboris%2Favatar.webp');
    const sameConversation = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/direct-conversations`, headers: { authorization: `Bearer ${boris.accessToken}` }, payload: { userId: anna.userId } });
    expect(sameConversation.json<{ id: string }>().id).toBe(conversation.id);

    const sent = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/direct-conversations/${conversation.id}/messages`, headers: { authorization: `Bearer ${anna.accessToken}` }, payload: { content: 'Привет в личке' } });
    expect(sent.statusCode).toBe(201);
    const sentMessage = sent.json<{ id: string; attachments: unknown[]; reactions: unknown[] }>();
    expect(sentMessage.attachments).toEqual([]);
    expect(sentMessage.reactions).toEqual([]);

    const borisConversations = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/direct-conversations`, headers: { authorization: `Bearer ${boris.accessToken}` } });
    expect(borisConversations.json<Array<{ id: string; unreadCount: number; lastMessage: { content: string } }>>()).toEqual([expect.objectContaining({ id: conversation.id, unreadCount: 1, lastMessage: expect.objectContaining({ content: 'Привет в личке' }) })]);

    const listed = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/direct-conversations/${conversation.id}/messages?limit=100`, headers: { authorization: `Bearer ${boris.accessToken}` } });
    expect(listed.statusCode).toBe(200);
    expect(listed.json<Array<{ id: string }>>()).toEqual([expect.objectContaining({ id: sentMessage.id })]);
    const outsiderDenied = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/direct-conversations/${conversation.id}/messages?limit=100`, headers: { authorization: `Bearer ${outsider.accessToken}` } });
    expect(outsiderDenied.statusCode).toBe(404);

    const markedRead = await context.app.inject({ method: 'PUT', url: `${API_PREFIX}/direct-conversations/${conversation.id}/read`, headers: { authorization: `Bearer ${boris.accessToken}` }, payload: { messageId: sentMessage.id } });
    expect(markedRead.statusCode).toBe(204);
    const readConversations = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/direct-conversations`, headers: { authorization: `Bearer ${boris.accessToken}` } });
    expect(readConversations.json<Array<{ unreadCount: number }>>()[0]?.unreadCount).toBe(0);

    const replied = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/direct-conversations/${conversation.id}/messages`, headers: { authorization: `Bearer ${boris.accessToken}` }, payload: { content: 'Привет!', replyToMessageId: sentMessage.id } });
    expect(replied.statusCode).toBe(201);
    const replyMessage = replied.json<{ id: string; replyTo: { messageId: string } }>();
    expect(replyMessage.replyTo.messageId).toBe(sentMessage.id);
    const forbiddenEdit = await context.app.inject({ method: 'PATCH', url: `${API_PREFIX}/direct-messages/${replyMessage.id}`, headers: { authorization: `Bearer ${anna.accessToken}` }, payload: { content: 'Подмена' } });
    expect(forbiddenEdit.statusCode).toBe(404);

    const reacted = await context.app.inject({ method: 'PUT', url: `${API_PREFIX}/direct-messages/${replyMessage.id}/reactions/${encodeURIComponent('👍')}`, headers: { authorization: `Bearer ${anna.accessToken}` } });
    expect(reacted.statusCode).toBe(200);
    expect(reacted.json<{ reactions: Array<{ emoji: string; count: number }> }>().reactions).toEqual([{ emoji: '👍', count: 1, reactedByCurrentUser: true }]);

    const dmFile = multipartFile('private.txt', 'text/plain', Buffer.from('private attachment'));
    const uploaded = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/direct-messages/${replyMessage.id}/attachments`, headers: { authorization: `Bearer ${boris.accessToken}`, 'content-type': dmFile.contentType }, payload: dmFile.payload });
    expect(uploaded.statusCode).toBe(201);
    const attachmentId = uploaded.json<{ attachments: Array<{ id: string }> }>().attachments[0]?.id;
    if (!attachmentId) throw new Error('Direct attachment was not created');
    const downloaded = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/direct-attachments/${attachmentId}/content`, headers: { authorization: `Bearer ${anna.accessToken}` } });
    expect(downloaded.rawPayload.toString()).toBe('private attachment');
    const outsiderDownload = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/direct-attachments/${attachmentId}/content`, headers: { authorization: `Bearer ${outsider.accessToken}` } });
    expect(outsiderDownload.statusCode).toBe(404);
    const removed = await context.app.inject({ method: 'DELETE', url: `${API_PREFIX}/direct-attachments/${attachmentId}`, headers: { authorization: `Bearer ${boris.accessToken}` } });
    expect(removed.statusCode).toBe(200);
    expect(removed.json<{ attachments: unknown[] }>().attachments).toEqual([]);
  });

  it('enforces channel overwrites, protects hierarchy, and records role audit events', async () => {
    const owner = await login('permissions-owner@example.com', 'Owner');
    const member = await login('permissions-member@example.com', 'Member');
    const created = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/servers`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { name: 'Закрытый клуб' } });
    const server = created.json<{ id: string; inviteUrl: string; channels: Array<{ id: string; type: string }>; roles: Array<{ id: string; kind: string }> }>();
    await context.app.inject({ method: 'POST', url: `${API_PREFIX}/invites/${inviteTokenFromUrl(server.inviteUrl)}/accept`, headers: { authorization: `Bearer ${member.accessToken}` } });
    const channel = server.channels.find((candidate) => candidate.type === 'text');
    if (!channel) throw new Error('Text channel was not created');

    const hidden = await context.app.inject({ method: 'PUT', url: `${API_PREFIX}/channels/${channel.id}/overwrites/MEMBER/${member.userId}`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { allow: [], deny: ['VIEW_CHANNEL'] } });
    expect(hidden.statusCode).toBe(204);
    const hiddenDetail = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/servers/${server.id}`, headers: { authorization: `Bearer ${member.accessToken}` } });
    expect(hiddenDetail.json<{ channels: Array<{ id: string }> }>().channels.some((candidate) => candidate.id === channel.id)).toBe(false);
    const deniedRead = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/channels/${channel.id}/messages`, headers: { authorization: `Bearer ${member.accessToken}` } });
    expect(deniedRead.statusCode).toBe(403);

    const restored = await context.app.inject({ method: 'PUT', url: `${API_PREFIX}/channels/${channel.id}/overwrites/MEMBER/${member.userId}`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { allow: [], deny: [] } });
    expect(restored.statusCode).toBe(204);
    const visibleDetail = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/servers/${server.id}`, headers: { authorization: `Bearer ${member.accessToken}` } });
    expect(visibleDetail.json<{ channels: Array<{ id: string }> }>().channels.some((candidate) => candidate.id === channel.id)).toBe(true);

    const role = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/servers/${server.id}/roles`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { name: 'Модератор', color: '#47a878', permissions: ['VIEW_SERVER', 'VIEW_CHANNEL', 'READ_MESSAGE_HISTORY'] } });
    const roleId = role.json<{ id: string }>().id;
    expect((await context.app.inject({ method: 'PATCH', url: `${API_PREFIX}/servers/${server.id}/roles/${roleId}/position`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { position: 50 } })).statusCode).toBe(200);
    const speakerRole = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/servers/${server.id}/roles`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { name: 'Ведущий', color: '#53a6a6', permissions: ['VIEW_SERVER', 'VIEW_CHANNEL'] } });
    const speakerRoleId = speakerRole.json<{ id: string }>().id;
    expect((await context.app.inject({ method: 'PATCH', url: `${API_PREFIX}/servers/${server.id}/roles/${speakerRoleId}/position`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { position: 50 } })).statusCode).toBe(200);
    const reorderedDetail = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/servers/${server.id}`, headers: { authorization: `Bearer ${owner.accessToken}` } });
    const reorderedRoles = reorderedDetail.json<{ roles: Array<{ id: string; position: number }> }>().roles;
    expect(reorderedRoles.find((candidate) => candidate.id === speakerRoleId)?.position).toBe(50);
    expect(reorderedRoles.find((candidate) => candidate.id === roleId)?.position).toBe(51);

    const memberRecord = context.store.users.get(member.userId);
    if (!memberRecord) throw new Error('Member record was not created');
    memberRecord.platformRole = 'admin';
    const platformAdminDenied = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/servers/${server.id}/roles`, headers: { authorization: `Bearer ${member.accessToken}` }, payload: { name: 'Обход', color: '#a86b4b', permissions: ['MANAGE_ROLES'] } });
    expect(platformAdminDenied.statusCode).toBe(403);

    expect((await context.app.inject({ method: 'DELETE', url: `${API_PREFIX}/servers/${server.id}/roles/${roleId}`, headers: { authorization: `Bearer ${owner.accessToken}` } })).statusCode).toBe(204);
    expect((await context.app.inject({ method: 'DELETE', url: `${API_PREFIX}/servers/${server.id}/roles/${speakerRoleId}`, headers: { authorization: `Bearer ${owner.accessToken}` } })).statusCode).toBe(204);
    const audit = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/servers/${server.id}/audit-log`, headers: { authorization: `Bearer ${owner.accessToken}` } });
    expect(audit.statusCode).toBe(200);
    expect(audit.json<Array<{ action: string }>>().map((entry) => entry.action)).toEqual(expect.arrayContaining(['CHANNEL_OVERWRITE_UPDATED', 'ROLE_CREATED', 'ROLE_REORDERED', 'ROLE_DELETED']));
  });
});

describe('presence and privacy API', () => {
  it('aggregates heartbeat state, persists DND/privacy, and suppresses external notification delivery', async () => {
    const owner = await login('presence-owner@example.com', 'Presence Owner');
    const member = await login('presence-member@example.com', 'Presence Member');
    const ownerAuthorization = { authorization: `Bearer ${owner.accessToken}` };
    const memberAuthorization = { authorization: `Bearer ${member.accessToken}` };

    const heartbeat = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/me/presence/heartbeat`, headers: memberAuthorization, payload: { idle: false } });
    expect(heartbeat.statusCode).toBe(200);
    expect(heartbeat.json<{ effectiveStatus: string }>().effectiveStatus).toBe('online');

    const dnd = await context.app.inject({ method: 'PATCH', url: `${API_PREFIX}/me/presence`, headers: memberAuthorization, payload: { preference: 'do_not_disturb', customText: 'Фокус', customTextExpiresAt: '2026-01-01T04:00:00.000Z' } });
    expect(dnd.json()).toMatchObject({ preference: 'do_not_disturb', effectiveStatus: 'dnd', customText: 'Фокус' });
    const privacy = await context.app.inject({ method: 'PATCH', url: `${API_PREFIX}/me/privacy`, headers: memberAuthorization, payload: { directMessages: 'nobody', presenceVisibility: 'nobody', activityVisible: false } });
    expect(privacy.json()).toMatchObject({ directMessages: 'nobody', presenceVisibility: 'nobody', activityVisible: false });

    const created = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/servers`, headers: ownerAuthorization, payload: { name: 'Presence server' } });
    const server = created.json<{ id: string; inviteUrl: string; channels: Array<{ id: string; type: string }> }>();
    await context.app.inject({ method: 'POST', url: `${API_PREFIX}/invites/${inviteTokenFromUrl(server.inviteUrl)}/accept`, headers: memberAuthorization });
    const ownerView = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/servers/${server.id}`, headers: ownerAuthorization });
    expect(ownerView.json<{ members: Array<{ userId: string; presence: string; customStatusText: string | null }> }>().members.find((candidate) => candidate.userId === member.userId)).toMatchObject({ presence: 'offline', customStatusText: null });
    const selfView = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/servers/${server.id}`, headers: memberAuthorization });
    expect(selfView.json<{ members: Array<{ userId: string; presence: string; customStatusText: string | null }> }>().members.find((candidate) => candidate.userId === member.userId)).toMatchObject({ presence: 'dnd', customStatusText: 'Фокус' });
    const textChannel = server.channels.find((channel) => channel.type === 'text');
    if (!textChannel) throw new Error('Text channel was not created');
    const baseline = context.clock.now.toISOString();
    context.clock.now = new Date(context.clock.now.getTime() + 1_000);
    await context.app.inject({ method: 'POST', url: `${API_PREFIX}/channels/${textChannel.id}/messages`, headers: ownerAuthorization, payload: { content: 'Сообщение для DND' } });
    const notifications = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/notifications/messages?since=${encodeURIComponent(baseline)}&limit=20`, headers: memberAuthorization });
    expect(notifications.statusCode).toBe(200);
    expect(notifications.json<{ items: unknown[]; cursor: unknown }>().items).toEqual([]);
    expect(notifications.json<{ cursor: unknown }>().cursor).not.toBeNull();

    const candidates = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/direct-conversations/candidates`, headers: ownerAuthorization });
    expect(candidates.json<Array<{ userId: string }>>()).not.toContainEqual(expect.objectContaining({ userId: member.userId }));
    const deniedDirect = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/direct-conversations`, headers: ownerAuthorization, payload: { userId: member.userId } });
    expect(deniedDirect.statusCode).toBe(403);

    context.clock.now = new Date(context.clock.now.getTime() + 76_000);
    const expired = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/me/presence`, headers: memberAuthorization });
    expect(expired.json()).toMatchObject({ preference: 'do_not_disturb', effectiveStatus: 'offline' });
  });
});

describe('screen-share lease and webhooks', () => {
  it('rejects an unsigned webhook and releases a lease on a signed participant_left event', async () => {
    const rejected = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/webhooks/livekit`,
      headers: { authorization: 'invalid', 'content-type': 'application/json' },
      payload: JSON.stringify({ event: 'participant_left' }),
    });
    expect(rejected.statusCode).toBe(401);

    const owner = await login('owner@example.com', 'Owner');
    const created = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/servers`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { name: 'Webhook voice' } });
    const server = created.json<{ channels: Array<{ id: string; type: string }> }>();
    const voice = server.channels.find((channel) => channel.type === 'voice');
    if (!voice) throw new Error('Missing voice channel');
    const connected = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/channels/${voice.id}/connect`, headers: { authorization: `Bearer ${owner.accessToken}` } });
    const connection = connected.json<{ participantIdentity: string }>();
    const channel = context.store.serverChannels.get(voice.id);
    if (!channel?.livekitRoomName) throw new Error('Missing LiveKit channel room');
    context.media.connect(channel.livekitRoomName, connection.participantIdentity);
    await context.app.inject({ method: 'POST', url: `${API_PREFIX}/channels/${voice.id}/screen-share/claim`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { participantIdentity: connection.participantIdentity } });
    expect(context.store.channelLeases.has(voice.id)).toBe(true);

    const body = JSON.stringify({ event: 'participant_left', participant: { identity: connection.participantIdentity } });
    const signingToken = new AccessToken(context.config.LIVEKIT_API_KEY, context.config.LIVEKIT_API_SECRET);
    signingToken.sha256 = createHash('sha256').update(body).digest('base64');
    const authorization = await signingToken.toJwt();
    const accepted = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/webhooks/livekit`,
      headers: { authorization, 'content-type': 'application/json' },
      payload: body,
    });
    expect(accepted.statusCode).toBe(204);
    expect(context.store.channelLeases.has(voice.id)).toBe(false);
  });

  it('accepts LiveKit webhook content type before verifying its signature', async () => {
    const rejected = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/webhooks/livekit`,
      headers: { authorization: 'invalid', 'content-type': 'application/webhook+json' },
      payload: JSON.stringify({ event: 'participant_left' }),
    });
    expect(rejected.statusCode).toBe(401);
  });
});
