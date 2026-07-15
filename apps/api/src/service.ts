import { randomUUID } from 'node:crypto';

import { errors as joseErrors } from 'jose';
import { TrackSource } from 'livekit-server-sdk';

import {
  type AuthResponse,
  type PublicRoom,
  type PublicUser,
  type RoomConnection,
  expiresAt,
  generateRoomCode,
  isExpired,
} from '@vatrushka/shared';

import { AppError } from './app-error.js';
import type { AppConfig } from './config.js';
import type { GuestSessionRecord, RoomRecord, SessionRecord, UserRecord } from './domain.js';
import type { DataStore, Mailer, MediaService } from './ports.js';
import {
  hashOpaqueToken,
  hashOtp,
  issueAccessToken,
  randomOpaqueToken,
  randomOtp,
  safeHashEqual,
  verifyAccessToken,
} from './security.js';

export interface ServiceDependencies {
  config: AppConfig;
  store: DataStore;
  mailer: Mailer;
  media: MediaService;
  clock?: () => Date;
}

export type RoomPrincipal =
  | { kind: 'user'; user: UserRecord }
  | { kind: 'guest'; guest: GuestSessionRecord };

function publicUser(user: UserRecord): PublicUser {
  return { id: user.id, email: user.email, displayName: user.displayName };
}

export class VatrushkaService {
  readonly config: AppConfig;
  readonly store: DataStore;
  readonly media: MediaService;
  private readonly mailer: Mailer;
  private readonly clock: () => Date;

  constructor(dependencies: ServiceDependencies) {
    this.config = dependencies.config;
    this.store = dependencies.store;
    this.mailer = dependencies.mailer;
    this.media = dependencies.media;
    this.clock = dependencies.clock ?? (() => new Date());
  }

  now(): Date {
    return this.clock();
  }

  async requestCode(email: string): Promise<{ status: 'CODE_SENT'; retryAfterSeconds: number }> {
    const now = this.now();
    const latest = await this.store.findLatestAuthCode(email);
    if (latest) {
      const retryAt = latest.createdAt.getTime() + this.config.OTP_RESEND_SECONDS * 1000;
      if (retryAt > now.getTime()) {
        throw new AppError('RATE_LIMITED', 429, undefined, {
          retryAfterSeconds: Math.ceil((retryAt - now.getTime()) / 1000),
        });
      }
    }

    const code = this.config.DEV_FIXED_OTP && this.config.NODE_ENV !== 'production' ? this.config.DEV_FIXED_OTP : randomOtp();
    await this.store.replaceAuthCode({
      id: randomUUID(),
      email,
      codeHash: hashOtp(email, code, this.config.OTP_PEPPER),
      purpose: 'login',
      attempts: 0,
      expiresAt: expiresAt(now, this.config.OTP_TTL_SECONDS),
      consumedAt: null,
      createdAt: now,
    });
    try {
      await this.mailer.sendOtp(email, code, Math.ceil(this.config.OTP_TTL_SECONDS / 60));
    } catch {
      throw new AppError('EMAIL_DELIVERY_FAILED', 502);
    }
    return { status: 'CODE_SENT', retryAfterSeconds: this.config.OTP_RESEND_SECONDS };
  }

  async verifyCode(email: string, code: string, deviceName: string): Promise<AuthResponse> {
    const now = this.now();
    const authCode = await this.store.findLatestAuthCode(email);
    if (!authCode || authCode.consumedAt) throw new AppError('INVALID_OTP', 401);
    if (isExpired(authCode.expiresAt, now)) throw new AppError('OTP_EXPIRED', 401);
    if (authCode.attempts >= 5) throw new AppError('OTP_ATTEMPTS_EXCEEDED', 429);

    const actualHash = hashOtp(email, code, this.config.OTP_PEPPER);
    if (!safeHashEqual(authCode.codeHash, actualHash)) {
      const attempts = await this.store.incrementAuthCodeAttempts(authCode.id);
      if (attempts >= 5) throw new AppError('OTP_ATTEMPTS_EXCEEDED', 429);
      throw new AppError('INVALID_OTP', 401);
    }
    if (!(await this.store.consumeAuthCode(authCode.id, now))) throw new AppError('INVALID_OTP', 401);

    const { user, isNewUser } = await this.store.getOrCreateUser(email, now);
    const tokens = await this.createSessionTokens(user, deviceName, now);
    return { ...tokens, user: publicUser(user), isNewUser };
  }

  async refresh(refreshToken: string): Promise<Omit<AuthResponse, 'isNewUser'>> {
    const now = this.now();
    const replacementToken = randomOpaqueToken();
    const replacement: SessionRecord = {
      id: randomUUID(),
      userId: randomUUID(),
      tokenHash: hashOpaqueToken(replacementToken),
      tokenFamilyId: randomUUID(),
      deviceName: 'rotated',
      expiresAt: expiresAt(now, this.config.REFRESH_TOKEN_TTL_DAYS * 86_400),
      revokedAt: null,
      replacedBySessionId: null,
      createdAt: now,
      lastUsedAt: now,
    };
    const rotation = await this.store.rotateSession(hashOpaqueToken(refreshToken), replacement, now);
    if (rotation.status === 'reused') throw new AppError('SESSION_REVOKED', 401);
    if (rotation.status === 'expired') throw new AppError('SESSION_EXPIRED', 401);
    if (rotation.status === 'not_found') throw new AppError('UNAUTHORIZED', 401);
    const user = await this.store.findUserById(rotation.newSession.userId);
    if (!user) throw new AppError('UNAUTHORIZED', 401);
    return {
      accessToken: await issueAccessToken({ userId: user.id, sessionId: rotation.newSession.id }, this.config),
      refreshToken: replacementToken,
      expiresIn: this.config.ACCESS_TOKEN_TTL_SECONDS,
      user: publicUser(user),
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.store.revokeSessionByHash(hashOpaqueToken(refreshToken), this.now());
  }

  async authenticate(authorization: string | undefined): Promise<UserRecord> {
    if (!authorization?.startsWith('Bearer ')) throw new AppError('UNAUTHORIZED', 401);
    try {
      const claims = await verifyAccessToken(authorization.slice('Bearer '.length), this.config);
      const user = await this.store.findUserById(claims.userId);
      if (!user) throw new AppError('UNAUTHORIZED', 401);
      return user;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof joseErrors.JWTExpired) throw new AppError('SESSION_EXPIRED', 401);
      throw new AppError('UNAUTHORIZED', 401);
    }
  }

  async authenticateRoomPrincipal(authorization: string | undefined): Promise<RoomPrincipal> {
    if (authorization?.startsWith('Guest ')) {
      const guest = await this.store.findGuestSessionByTokenHash(hashOpaqueToken(authorization.slice('Guest '.length)));
      if (!guest || guest.revokedAt || isExpired(guest.expiresAt, this.now())) throw new AppError('SESSION_EXPIRED', 401);
      return { kind: 'guest', guest };
    }
    return { kind: 'user', user: await this.authenticate(authorization) };
  }

  async getMe(authorization: string | undefined): Promise<PublicUser> {
    return publicUser(await this.authenticate(authorization));
  }

  async updateMe(authorization: string | undefined, displayName: string): Promise<PublicUser> {
    const user = await this.authenticate(authorization);
    const updated = await this.store.updateDisplayName(user.id, displayName, this.now());
    if (!updated) throw new AppError('UNAUTHORIZED', 401);
    return publicUser(updated);
  }

  async createRoom(authorization: string | undefined): Promise<RoomConnection> {
    const owner = await this.authenticate(authorization);
    this.requireCompleteProfile(owner);
    const now = this.now();
    let room: RoomRecord | null = null;
    for (let attempt = 0; attempt < 10 && !room; attempt += 1) {
      const candidate: RoomRecord = {
        id: randomUUID(),
        code: generateRoomCode(),
        ownerUserId: owner.id,
        livekitRoomName: `room_${randomUUID()}`,
        status: 'active',
        isLocked: false,
        maxParticipants: this.config.ROOM_MAX_PARTICIPANTS,
        expiresAt: expiresAt(now, this.config.ROOM_TTL_HOURS * 3600),
        closedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      if (await this.store.createRoom(candidate)) room = candidate;
    }
    if (!room) throw new AppError('INTERNAL_ERROR', 500);
    try {
      await this.media.createRoom({
        id: room.id,
        ownerUserId: room.ownerUserId,
        name: room.livekitRoomName,
        maxParticipants: room.maxParticipants,
      });
      return this.connectionForUser(room, owner, true);
    } catch {
      await this.store.closeRoom(room.id, now);
      throw new AppError('LIVEKIT_UNAVAILABLE', 503);
    }
  }

  async publicRoom(code: string): Promise<PublicRoom> {
    const room = await this.requireRoomByCode(code, false);
    const owner = await this.store.findUserById(room.ownerUserId);
    let count: number;
    try {
      count = await this.media.participantCount(room.livekitRoomName);
    } catch {
      throw new AppError('LIVEKIT_UNAVAILABLE', 503);
    }
    return {
      code: room.code,
      status: room.status,
      isLocked: room.isLocked,
      currentParticipantCount: count,
      maxParticipants: room.maxParticipants,
      ownerDisplayName: owner?.displayName ?? 'Владелец',
    };
  }

  async joinRoom(authorization: string | undefined, roomId: string): Promise<RoomConnection> {
    const user = await this.authenticate(authorization);
    this.requireCompleteProfile(user);
    const room = await this.requireRoomById(roomId, true);
    await this.ensureCapacity(room);
    return this.connectionForUser(room, user, room.ownerUserId === user.id);
  }

  async joinRoomByCode(authorization: string | undefined, code: string): Promise<RoomConnection> {
    const user = await this.authenticate(authorization);
    this.requireCompleteProfile(user);
    const room = await this.requireRoomByCode(code, true);
    await this.ensureCapacity(room);
    return this.connectionForUser(room, user, room.ownerUserId === user.id);
  }

  async joinGuest(code: string, displayName: string): Promise<RoomConnection> {
    const room = await this.requireRoomByCode(code, true);
    await this.ensureCapacity(room);
    const now = this.now();
    const guestToken = randomOpaqueToken();
    const guest: GuestSessionRecord = {
      id: randomUUID(),
      roomId: room.id,
      displayName,
      tokenHash: hashOpaqueToken(guestToken),
      expiresAt: room.expiresAt,
      revokedAt: null,
      createdAt: now,
    };
    await this.store.createGuestSession(guest);
    const identity = `guest_${guest.id}_${randomOpaqueToken(6)}`;
    return {
      roomId: room.id,
      ownerUserId: room.ownerUserId,
      code: room.code,
      livekitUrl: this.config.LIVEKIT_URL,
      livekitToken: await this.issueMediaToken(room, identity, displayName, 'guest'),
      participantIdentity: identity,
      participantDisplayName: displayName,
      isOwner: false,
      guestSessionToken: guestToken,
    };
  }

  async reissueRoomToken(
    authorization: string | undefined,
    roomId: string,
    participantIdentity: string,
  ): Promise<{ livekitUrl: string; livekitToken: string }> {
    const principal = await this.authenticateRoomPrincipal(authorization);
    const room = await this.requireRoomById(roomId, true);
    this.assertPrincipalIdentity(principal, room, participantIdentity);
    const displayName = principal.kind === 'user' ? principal.user.displayName : principal.guest.displayName;
    if (!displayName) throw new AppError('PROFILE_INCOMPLETE', 409);
    return {
      livekitUrl: this.config.LIVEKIT_URL,
      livekitToken: await this.issueMediaToken(room, participantIdentity, displayName, principal.kind),
    };
  }

  async setRoomLock(authorization: string | undefined, roomId: string, isLocked: boolean): Promise<{ isLocked: boolean }> {
    const user = await this.authenticate(authorization);
    const room = await this.requireRoomById(roomId, false);
    this.requireOwner(room, user);
    const updated = await this.store.setRoomLocked(room.id, isLocked, this.now());
    if (!updated) throw new AppError('ROOM_NOT_FOUND', 404);
    return { isLocked: updated.isLocked };
  }

  async closeRoom(authorization: string | undefined, roomId: string): Promise<void> {
    const user = await this.authenticate(authorization);
    const room = await this.requireRoomById(roomId, false);
    this.requireOwner(room, user);
    const now = this.now();
    await this.store.closeRoom(room.id, now);
    await this.store.revokeGuestSessionsForRoom(room.id, now);
    await this.store.releaseLeaseByRoom(room.id);
    try {
      await this.media.deleteRoom(room.livekitRoomName);
    } catch {
      throw new AppError('LIVEKIT_UNAVAILABLE', 503);
    }
  }

  async kickParticipant(authorization: string | undefined, roomId: string, participantIdentity: string): Promise<void> {
    const user = await this.authenticate(authorization);
    const room = await this.requireRoomById(roomId, false);
    this.requireOwner(room, user);
    if (participantIdentity.startsWith(`user_${user.id}_`)) throw new AppError('NOT_ROOM_OWNER', 403, 'Владелец не может исключить себя');
    try {
      if (!(await this.media.participantExists(room.livekitRoomName, participantIdentity))) {
        throw new AppError('PARTICIPANT_NOT_FOUND', 404);
      }
      await this.media.removeParticipant(room.livekitRoomName, participantIdentity);
      await this.store.releaseLeaseByParticipant(participantIdentity);
      if (participantIdentity.startsWith('guest_')) {
        const guestId = participantIdentity.split('_')[1];
        if (guestId) await this.store.revokeGuestSessionById(guestId, this.now());
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('LIVEKIT_UNAVAILABLE', 503);
    }
  }

  async claimScreenShare(
    authorization: string | undefined,
    roomId: string,
    participantIdentity: string,
  ): Promise<{ expiresAt: string }> {
    const { principal, room, displayName } = await this.validateMediaParticipant(authorization, roomId, participantIdentity);
    void principal;
    const result = await this.store.claimLease(
      room.id,
      participantIdentity,
      displayName,
      this.now(),
      this.config.SCREEN_SHARE_LEASE_SECONDS,
    );
    if (result.status === 'busy') {
      throw new AppError('SCREEN_SHARE_BUSY', 409, undefined, {
        participantDisplayName: result.lease.participantDisplayName,
      });
    }
    return { expiresAt: result.lease.expiresAt.toISOString() };
  }

  async heartbeatScreenShare(
    authorization: string | undefined,
    roomId: string,
    participantIdentity: string,
  ): Promise<{ expiresAt: string }> {
    await this.validateMediaParticipant(authorization, roomId, participantIdentity);
    const lease = await this.store.heartbeatLease(
      roomId,
      participantIdentity,
      this.now(),
      this.config.SCREEN_SHARE_LEASE_SECONDS,
    );
    if (!lease) throw new AppError('SCREEN_SHARE_BUSY', 409, 'Право на демонстрацию экрана утрачено');
    return { expiresAt: lease.expiresAt.toISOString() };
  }

  async releaseScreenShare(authorization: string | undefined, roomId: string, participantIdentity: string): Promise<void> {
    const principal = await this.authenticateRoomPrincipal(authorization);
    const room = await this.requireRoomById(roomId, false);
    this.assertPrincipalIdentity(principal, room, participantIdentity);
    await this.store.releaseLease(roomId, participantIdentity);
  }

  async handleWebhookEvent(event: { event?: string; participant?: { identity?: string }; room?: { metadata?: string }; track?: { source?: TrackSource } }): Promise<void> {
    const identity = event.participant?.identity;
    if ((event.event === 'participant_left' || (event.event === 'track_unpublished' && event.track?.source === TrackSource.SCREEN_SHARE)) && identity) {
      await this.store.releaseLeaseByParticipant(identity);
    }
    if (event.event === 'room_finished' && event.room?.metadata) {
      try {
        const metadata = JSON.parse(event.room.metadata) as { appRoomId?: string };
        if (metadata.appRoomId) await this.store.releaseLeaseByRoom(metadata.appRoomId);
      } catch {
        // LiveKit metadata is treated as untrusted input.
      }
    }
  }

  private async createSessionTokens(user: UserRecord, deviceName: string, now: Date): Promise<Omit<AuthResponse, 'user' | 'isNewUser'>> {
    const refreshToken = randomOpaqueToken();
    const session: SessionRecord = {
      id: randomUUID(),
      userId: user.id,
      tokenHash: hashOpaqueToken(refreshToken),
      tokenFamilyId: randomUUID(),
      deviceName,
      expiresAt: expiresAt(now, this.config.REFRESH_TOKEN_TTL_DAYS * 86_400),
      revokedAt: null,
      replacedBySessionId: null,
      createdAt: now,
      lastUsedAt: now,
    };
    await this.store.createSession(session);
    return {
      accessToken: await issueAccessToken({ userId: user.id, sessionId: session.id }, this.config),
      refreshToken,
      expiresIn: this.config.ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  private async connectionForUser(room: RoomRecord, user: UserRecord, isOwner: boolean): Promise<RoomConnection> {
    const displayName = user.displayName;
    if (!displayName) throw new AppError('PROFILE_INCOMPLETE', 409);
    const identity = `user_${user.id}_${randomOpaqueToken(6)}`;
    return {
      roomId: room.id,
      ownerUserId: room.ownerUserId,
      code: room.code,
      livekitUrl: this.config.LIVEKIT_URL,
      livekitToken: await this.issueMediaToken(room, identity, displayName, 'user'),
      participantIdentity: identity,
      participantDisplayName: displayName,
      isOwner,
    };
  }

  private async issueMediaToken(
    room: RoomRecord,
    identity: string,
    displayName: string,
    kind: 'user' | 'guest',
  ): Promise<string> {
    try {
      return await this.media.issueToken({
        roomName: room.livekitRoomName,
        identity,
        displayName,
        metadata: { appRoomId: room.id, kind },
      });
    } catch {
      throw new AppError('LIVEKIT_UNAVAILABLE', 503);
    }
  }

  private async ensureCapacity(room: RoomRecord): Promise<void> {
    try {
      if ((await this.media.participantCount(room.livekitRoomName)) >= room.maxParticipants) {
        throw new AppError('ROOM_FULL', 409);
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('LIVEKIT_UNAVAILABLE', 503);
    }
  }

  private async requireRoomById(id: string, joining: boolean): Promise<RoomRecord> {
    const room = await this.store.findRoomById(id);
    if (!room) throw new AppError('ROOM_NOT_FOUND', 404);
    await this.assertRoomState(room, joining);
    return room;
  }

  private async requireRoomByCode(code: string, joining: boolean): Promise<RoomRecord> {
    const room = await this.store.findRoomByCode(code);
    if (!room) throw new AppError('ROOM_NOT_FOUND', 404);
    await this.assertRoomState(room, joining);
    return room;
  }

  private async assertRoomState(room: RoomRecord, joining: boolean): Promise<void> {
    if (room.status === 'closed') throw new AppError('ROOM_CLOSED', 410);
    if (room.status === 'expired') throw new AppError('ROOM_EXPIRED', 410);
    if (isExpired(room.expiresAt, this.now())) {
      const now = this.now();
      await this.store.expireRoom(room.id, now);
      await this.store.revokeGuestSessionsForRoom(room.id, now);
      await this.store.releaseLeaseByRoom(room.id);
      try {
        await this.media.deleteRoom(room.livekitRoomName);
      } catch {
        // The room remains expired even if LiveKit cleanup is temporarily unavailable.
      }
      throw new AppError('ROOM_EXPIRED', 410);
    }
    if (joining && room.isLocked) throw new AppError('ROOM_LOCKED', 409);
  }

  private requireCompleteProfile(user: UserRecord): asserts user is UserRecord & { displayName: string } {
    if (!user.displayName) throw new AppError('PROFILE_INCOMPLETE', 409);
  }

  private requireOwner(room: RoomRecord, user: UserRecord): void {
    if (room.ownerUserId !== user.id) throw new AppError('NOT_ROOM_OWNER', 403);
  }

  private assertPrincipalIdentity(principal: RoomPrincipal, room: RoomRecord, participantIdentity: string): void {
    if (principal.kind === 'user') {
      if (!participantIdentity.startsWith(`user_${principal.user.id}_`)) throw new AppError('UNAUTHORIZED', 401);
    } else if (principal.guest.roomId !== room.id || !participantIdentity.startsWith(`guest_${principal.guest.id}_`)) {
      throw new AppError('UNAUTHORIZED', 401);
    }
  }

  private async validateMediaParticipant(
    authorization: string | undefined,
    roomId: string,
    participantIdentity: string,
  ): Promise<{ principal: RoomPrincipal; room: RoomRecord; displayName: string }> {
    const principal = await this.authenticateRoomPrincipal(authorization);
    const room = await this.requireRoomById(roomId, false);
    this.assertPrincipalIdentity(principal, room, participantIdentity);
    let exists: boolean;
    try {
      exists = await this.media.participantExists(room.livekitRoomName, participantIdentity);
    } catch {
      throw new AppError('LIVEKIT_UNAVAILABLE', 503);
    }
    if (!exists) throw new AppError('PARTICIPANT_NOT_FOUND', 404);
    const displayName = principal.kind === 'user' ? principal.user.displayName : principal.guest.displayName;
    if (!displayName) throw new AppError('PROFILE_INCOMPLETE', 409);
    return { principal, room, displayName };
  }
}
