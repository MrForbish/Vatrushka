import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

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
import * as schema from './schema.js';

type Database = NodePgDatabase<typeof schema>;
type RoomRow = typeof schema.rooms.$inferSelect;

function mapRoom(row: RoomRow): RoomRecord {
  return {
    ...row,
    status: row.status as RoomRecord['status'],
  };
}

export class PostgresStore implements DataStore {
  constructor(private readonly db: Database) {}

  async healthCheck(): Promise<void> {
    await this.db.execute('select 1');
  }

  async replaceAuthCode(code: AuthCodeRecord): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.authCodes)
        .set({ consumedAt: code.createdAt })
        .where(and(eq(schema.authCodes.email, code.email), isNull(schema.authCodes.consumedAt)));
      await tx.insert(schema.authCodes).values(code);
    });
  }

  async findLatestAuthCode(email: string): Promise<AuthCodeRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.authCodes)
      .where(eq(schema.authCodes.email, email))
      .orderBy(desc(schema.authCodes.createdAt))
      .limit(1);
    return (row as AuthCodeRecord | undefined) ?? null;
  }

  async incrementAuthCodeAttempts(id: string): Promise<number> {
    const [row] = await this.db
      .update(schema.authCodes)
      .set({ attempts: sql`${schema.authCodes.attempts} + 1` })
      .where(eq(schema.authCodes.id, id))
      .returning({ attempts: schema.authCodes.attempts });
    return row?.attempts ?? 0;
  }

  async consumeAuthCode(id: string, at: Date): Promise<boolean> {
    const rows = await this.db
      .update(schema.authCodes)
      .set({ consumedAt: at })
      .where(and(eq(schema.authCodes.id, id), isNull(schema.authCodes.consumedAt)))
      .returning({ id: schema.authCodes.id });
    return rows.length === 1;
  }

  async getOrCreateUser(email: string, now: Date): Promise<{ user: UserRecord; isNewUser: boolean }> {
    const id = crypto.randomUUID();
    const inserted = await this.db
      .insert(schema.users)
      .values({ id, email, displayName: null, createdAt: now, updatedAt: now })
      .onConflictDoNothing({ target: schema.users.email })
      .returning();
    if (inserted[0]) return { user: inserted[0], isNewUser: true };
    const [user] = await this.db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    if (!user) throw new Error('User conflict without existing row');
    return { user, isNewUser: false };
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const [row] = await this.db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    return row ?? null;
  }

  async updateDisplayName(id: string, displayName: string, now: Date): Promise<UserRecord | null> {
    const [row] = await this.db
      .update(schema.users)
      .set({ displayName, updatedAt: now })
      .where(eq(schema.users.id, id))
      .returning();
    return row ?? null;
  }

  async createSession(session: SessionRecord): Promise<void> {
    await this.db.insert(schema.sessions).values(session);
  }

  async rotateSession(tokenHash: string, replacement: SessionRecord, now: Date): Promise<RefreshRotation> {
    return this.db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.tokenHash, tokenHash))
        .limit(1)
        .for('update');
      if (!session) return { status: 'not_found' };
      if (session.revokedAt || session.replacedBySessionId) {
        await tx
          .update(schema.sessions)
          .set({ revokedAt: now })
          .where(and(eq(schema.sessions.tokenFamilyId, session.tokenFamilyId), isNull(schema.sessions.revokedAt)));
        return { status: 'reused', session };
      }
      if (isExpired(session.expiresAt, now)) {
        await tx.update(schema.sessions).set({ revokedAt: now }).where(eq(schema.sessions.id, session.id));
        return { status: 'expired', session };
      }
      const next: SessionRecord = { ...replacement, userId: session.userId, tokenFamilyId: session.tokenFamilyId, deviceName: session.deviceName };
      await tx.insert(schema.sessions).values(next);
      await tx
        .update(schema.sessions)
        .set({ revokedAt: now, replacedBySessionId: next.id, lastUsedAt: now })
        .where(eq(schema.sessions.id, session.id));
      return { status: 'ok', oldSession: session, newSession: next };
    });
  }

  async revokeSessionByHash(tokenHash: string, now: Date): Promise<void> {
    await this.db
      .update(schema.sessions)
      .set({ revokedAt: now })
      .where(and(eq(schema.sessions.tokenHash, tokenHash), isNull(schema.sessions.revokedAt)));
  }

  async revokeSessionFamily(familyId: string, now: Date): Promise<void> {
    await this.db
      .update(schema.sessions)
      .set({ revokedAt: now })
      .where(and(eq(schema.sessions.tokenFamilyId, familyId), isNull(schema.sessions.revokedAt)));
  }

  async createRoom(room: RoomRecord): Promise<boolean> {
    const rows = await this.db
      .insert(schema.rooms)
      .values(room)
      .onConflictDoNothing()
      .returning({ id: schema.rooms.id });
    return rows.length === 1;
  }

  async findRoomById(id: string): Promise<RoomRecord | null> {
    const [row] = await this.db.select().from(schema.rooms).where(eq(schema.rooms.id, id)).limit(1);
    return row ? mapRoom(row) : null;
  }

  async findRoomByCode(code: string): Promise<RoomRecord | null> {
    const [row] = await this.db.select().from(schema.rooms).where(eq(schema.rooms.code, code)).limit(1);
    return row ? mapRoom(row) : null;
  }

  async setRoomLocked(id: string, isLocked: boolean, now: Date): Promise<RoomRecord | null> {
    const [row] = await this.db
      .update(schema.rooms)
      .set({ isLocked, updatedAt: now })
      .where(eq(schema.rooms.id, id))
      .returning();
    return row ? mapRoom(row) : null;
  }

  async closeRoom(id: string, now: Date): Promise<RoomRecord | null> {
    const [row] = await this.db
      .update(schema.rooms)
      .set({ status: 'closed', closedAt: now, updatedAt: now })
      .where(eq(schema.rooms.id, id))
      .returning();
    return row ? mapRoom(row) : null;
  }

  async expireRoom(id: string, now: Date): Promise<RoomRecord | null> {
    const [row] = await this.db
      .update(schema.rooms)
      .set({ status: 'expired', updatedAt: now })
      .where(eq(schema.rooms.id, id))
      .returning();
    return row ? mapRoom(row) : null;
  }

  async createGuestSession(session: GuestSessionRecord): Promise<void> {
    await this.db.insert(schema.guestSessions).values(session);
  }

  async findGuestSessionByTokenHash(tokenHash: string): Promise<GuestSessionRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.guestSessions)
      .where(eq(schema.guestSessions.tokenHash, tokenHash))
      .limit(1);
    return row ?? null;
  }

  async revokeGuestSessionsForRoom(roomId: string, now: Date): Promise<void> {
    await this.db
      .update(schema.guestSessions)
      .set({ revokedAt: now })
      .where(and(eq(schema.guestSessions.roomId, roomId), isNull(schema.guestSessions.revokedAt)));
  }

  async revokeGuestSessionById(id: string, now: Date): Promise<void> {
    await this.db
      .update(schema.guestSessions)
      .set({ revokedAt: now })
      .where(and(eq(schema.guestSessions.id, id), isNull(schema.guestSessions.revokedAt)));
  }

  async claimLease(
    roomId: string,
    participantIdentity: string,
    participantDisplayName: string,
    now: Date,
    leaseSeconds: number,
  ): Promise<LeaseClaim> {
    return this.db.transaction(async (tx) => {
      await tx.select({ id: schema.rooms.id }).from(schema.rooms).where(eq(schema.rooms.id, roomId)).for('update');
      const [current] = await tx
        .select()
        .from(schema.screenShareLeases)
        .where(eq(schema.screenShareLeases.roomId, roomId))
        .limit(1)
        .for('update');
      const decision = decideScreenShareLease(current ?? null, participantIdentity, participantDisplayName, now, leaseSeconds);
      if (!decision.ok) return { status: 'busy', lease: { roomId, ...decision.current } };
      const lease: LeaseRecord = { roomId, ...decision.lease };
      await tx
        .insert(schema.screenShareLeases)
        .values(lease)
        .onConflictDoUpdate({
          target: schema.screenShareLeases.roomId,
          set: {
            participantIdentity: lease.participantIdentity,
            participantDisplayName: lease.participantDisplayName,
            acquiredAt: lease.acquiredAt,
            expiresAt: lease.expiresAt,
          },
        });
      return { status: 'ok', lease };
    });
  }

  async heartbeatLease(roomId: string, participantIdentity: string, now: Date, leaseSeconds: number): Promise<LeaseRecord | null> {
    const [row] = await this.db
      .update(schema.screenShareLeases)
      .set({ expiresAt: expiresAt(now, leaseSeconds) })
      .where(
        and(
          eq(schema.screenShareLeases.roomId, roomId),
          eq(schema.screenShareLeases.participantIdentity, participantIdentity),
        ),
      )
      .returning();
    return row ?? null;
  }

  async releaseLease(roomId: string, participantIdentity: string): Promise<boolean> {
    const rows = await this.db
      .delete(schema.screenShareLeases)
      .where(
        and(
          eq(schema.screenShareLeases.roomId, roomId),
          eq(schema.screenShareLeases.participantIdentity, participantIdentity),
        ),
      )
      .returning({ roomId: schema.screenShareLeases.roomId });
    return rows.length === 1;
  }

  async releaseLeaseByParticipant(participantIdentity: string): Promise<void> {
    await this.db
      .delete(schema.screenShareLeases)
      .where(eq(schema.screenShareLeases.participantIdentity, participantIdentity));
  }

  async releaseLeaseByRoom(roomId: string): Promise<void> {
    await this.db.delete(schema.screenShareLeases).where(eq(schema.screenShareLeases.roomId, roomId));
  }
}

export function createPostgresStore(databaseUrl: string): { store: PostgresStore; close: () => Promise<void> } {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10, idleTimeoutMillis: 30_000 });
  return { store: new PostgresStore(drizzle(pool, { schema })), close: () => pool.end() };
}
