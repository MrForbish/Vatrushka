import { decideScreenShareLease, expiresAt, isExpired } from '@vatrushka/shared';

import type {
  AuthCodeRecord,
  GuestSessionRecord,
  LeaseClaim,
  LeaseRecord,
  RefreshRotation,
  RoomRecord,
  SessionRecord,
  UserRecord,
} from '../domain.js';
import type { DataStore } from '../ports.js';

export class MemoryStore implements DataStore {
  readonly authCodes = new Map<string, AuthCodeRecord>();
  readonly users = new Map<string, UserRecord>();
  readonly sessions = new Map<string, SessionRecord>();
  readonly rooms = new Map<string, RoomRecord>();
  readonly guests = new Map<string, GuestSessionRecord>();
  readonly leases = new Map<string, LeaseRecord>();

  async healthCheck(): Promise<void> {}

  async replaceAuthCode(code: AuthCodeRecord): Promise<void> {
    for (const current of this.authCodes.values()) {
      if (current.email === code.email && !current.consumedAt) current.consumedAt = code.createdAt;
    }
    this.authCodes.set(code.id, structuredClone(code));
  }

  async findLatestAuthCode(email: string): Promise<AuthCodeRecord | null> {
    const rows = [...this.authCodes.values()].filter((code) => code.email === email);
    rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return rows[0] ? structuredClone(rows[0]) : null;
  }

  async incrementAuthCodeAttempts(id: string): Promise<number> {
    const row = this.authCodes.get(id);
    if (!row) return 0;
    row.attempts += 1;
    return row.attempts;
  }

  async consumeAuthCode(id: string, at: Date): Promise<boolean> {
    const row = this.authCodes.get(id);
    if (!row || row.consumedAt) return false;
    row.consumedAt = at;
    return true;
  }

  async getOrCreateUser(email: string, now: Date): Promise<{ user: UserRecord; isNewUser: boolean }> {
    const existing = [...this.users.values()].find((user) => user.email === email);
    if (existing) return { user: structuredClone(existing), isNewUser: false };
    const user: UserRecord = { id: crypto.randomUUID(), email, displayName: null, createdAt: now, updatedAt: now };
    this.users.set(user.id, user);
    return { user: structuredClone(user), isNewUser: true };
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const row = this.users.get(id);
    return row ? structuredClone(row) : null;
  }

  async updateDisplayName(id: string, displayName: string, now: Date): Promise<UserRecord | null> {
    const row = this.users.get(id);
    if (!row) return null;
    row.displayName = displayName;
    row.updatedAt = now;
    return structuredClone(row);
  }

  async createSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.tokenHash, structuredClone(session));
  }

  async rotateSession(tokenHash: string, replacement: SessionRecord, now: Date): Promise<RefreshRotation> {
    const session = this.sessions.get(tokenHash);
    if (!session) return { status: 'not_found' };
    if (session.revokedAt || session.replacedBySessionId) {
      await this.revokeSessionFamily(session.tokenFamilyId, now);
      return { status: 'reused', session: structuredClone(session) };
    }
    if (isExpired(session.expiresAt, now)) {
      session.revokedAt = now;
      return { status: 'expired', session: structuredClone(session) };
    }
    const next = {
      ...structuredClone(replacement),
      userId: session.userId,
      tokenFamilyId: session.tokenFamilyId,
      deviceName: session.deviceName,
    };
    session.revokedAt = now;
    session.replacedBySessionId = next.id;
    session.lastUsedAt = now;
    this.sessions.set(next.tokenHash, next);
    return { status: 'ok', oldSession: structuredClone(session), newSession: structuredClone(next) };
  }

  async revokeSessionByHash(tokenHash: string, now: Date): Promise<void> {
    const session = this.sessions.get(tokenHash);
    if (session && !session.revokedAt) session.revokedAt = now;
  }

  async revokeSessionFamily(familyId: string, now: Date): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.tokenFamilyId === familyId && !session.revokedAt) session.revokedAt = now;
    }
  }

  async createRoom(room: RoomRecord): Promise<boolean> {
    if ([...this.rooms.values()].some((current) => current.code === room.code || current.livekitRoomName === room.livekitRoomName)) return false;
    this.rooms.set(room.id, structuredClone(room));
    return true;
  }

  async findRoomById(id: string): Promise<RoomRecord | null> {
    const row = this.rooms.get(id);
    return row ? structuredClone(row) : null;
  }

  async findRoomByCode(code: string): Promise<RoomRecord | null> {
    const row = [...this.rooms.values()].find((room) => room.code === code);
    return row ? structuredClone(row) : null;
  }

  async setRoomLocked(id: string, isLocked: boolean, now: Date): Promise<RoomRecord | null> {
    const row = this.rooms.get(id);
    if (!row) return null;
    row.isLocked = isLocked;
    row.updatedAt = now;
    return structuredClone(row);
  }

  async closeRoom(id: string, now: Date): Promise<RoomRecord | null> {
    const row = this.rooms.get(id);
    if (!row) return null;
    row.status = 'closed';
    row.closedAt = now;
    row.updatedAt = now;
    return structuredClone(row);
  }

  async expireRoom(id: string, now: Date): Promise<RoomRecord | null> {
    const row = this.rooms.get(id);
    if (!row) return null;
    row.status = 'expired';
    row.updatedAt = now;
    return structuredClone(row);
  }

  async createGuestSession(session: GuestSessionRecord): Promise<void> {
    this.guests.set(session.tokenHash, structuredClone(session));
  }

  async findGuestSessionByTokenHash(tokenHash: string): Promise<GuestSessionRecord | null> {
    const row = this.guests.get(tokenHash);
    return row ? structuredClone(row) : null;
  }

  async revokeGuestSessionsForRoom(roomId: string, now: Date): Promise<void> {
    for (const guest of this.guests.values()) if (guest.roomId === roomId && !guest.revokedAt) guest.revokedAt = now;
  }

  async revokeGuestSessionById(id: string, now: Date): Promise<void> {
    for (const guest of this.guests.values()) if (guest.id === id && !guest.revokedAt) guest.revokedAt = now;
  }

  async claimLease(
    roomId: string,
    participantIdentity: string,
    participantDisplayName: string,
    now: Date,
    leaseSeconds: number,
  ): Promise<LeaseClaim> {
    const current = this.leases.get(roomId) ?? null;
    const decision = decideScreenShareLease(current, participantIdentity, participantDisplayName, now, leaseSeconds);
    if (!decision.ok) return { status: 'busy', lease: structuredClone(current as LeaseRecord) };
    const lease = { roomId, ...decision.lease };
    this.leases.set(roomId, lease);
    return { status: 'ok', lease: structuredClone(lease) };
  }

  async heartbeatLease(roomId: string, participantIdentity: string, now: Date, leaseSeconds: number): Promise<LeaseRecord | null> {
    const lease = this.leases.get(roomId);
    if (!lease || lease.participantIdentity !== participantIdentity || isExpired(lease.expiresAt, now)) return null;
    lease.expiresAt = expiresAt(now, leaseSeconds);
    return structuredClone(lease);
  }

  async releaseLease(roomId: string, participantIdentity: string): Promise<boolean> {
    const lease = this.leases.get(roomId);
    if (!lease || lease.participantIdentity !== participantIdentity) return false;
    return this.leases.delete(roomId);
  }

  async releaseLeaseByParticipant(participantIdentity: string): Promise<void> {
    for (const [roomId, lease] of this.leases) if (lease.participantIdentity === participantIdentity) this.leases.delete(roomId);
  }

  async releaseLeaseByRoom(roomId: string): Promise<void> {
    this.leases.delete(roomId);
  }
}
