import { createHash } from 'node:crypto';

import { AccessToken } from 'livekit-server-sdk';
import { beforeEach, describe, expect, it } from 'vitest';

import { API_PREFIX } from '@vatrushka/shared';

import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { VatrushkaService } from './service.js';
import { FakeMailer, FakeMediaService } from './testing/fakes.js';
import { MemoryStore } from './testing/memory-store.js';

interface TestContext {
  app: Awaited<ReturnType<typeof buildApp>>;
  store: MemoryStore;
  mailer: FakeMailer;
  media: FakeMediaService;
  clock: { now: Date };
  config: ReturnType<typeof loadConfig>;
}

let context: TestContext;

async function makeContext(): Promise<TestContext> {
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
  });
  const service = new VatrushkaService({ config, store, mailer, media, clock: () => clock.now });
  const app = await buildApp({ config, service, logger: false });
  return { app, store, mailer, media, clock, config };
}

async function login(email = 'anna@example.com', displayName = 'Anna'): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
  await context.app.inject({ method: 'POST', url: `${API_PREFIX}/auth/request-code`, payload: { email } });
  const verified = await context.app.inject({
    method: 'POST',
    url: `${API_PREFIX}/auth/verify-code`,
    payload: { email, code: '123456', deviceName: 'Test Desktop' },
  });
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

async function createRoom(accessToken: string): Promise<{
  roomId: string;
  code: string;
  participantIdentity: string;
  livekitRoomName: string;
}> {
  const response = await context.app.inject({
    method: 'POST',
    url: `${API_PREFIX}/rooms`,
    headers: { authorization: `Bearer ${accessToken}` },
  });
  expect(response.statusCode).toBe(201);
  const connection = response.json<{ roomId: string; code: string; participantIdentity: string }>();
  const room = await context.store.findRoomById(connection.roomId);
  if (!room) throw new Error('Room not created');
  return { ...connection, livekitRoomName: room.livekitRoomName };
}

beforeEach(async () => {
  context = await makeContext();
});

describe('authentication API', () => {
  it('requests an OTP without disclosing account existence', async () => {
    const response = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/auth/request-code`, payload: { email: ' USER@example.com ' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'CODE_SENT', retryAfterSeconds: 60 });
    expect(context.mailer.messages).toEqual([{ email: 'user@example.com', code: '123456' }]);
    expect([...context.store.authCodes.values()][0]?.codeHash).not.toContain('123456');
  });

  it('verifies a valid OTP and creates a user', async () => {
    await context.app.inject({ method: 'POST', url: `${API_PREFIX}/auth/request-code`, payload: { email: 'anna@example.com' } });
    const response = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/auth/verify-code`,
      payload: { email: 'anna@example.com', code: '123456', deviceName: 'Windows Desktop' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ isNewUser: boolean; user: { displayName: null } }>().isNewUser).toBe(true);
    expect([...context.store.sessions.values()][0]?.tokenHash).not.toBe(response.json<{ refreshToken: string }>().refreshToken);
  });

  it('rejects an invalid, expired, and exhausted OTP', async () => {
    await context.app.inject({ method: 'POST', url: `${API_PREFIX}/auth/request-code`, payload: { email: 'anna@example.com' } });
    const invalid = await context.app.inject({
      method: 'POST', url: `${API_PREFIX}/auth/verify-code`, payload: { email: 'anna@example.com', code: '999999', deviceName: 'Desktop' },
    });
    expect(invalid.statusCode).toBe(401);
    expect(invalid.json<{ code: string }>().code).toBe('INVALID_OTP');

    const code = [...context.store.authCodes.values()][0];
    if (!code) throw new Error('Missing code');
    code.expiresAt = new Date(context.clock.now.getTime() - 1);
    const expired = await context.app.inject({
      method: 'POST', url: `${API_PREFIX}/auth/verify-code`, payload: { email: 'anna@example.com', code: '123456', deviceName: 'Desktop' },
    });
    expect(expired.statusCode).toBe(401);
    expect(expired.json<{ code: string }>().code).toBe('OTP_EXPIRED');

    code.expiresAt = new Date(context.clock.now.getTime() + 60_000);
    code.attempts = 4;
    const exhausted = await context.app.inject({
      method: 'POST', url: `${API_PREFIX}/auth/verify-code`, payload: { email: 'anna@example.com', code: '999999', deviceName: 'Desktop' },
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
});

describe('rooms API', () => {
  it('creates a room and allows a registered user and a guest to join', async () => {
    const owner = await login('owner@example.com', 'Owner');
    const room = await createRoom(owner.accessToken);
    const second = await login('second@example.com', 'Second');
    const joined = await context.app.inject({
      method: 'POST', url: `${API_PREFIX}/rooms/${room.roomId}/join`, headers: { authorization: `Bearer ${second.accessToken}` },
    });
    expect(joined.statusCode).toBe(200);
    const guest = await context.app.inject({
      method: 'POST', url: `${API_PREFIX}/rooms/guest/join`, payload: { code: room.code.toLowerCase(), displayName: 'Guest User' },
    });
    expect(guest.statusCode).toBe(200);
    expect(guest.json<{ guestSessionToken: string }>().guestSessionToken).toBeTruthy();
  });

  it('enforces locked, closed, and full room states', async () => {
    const owner = await login('owner@example.com', 'Owner');
    const room = await createRoom(owner.accessToken);
    const locked = await context.app.inject({
      method: 'PATCH', url: `${API_PREFIX}/rooms/${room.roomId}/lock`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { isLocked: true },
    });
    expect(locked.statusCode).toBe(200);
    const guestLocked = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/rooms/guest/join`, payload: { code: room.code, displayName: 'Guest' } });
    expect(guestLocked.json<{ code: string }>().code).toBe('ROOM_LOCKED');

    await context.app.inject({
      method: 'PATCH', url: `${API_PREFIX}/rooms/${room.roomId}/lock`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { isLocked: false },
    });
    for (let index = 0; index < 5; index += 1) context.media.connect(room.livekitRoomName, `participant_${index}`);
    const full = await context.app.inject({ method: 'POST', url: `${API_PREFIX}/rooms/guest/join`, payload: { code: room.code, displayName: 'Guest' } });
    expect(full.json<{ code: string }>().code).toBe('ROOM_FULL');

    await context.app.inject({ method: 'POST', url: `${API_PREFIX}/rooms/${room.roomId}/close`, headers: { authorization: `Bearer ${owner.accessToken}` } });
    const closed = await context.app.inject({ method: 'GET', url: `${API_PREFIX}/rooms/by-code/${room.code}` });
    expect(closed.statusCode).toBe(410);
    expect(closed.json<{ code: string }>().code).toBe('ROOM_CLOSED');
  });

  it('allows only the owner to moderate a room', async () => {
    const owner = await login('owner@example.com', 'Owner');
    const room = await createRoom(owner.accessToken);
    const member = await login('member@example.com', 'Member');
    const forbidden = await context.app.inject({
      method: 'PATCH', url: `${API_PREFIX}/rooms/${room.roomId}/lock`, headers: { authorization: `Bearer ${member.accessToken}` }, payload: { isLocked: true },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json<{ code: string }>().code).toBe('NOT_ROOM_OWNER');

    context.media.connect(room.livekitRoomName, 'user_someone_suffix');
    const kicked = await context.app.inject({
      method: 'DELETE',
      url: `${API_PREFIX}/rooms/${room.roomId}/participants/user_someone_suffix`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(kicked.statusCode).toBe(204);
  });
});

describe('screen-share lease and webhooks', () => {
  it('blocks a concurrent claim and permits a claim after expiry', async () => {
    const owner = await login('owner@example.com', 'Owner');
    const room = await createRoom(owner.accessToken);
    context.media.connect(room.livekitRoomName, room.participantIdentity);
    const first = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/rooms/${room.roomId}/screen-share/claim`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { participantIdentity: room.participantIdentity },
    });
    expect(first.statusCode).toBe(200);

    const member = await login('member@example.com', 'Member');
    const joined = await context.app.inject({
      method: 'POST', url: `${API_PREFIX}/rooms/${room.roomId}/join`, headers: { authorization: `Bearer ${member.accessToken}` },
    });
    const memberIdentity = joined.json<{ participantIdentity: string }>().participantIdentity;
    context.media.connect(room.livekitRoomName, memberIdentity);
    const busy = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/rooms/${room.roomId}/screen-share/claim`,
      headers: { authorization: `Bearer ${member.accessToken}` },
      payload: { participantIdentity: memberIdentity },
    });
    expect(busy.statusCode).toBe(409);
    expect(busy.json<{ code: string }>().code).toBe('SCREEN_SHARE_BUSY');

    context.clock.now = new Date(context.clock.now.getTime() + 31_000);
    const afterExpiry = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/rooms/${room.roomId}/screen-share/claim`,
      headers: { authorization: `Bearer ${member.accessToken}` },
      payload: { participantIdentity: memberIdentity },
    });
    expect(afterExpiry.statusCode).toBe(200);
  });

  it('rejects an unsigned webhook and releases a lease on a signed participant_left event', async () => {
    const rejected = await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/webhooks/livekit`,
      headers: { authorization: 'invalid', 'content-type': 'application/json' },
      payload: JSON.stringify({ event: 'participant_left' }),
    });
    expect(rejected.statusCode).toBe(401);

    const owner = await login('owner@example.com', 'Owner');
    const room = await createRoom(owner.accessToken);
    context.media.connect(room.livekitRoomName, room.participantIdentity);
    await context.app.inject({
      method: 'POST',
      url: `${API_PREFIX}/rooms/${room.roomId}/screen-share/claim`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { participantIdentity: room.participantIdentity },
    });
    expect(context.store.leases.has(room.roomId)).toBe(true);

    const body = JSON.stringify({ event: 'participant_left', participant: { identity: room.participantIdentity } });
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
    expect(context.store.leases.has(room.roomId)).toBe(false);
  });
});
