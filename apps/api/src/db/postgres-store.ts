import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { decideScreenShareLease, expiresAt, isExpired } from '@vatrushka/shared';
import type { PermissionOverwriteTargetType, PlatformRole } from '@vatrushka/shared';

import type {
  AuthCodeRecord,
  GuestSessionRecord,
  LeaseClaim,
  LeaseRecord,
  RefreshRotation,
  RoomRecord,
  SessionRecord,
  UserRecord,
  ServerGraph,
  ServerRecord,
  ServerWithMemberCount,
  ServerMemberRecord,
  ServerMemberProfile,
  ServerRoleRecord,
  ServerChannelRecord,
  ChannelPermissionOverwriteRecord,
  ServerAuditLogRecord,
  TextMessageRecord,
  TextMessageWithAuthor,
  MessageReactionRecord,
  MessageReactionSummary,
  ChannelReadStateRecord,
  ChannelUnreadCount,
  MessageAttachmentRecord,
  MessageAttachmentMetadata,
  MessageNotificationRecord,
  DirectConversationRecord,
  DirectConversationOverviewRecord,
  DirectMessageRecord,
  DirectMessageWithAuthor,
  DirectMessageAttachmentRecord,
  DirectMessageAttachmentMetadata,
  ChannelLeaseRecord,
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

  async findLatestAuthCodeForPurpose(email: string, purpose: AuthCodeRecord['purpose']): Promise<AuthCodeRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.authCodes)
      .where(and(eq(schema.authCodes.email, email), eq(schema.authCodes.purpose, purpose)))
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

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const [row] = await this.db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    return row ?? null;
  }

  async createUserWithPassword(email: string, passwordHash: string, now: Date): Promise<UserRecord | null> {
    const [row] = await this.db
      .insert(schema.users)
      .values({
        id: crypto.randomUUID(),
        email,
        displayName: null,
        passwordHash,
        emailVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: schema.users.email })
      .returning();
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

  async updatePassword(id: string, passwordHash: string, now: Date): Promise<UserRecord | null> {
    const [row] = await this.db
      .update(schema.users)
      .set({ passwordHash, emailVerifiedAt: now, updatedAt: now })
      .where(eq(schema.users.id, id))
      .returning();
    return row ?? null;
  }

  async updateTwoFactor(id: string, secretEncrypted: string | null, enabled: boolean, now: Date): Promise<UserRecord | null> {
    const [row] = await this.db
      .update(schema.users)
      .set({ totpSecretEncrypted: secretEncrypted, twoFactorEnabled: enabled, updatedAt: now })
      .where(eq(schema.users.id, id))
      .returning();
    return row ?? null;
  }

  async setPlatformRoleByEmail(email: string, role: PlatformRole, now: Date): Promise<UserRecord | null> {
    const [row] = await this.db
      .update(schema.users)
      .set({ platformRole: role, updatedAt: now })
      .where(eq(schema.users.email, email))
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

  async createServerGraph(graph: ServerGraph): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const inserted = await tx.insert(schema.servers).values(graph.server).onConflictDoNothing().returning({ id: schema.servers.id });
      if (inserted.length === 0) return false;
      await tx.insert(schema.serverMembers).values(graph.members);
      await tx.insert(schema.serverRoles).values(graph.roles);
      if (graph.memberRoles.length > 0) await tx.insert(schema.serverMemberRoles).values(graph.memberRoles);
      await tx.insert(schema.serverChannels).values(graph.channels);
      return true;
    });
  }

  async listServersForUser(userId: string): Promise<ServerWithMemberCount[]> {
    const rows = await this.db
      .select({
        server: schema.servers,
        memberCount: sql<number>`(select count(*)::int from ${schema.serverMembers} counted where counted.server_id = ${schema.servers.id})`,
      })
      .from(schema.servers)
      .innerJoin(schema.serverMembers, and(eq(schema.serverMembers.serverId, schema.servers.id), eq(schema.serverMembers.userId, userId)))
      .orderBy(asc(schema.servers.createdAt));
    return rows.map(({ server, memberCount }) => ({ ...server, memberCount: Number(memberCount) }));
  }

  async findServerById(id: string): Promise<ServerRecord | null> {
    const [row] = await this.db.select().from(schema.servers).where(eq(schema.servers.id, id)).limit(1);
    return row ?? null;
  }

  async findServerByInviteCode(inviteCode: string): Promise<ServerRecord | null> {
    const [row] = await this.db.select().from(schema.servers).where(eq(schema.servers.inviteCode, inviteCode)).limit(1);
    return row ?? null;
  }

  async findServerMember(serverId: string, userId: string): Promise<ServerMemberRecord | null> {
    const [row] = await this.db.select().from(schema.serverMembers).where(and(eq(schema.serverMembers.serverId, serverId), eq(schema.serverMembers.userId, userId))).limit(1);
    return row ?? null;
  }

  async addServerMember(member: ServerMemberRecord): Promise<boolean> {
    const rows = await this.db.insert(schema.serverMembers).values(member).onConflictDoNothing().returning({ userId: schema.serverMembers.userId });
    return rows.length === 1;
  }

  async removeServerMember(serverId: string, userId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await tx.delete(schema.serverMemberRoles).where(and(eq(schema.serverMemberRoles.serverId, serverId), eq(schema.serverMemberRoles.userId, userId)));
      const rows = await tx.delete(schema.serverMembers).where(and(eq(schema.serverMembers.serverId, serverId), eq(schema.serverMembers.userId, userId))).returning({ userId: schema.serverMembers.userId });
      return rows.length === 1;
    });
  }

  async listServerMembers(serverId: string): Promise<ServerMemberProfile[]> {
    const rows = await this.db
      .select({ member: schema.serverMembers, displayName: schema.users.displayName, platformRole: schema.users.platformRole })
      .from(schema.serverMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.serverMembers.userId))
      .where(eq(schema.serverMembers.serverId, serverId))
      .orderBy(asc(schema.serverMembers.joinedAt));
    return rows.map(({ member, displayName, platformRole }) => ({ ...member, displayName, platformRole }));
  }

  async listServerRoles(serverId: string): Promise<ServerRoleRecord[]> {
    return this.db.select().from(schema.serverRoles).where(eq(schema.serverRoles.serverId, serverId)).orderBy(asc(schema.serverRoles.position));
  }

  async listMemberRoleIds(serverId: string, userId: string): Promise<string[]> {
    const rows = await this.db.select({ roleId: schema.serverMemberRoles.roleId }).from(schema.serverMemberRoles).where(and(eq(schema.serverMemberRoles.serverId, serverId), eq(schema.serverMemberRoles.userId, userId)));
    return rows.map((row) => row.roleId);
  }

  async listAllMemberRoles(serverId: string): Promise<Array<{ userId: string; roleId: string }>> {
    return this.db.select({ userId: schema.serverMemberRoles.userId, roleId: schema.serverMemberRoles.roleId }).from(schema.serverMemberRoles).where(eq(schema.serverMemberRoles.serverId, serverId));
  }

  async createServerRole(role: ServerRoleRecord): Promise<void> {
    await this.db.insert(schema.serverRoles).values(role);
  }

  async updateServerRole(id: string, values: Partial<Pick<ServerRoleRecord, 'name' | 'color' | 'permissions' | 'position'>>, now: Date): Promise<ServerRoleRecord | null> {
    const [row] = await this.db.update(schema.serverRoles).set({ ...values, updatedAt: now }).where(eq(schema.serverRoles.id, id)).returning();
    return row ?? null;
  }

  async reorderServerRole(serverId: string, id: string, currentPosition: number, position: number, now: Date): Promise<ServerRoleRecord | null> {
    return this.db.transaction(async (tx) => {
      const range = position > currentPosition
        ? and(gt(schema.serverRoles.position, currentPosition), lte(schema.serverRoles.position, position))
        : and(gte(schema.serverRoles.position, position), lt(schema.serverRoles.position, currentPosition));
      await tx.update(schema.serverRoles).set({ position: sql`${schema.serverRoles.position} + ${position > currentPosition ? -1 : 1}`, updatedAt: now }).where(and(eq(schema.serverRoles.serverId, serverId), eq(schema.serverRoles.kind, 'CUSTOM'), ne(schema.serverRoles.id, id), range));
      const [updated] = await tx.update(schema.serverRoles).set({ position, updatedAt: now }).where(and(eq(schema.serverRoles.serverId, serverId), eq(schema.serverRoles.id, id))).returning();
      return updated ?? null;
    });
  }

  async deleteServerRole(id: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await tx.delete(schema.channelPermissionOverwrites).where(and(eq(schema.channelPermissionOverwrites.targetType, 'ROLE'), eq(schema.channelPermissionOverwrites.targetId, id)));
      const rows = await tx.delete(schema.serverRoles).where(eq(schema.serverRoles.id, id)).returning({ id: schema.serverRoles.id });
      return rows.length === 1;
    });
  }

  async assignMemberRoles(serverId: string, userId: string, roleIds: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(schema.serverMemberRoles).where(and(eq(schema.serverMemberRoles.serverId, serverId), eq(schema.serverMemberRoles.userId, userId)));
      if (roleIds.length > 0) await tx.insert(schema.serverMemberRoles).values(roleIds.map((roleId) => ({ serverId, userId, roleId })));
    });
  }

  async listServerChannels(serverId: string): Promise<ServerChannelRecord[]> {
    return this.db.select().from(schema.serverChannels).where(eq(schema.serverChannels.serverId, serverId)).orderBy(asc(schema.serverChannels.position));
  }

  async findServerChannel(id: string): Promise<ServerChannelRecord | null> {
    const [row] = await this.db.select().from(schema.serverChannels).where(eq(schema.serverChannels.id, id)).limit(1);
    return row ?? null;
  }

  async createServerChannel(channel: ServerChannelRecord): Promise<void> {
    await this.db.insert(schema.serverChannels).values(channel);
  }

  async deleteServerChannel(id: string): Promise<boolean> {
    const rows = await this.db.delete(schema.serverChannels).where(eq(schema.serverChannels.id, id)).returning({ id: schema.serverChannels.id });
    return rows.length === 1;
  }

  async listChannelPermissionOverwrites(channelIds: string[]): Promise<ChannelPermissionOverwriteRecord[]> {
    if (channelIds.length === 0) return [];
    return this.db.select().from(schema.channelPermissionOverwrites).where(inArray(schema.channelPermissionOverwrites.channelId, channelIds));
  }

  async upsertChannelPermissionOverwrite(overwrite: ChannelPermissionOverwriteRecord): Promise<void> {
    await this.db.insert(schema.channelPermissionOverwrites).values(overwrite).onConflictDoUpdate({
      target: [schema.channelPermissionOverwrites.channelId, schema.channelPermissionOverwrites.targetType, schema.channelPermissionOverwrites.targetId],
      set: { allow: overwrite.allow, deny: overwrite.deny, updatedAt: overwrite.updatedAt },
    });
  }

  async deleteChannelPermissionOverwrite(channelId: string, targetType: PermissionOverwriteTargetType, targetId: string): Promise<boolean> {
    const rows = await this.db.delete(schema.channelPermissionOverwrites).where(and(eq(schema.channelPermissionOverwrites.channelId, channelId), eq(schema.channelPermissionOverwrites.targetType, targetType), eq(schema.channelPermissionOverwrites.targetId, targetId))).returning({ channelId: schema.channelPermissionOverwrites.channelId });
    return rows.length === 1;
  }

  async createServerAuditLog(entry: ServerAuditLogRecord): Promise<void> {
    await this.db.insert(schema.serverAuditLogs).values(entry);
  }

  async listServerAuditLog(serverId: string, limit: number): Promise<Array<ServerAuditLogRecord & { actorDisplayName: string | null }>> {
    const rows = await this.db.select({ entry: schema.serverAuditLogs, actorDisplayName: schema.users.displayName }).from(schema.serverAuditLogs).leftJoin(schema.users, eq(schema.users.id, schema.serverAuditLogs.actorUserId)).where(eq(schema.serverAuditLogs.serverId, serverId)).orderBy(desc(schema.serverAuditLogs.createdAt)).limit(limit);
    return rows.map(({ entry, actorDisplayName }) => ({ ...entry, actorDisplayName }));
  }

  async listTextMessages(channelId: string, before: Date | null, limit: number): Promise<TextMessageWithAuthor[]> {
    const where = before
      ? and(eq(schema.textMessages.channelId, channelId), lt(schema.textMessages.createdAt, before))
      : eq(schema.textMessages.channelId, channelId);
    const rows = await this.db
      .select({ message: schema.textMessages, displayName: schema.users.displayName, platformRole: schema.users.platformRole })
      .from(schema.textMessages)
      .innerJoin(schema.users, eq(schema.users.id, schema.textMessages.authorUserId))
      .where(where)
      .orderBy(desc(schema.textMessages.createdAt))
      .limit(limit);
    return rows.reverse().map(({ message, displayName, platformRole }) => ({ ...message, displayName, platformRole }));
  }

  async findTextMessage(id: string): Promise<TextMessageRecord | null> {
    const [row] = await this.db.select().from(schema.textMessages).where(eq(schema.textMessages.id, id)).limit(1);
    return row ?? null;
  }

  async findTextMessagesWithAuthors(ids: string[]): Promise<TextMessageWithAuthor[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({ message: schema.textMessages, displayName: schema.users.displayName, platformRole: schema.users.platformRole })
      .from(schema.textMessages)
      .innerJoin(schema.users, eq(schema.users.id, schema.textMessages.authorUserId))
      .where(inArray(schema.textMessages.id, ids));
    return rows.map(({ message, displayName, platformRole }) => ({ ...message, displayName, platformRole }));
  }

  async listMessageReactionSummaries(messageIds: string[], currentUserId: string): Promise<MessageReactionSummary[]> {
    if (messageIds.length === 0) return [];
    const rows = await this.db.select().from(schema.messageReactions).where(inArray(schema.messageReactions.messageId, messageIds));
    const grouped = new Map<string, MessageReactionSummary>();
    for (const reaction of rows) {
      const key = `${reaction.messageId}:${reaction.emoji}`;
      const current = grouped.get(key) ?? { messageId: reaction.messageId, emoji: reaction.emoji, count: 0, reactedByCurrentUser: false };
      current.count += 1;
      current.reactedByCurrentUser ||= reaction.userId === currentUserId;
      grouped.set(key, current);
    }
    return [...grouped.values()];
  }

  async createTextMessage(message: TextMessageRecord): Promise<void> {
    await this.db.insert(schema.textMessages).values(message);
  }

  async updateTextMessage(id: string, content: string, now: Date): Promise<TextMessageRecord | null> {
    const [row] = await this.db.update(schema.textMessages).set({ content, editedAt: now }).where(eq(schema.textMessages.id, id)).returning();
    return row ?? null;
  }

  async deleteTextMessage(id: string): Promise<boolean> {
    const rows = await this.db.delete(schema.textMessages).where(eq(schema.textMessages.id, id)).returning({ id: schema.textMessages.id });
    return rows.length === 1;
  }

  async addMessageReaction(reaction: MessageReactionRecord): Promise<void> {
    await this.db.insert(schema.messageReactions).values(reaction).onConflictDoNothing();
  }

  async removeMessageReaction(messageId: string, userId: string, emoji: string): Promise<void> {
    await this.db.delete(schema.messageReactions).where(and(eq(schema.messageReactions.messageId, messageId), eq(schema.messageReactions.userId, userId), eq(schema.messageReactions.emoji, emoji)));
  }

  async markChannelRead(state: ChannelReadStateRecord): Promise<void> {
    await this.db.insert(schema.channelReadStates).values(state).onConflictDoUpdate({
      target: [schema.channelReadStates.channelId, schema.channelReadStates.userId],
      set: { readAt: sql`greatest(${schema.channelReadStates.readAt}, ${state.readAt})` },
    });
  }

  async listChannelUnreadCounts(channelIds: string[], userId: string, since: Date): Promise<ChannelUnreadCount[]> {
    if (channelIds.length === 0) return [];
    const [states, messages] = await Promise.all([
      this.db.select().from(schema.channelReadStates).where(and(eq(schema.channelReadStates.userId, userId), inArray(schema.channelReadStates.channelId, channelIds))),
      this.db.select({ channelId: schema.textMessages.channelId, createdAt: schema.textMessages.createdAt }).from(schema.textMessages).where(and(inArray(schema.textMessages.channelId, channelIds), ne(schema.textMessages.authorUserId, userId), gte(schema.textMessages.createdAt, since))),
    ]);
    const readAt = new Map(states.map((state) => [state.channelId, state.readAt]));
    return channelIds.map((channelId) => ({ channelId, count: messages.filter((message) => message.channelId === channelId && (readAt.has(channelId) ? message.createdAt > readAt.get(channelId)! : message.createdAt >= since)).length }));
  }

  async listMessageAttachments(messageIds: string[]): Promise<MessageAttachmentMetadata[]> {
    if (messageIds.length === 0) return [];
    return this.db.select({ id: schema.messageAttachments.id, messageId: schema.messageAttachments.messageId, uploaderUserId: schema.messageAttachments.uploaderUserId, fileName: schema.messageAttachments.fileName, mimeType: schema.messageAttachments.mimeType, size: schema.messageAttachments.size, createdAt: schema.messageAttachments.createdAt }).from(schema.messageAttachments).where(inArray(schema.messageAttachments.messageId, messageIds)).orderBy(asc(schema.messageAttachments.createdAt));
  }

  async findMessageAttachment(id: string): Promise<MessageAttachmentRecord | null> {
    const [attachment] = await this.db.select().from(schema.messageAttachments).where(eq(schema.messageAttachments.id, id)).limit(1);
    return attachment ?? null;
  }

  async createMessageAttachment(attachment: MessageAttachmentRecord): Promise<void> {
    await this.db.insert(schema.messageAttachments).values(attachment);
  }

  async deleteMessageAttachment(id: string): Promise<boolean> {
    return (await this.db.delete(schema.messageAttachments).where(eq(schema.messageAttachments.id, id)).returning({ id: schema.messageAttachments.id })).length === 1;
  }

  async listMessageNotifications(userId: string, since: Date, afterId: string | null, limit: number): Promise<MessageNotificationRecord[]> {
    return this.db
      .select({
        id: schema.textMessages.id,
        serverId: schema.servers.id,
        serverName: schema.servers.name,
        channelId: schema.serverChannels.id,
        channelName: schema.serverChannels.name,
        authorUserId: schema.users.id,
        authorDisplayName: schema.users.displayName,
        content: schema.textMessages.content,
        createdAt: schema.textMessages.createdAt,
      })
      .from(schema.textMessages)
      .innerJoin(schema.users, eq(schema.users.id, schema.textMessages.authorUserId))
      .innerJoin(schema.serverChannels, eq(schema.serverChannels.id, schema.textMessages.channelId))
      .innerJoin(schema.servers, eq(schema.servers.id, schema.serverChannels.serverId))
      .innerJoin(schema.serverMembers, and(eq(schema.serverMembers.serverId, schema.servers.id), eq(schema.serverMembers.userId, userId)))
      .where(and(
        eq(schema.serverChannels.type, 'text'),
        ne(schema.textMessages.authorUserId, userId),
        afterId === null
          ? gte(schema.textMessages.createdAt, since)
          : or(gt(schema.textMessages.createdAt, since), and(eq(schema.textMessages.createdAt, since), gt(schema.textMessages.id, afterId))),
      ))
      .orderBy(asc(schema.textMessages.createdAt), asc(schema.textMessages.id))
      .limit(limit);
  }

  async getOrCreateDirectConversation(userAId: string, userBId: string, now: Date): Promise<DirectConversationRecord> {
    const [firstUserId, secondUserId] = [userAId, userBId].sort();
    const candidate: DirectConversationRecord = { id: crypto.randomUUID(), userAId: firstUserId!, userBId: secondUserId!, userAReadAt: now, userBReadAt: now, userAReadMessageId: null, userBReadMessageId: null, createdAt: now, updatedAt: now };
    const [created] = await this.db.insert(schema.directConversations).values(candidate).onConflictDoNothing({ target: [schema.directConversations.userAId, schema.directConversations.userBId] }).returning();
    if (created) return created;
    const [existing] = await this.db.select().from(schema.directConversations).where(and(eq(schema.directConversations.userAId, firstUserId!), eq(schema.directConversations.userBId, secondUserId!))).limit(1);
    if (!existing) throw new Error('Direct conversation conflict could not be resolved');
    return existing;
  }

  async findDirectConversation(id: string): Promise<DirectConversationRecord | null> {
    const [conversation] = await this.db.select().from(schema.directConversations).where(eq(schema.directConversations.id, id)).limit(1);
    return conversation ?? null;
  }

  async listDirectConversationOverviews(userId: string): Promise<DirectConversationOverviewRecord[]> {
    const conversations = await this.db.select().from(schema.directConversations).where(or(eq(schema.directConversations.userAId, userId), eq(schema.directConversations.userBId, userId))).orderBy(desc(schema.directConversations.updatedAt)).limit(100);
    return Promise.all(conversations.map(async (conversation): Promise<DirectConversationOverviewRecord> => {
      const participantId = conversation.userAId === userId ? conversation.userBId : conversation.userAId;
      const [participant] = await this.db.select({ id: schema.users.id, displayName: schema.users.displayName, platformRole: schema.users.platformRole }).from(schema.users).where(eq(schema.users.id, participantId)).limit(1);
      if (!participant) throw new Error('Direct conversation participant was not found');
      const [lastMessage] = await this.db.select({ authorUserId: schema.directMessages.authorUserId, content: schema.directMessages.content, createdAt: schema.directMessages.createdAt }).from(schema.directMessages).where(eq(schema.directMessages.conversationId, conversation.id)).orderBy(desc(schema.directMessages.createdAt), desc(schema.directMessages.id)).limit(1);
      const readAt = conversation.userAId === userId ? conversation.userAReadAt : conversation.userBReadAt;
      const readMessageId = conversation.userAId === userId ? conversation.userAReadMessageId : conversation.userBReadMessageId;
      const [unread] = await this.db.select({ count: sql<number>`count(*)::int` }).from(schema.directMessages).where(and(eq(schema.directMessages.conversationId, conversation.id), ne(schema.directMessages.authorUserId, userId), or(gt(schema.directMessages.createdAt, readAt), and(eq(schema.directMessages.createdAt, readAt), readMessageId === null ? sql`true` : gt(schema.directMessages.id, readMessageId)))));
      return { conversation, participant, lastMessage: lastMessage ?? null, unreadCount: unread?.count ?? 0 };
    }));
  }

  async listDirectMessages(conversationId: string, before: Date | null, limit: number): Promise<DirectMessageWithAuthor[]> {
    const where = before ? and(eq(schema.directMessages.conversationId, conversationId), lt(schema.directMessages.createdAt, before)) : eq(schema.directMessages.conversationId, conversationId);
    const rows = await this.db.select({ message: schema.directMessages, displayName: schema.users.displayName, platformRole: schema.users.platformRole }).from(schema.directMessages).innerJoin(schema.users, eq(schema.users.id, schema.directMessages.authorUserId)).where(where).orderBy(desc(schema.directMessages.createdAt), desc(schema.directMessages.id)).limit(limit);
    return rows.reverse().map(({ message, displayName, platformRole }) => ({ ...message, displayName, platformRole }));
  }

  async findDirectMessagesWithAuthors(ids: string[]): Promise<DirectMessageWithAuthor[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.select({ message: schema.directMessages, displayName: schema.users.displayName, platformRole: schema.users.platformRole }).from(schema.directMessages).innerJoin(schema.users, eq(schema.users.id, schema.directMessages.authorUserId)).where(inArray(schema.directMessages.id, ids));
    return rows.map(({ message, displayName, platformRole }) => ({ ...message, displayName, platformRole }));
  }

  async findDirectMessage(id: string): Promise<DirectMessageRecord | null> {
    const [message] = await this.db.select().from(schema.directMessages).where(eq(schema.directMessages.id, id)).limit(1);
    return message ?? null;
  }

  async createDirectMessage(message: DirectMessageRecord): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(schema.directMessages).values(message);
      await tx.update(schema.directConversations).set({ updatedAt: message.createdAt }).where(eq(schema.directConversations.id, message.conversationId));
    });
  }

  async updateDirectMessage(id: string, content: string, now: Date): Promise<DirectMessageRecord | null> {
    const [message] = await this.db.update(schema.directMessages).set({ content, editedAt: now }).where(eq(schema.directMessages.id, id)).returning();
    return message ?? null;
  }

  async deleteDirectMessage(id: string): Promise<boolean> {
    return (await this.db.delete(schema.directMessages).where(eq(schema.directMessages.id, id)).returning({ id: schema.directMessages.id })).length === 1;
  }

  async listDirectMessageReactionSummaries(messageIds: string[], currentUserId: string): Promise<MessageReactionSummary[]> {
    if (messageIds.length === 0) return [];
    const rows = await this.db.select().from(schema.directMessageReactions).where(inArray(schema.directMessageReactions.messageId, messageIds));
    const grouped = new Map<string, MessageReactionSummary>();
    for (const reaction of rows) {
      const key = `${reaction.messageId}:${reaction.emoji}`;
      const current = grouped.get(key) ?? { messageId: reaction.messageId, emoji: reaction.emoji, count: 0, reactedByCurrentUser: false };
      current.count += 1;
      current.reactedByCurrentUser ||= reaction.userId === currentUserId;
      grouped.set(key, current);
    }
    return [...grouped.values()];
  }

  async addDirectMessageReaction(reaction: MessageReactionRecord): Promise<void> {
    await this.db.insert(schema.directMessageReactions).values(reaction).onConflictDoNothing();
  }

  async removeDirectMessageReaction(messageId: string, userId: string, emoji: string): Promise<void> {
    await this.db.delete(schema.directMessageReactions).where(and(eq(schema.directMessageReactions.messageId, messageId), eq(schema.directMessageReactions.userId, userId), eq(schema.directMessageReactions.emoji, emoji)));
  }

  async markDirectConversationRead(conversationId: string, userId: string, readAt: Date, messageId: string): Promise<boolean> {
    const [conversation] = await this.db.select().from(schema.directConversations).where(eq(schema.directConversations.id, conversationId)).limit(1);
    if (!conversation) return false;
    if (conversation.userAId === userId) await this.db.update(schema.directConversations).set({ userAReadAt: readAt, userAReadMessageId: messageId }).where(and(eq(schema.directConversations.id, conversationId), or(lt(schema.directConversations.userAReadAt, readAt), and(eq(schema.directConversations.userAReadAt, readAt), or(isNull(schema.directConversations.userAReadMessageId), lt(schema.directConversations.userAReadMessageId, messageId))))));
    else if (conversation.userBId === userId) await this.db.update(schema.directConversations).set({ userBReadAt: readAt, userBReadMessageId: messageId }).where(and(eq(schema.directConversations.id, conversationId), or(lt(schema.directConversations.userBReadAt, readAt), and(eq(schema.directConversations.userBReadAt, readAt), or(isNull(schema.directConversations.userBReadMessageId), lt(schema.directConversations.userBReadMessageId, messageId))))));
    else return false;
    return true;
  }

  async listDirectMessageAttachments(messageIds: string[]): Promise<DirectMessageAttachmentMetadata[]> {
    if (messageIds.length === 0) return [];
    return this.db.select({ id: schema.directMessageAttachments.id, messageId: schema.directMessageAttachments.messageId, uploaderUserId: schema.directMessageAttachments.uploaderUserId, fileName: schema.directMessageAttachments.fileName, mimeType: schema.directMessageAttachments.mimeType, size: schema.directMessageAttachments.size, createdAt: schema.directMessageAttachments.createdAt }).from(schema.directMessageAttachments).where(inArray(schema.directMessageAttachments.messageId, messageIds)).orderBy(asc(schema.directMessageAttachments.createdAt));
  }

  async findDirectMessageAttachment(id: string): Promise<DirectMessageAttachmentRecord | null> {
    const [attachment] = await this.db.select().from(schema.directMessageAttachments).where(eq(schema.directMessageAttachments.id, id)).limit(1);
    return attachment ?? null;
  }

  async createDirectMessageAttachment(attachment: DirectMessageAttachmentRecord): Promise<void> {
    await this.db.insert(schema.directMessageAttachments).values(attachment);
  }

  async deleteDirectMessageAttachment(id: string): Promise<boolean> {
    return (await this.db.delete(schema.directMessageAttachments).where(eq(schema.directMessageAttachments.id, id)).returning({ id: schema.directMessageAttachments.id })).length === 1;
  }

  async claimChannelLease(channelId: string, participantIdentity: string, participantDisplayName: string, now: Date, leaseSeconds: number): Promise<{ status: 'ok'; lease: ChannelLeaseRecord } | { status: 'busy'; lease: ChannelLeaseRecord }> {
    return this.db.transaction(async (tx) => {
      await tx.select({ id: schema.serverChannels.id }).from(schema.serverChannels).where(eq(schema.serverChannels.id, channelId)).for('update');
      const [current] = await tx.select().from(schema.channelScreenShareLeases).where(eq(schema.channelScreenShareLeases.channelId, channelId)).limit(1).for('update');
      const decision = decideScreenShareLease(current ?? null, participantIdentity, participantDisplayName, now, leaseSeconds);
      if (!decision.ok) return { status: 'busy', lease: { channelId, ...decision.current } };
      const lease: ChannelLeaseRecord = { channelId, ...decision.lease };
      await tx.insert(schema.channelScreenShareLeases).values(lease).onConflictDoUpdate({
        target: schema.channelScreenShareLeases.channelId,
        set: { participantIdentity: lease.participantIdentity, participantDisplayName: lease.participantDisplayName, acquiredAt: lease.acquiredAt, expiresAt: lease.expiresAt },
      });
      return { status: 'ok', lease };
    });
  }

  async heartbeatChannelLease(channelId: string, participantIdentity: string, now: Date, leaseSeconds: number): Promise<ChannelLeaseRecord | null> {
    const [row] = await this.db.update(schema.channelScreenShareLeases).set({ expiresAt: expiresAt(now, leaseSeconds) }).where(and(eq(schema.channelScreenShareLeases.channelId, channelId), eq(schema.channelScreenShareLeases.participantIdentity, participantIdentity))).returning();
    return row ?? null;
  }

  async releaseChannelLease(channelId: string, participantIdentity: string): Promise<boolean> {
    const rows = await this.db.delete(schema.channelScreenShareLeases).where(and(eq(schema.channelScreenShareLeases.channelId, channelId), eq(schema.channelScreenShareLeases.participantIdentity, participantIdentity))).returning({ channelId: schema.channelScreenShareLeases.channelId });
    return rows.length === 1;
  }

  async releaseChannelLeaseByParticipant(participantIdentity: string): Promise<void> {
    await this.db.delete(schema.channelScreenShareLeases).where(eq(schema.channelScreenShareLeases.participantIdentity, participantIdentity));
  }
}

export function createPostgresStore(databaseUrl: string): { store: PostgresStore; close: () => Promise<void> } {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10, idleTimeoutMillis: 30_000 });
  return { store: new PostgresStore(drizzle(pool, { schema })), close: () => pool.end() };
}
