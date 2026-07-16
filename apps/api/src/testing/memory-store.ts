import { decideScreenShareLease, expiresAt, isExpired } from '@vatrushka/shared';
import type { PlatformRole } from '@vatrushka/shared';

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
  TextMessageRecord,
  TextMessageWithAuthor,
  ChannelLeaseRecord,
} from '../domain.js';
import type { DataStore } from '../ports.js';

export class MemoryStore implements DataStore {
  readonly authCodes = new Map<string, AuthCodeRecord>();
  readonly users = new Map<string, UserRecord>();
  readonly sessions = new Map<string, SessionRecord>();
  readonly rooms = new Map<string, RoomRecord>();
  readonly guests = new Map<string, GuestSessionRecord>();
  readonly leases = new Map<string, LeaseRecord>();
  readonly servers = new Map<string, ServerRecord>();
  readonly serverMembers = new Map<string, ServerMemberRecord>();
  readonly serverRoles = new Map<string, ServerRoleRecord>();
  readonly serverMemberRoles = new Set<string>();
  readonly serverChannels = new Map<string, ServerChannelRecord>();
  readonly textMessages = new Map<string, TextMessageRecord>();
  readonly channelLeases = new Map<string, ChannelLeaseRecord>();

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

  async findLatestAuthCodeForPurpose(email: string, purpose: AuthCodeRecord['purpose']): Promise<AuthCodeRecord | null> {
    const rows = [...this.authCodes.values()].filter((code) => code.email === email && code.purpose === purpose);
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
    const user: UserRecord = { id: crypto.randomUUID(), email, displayName: null, platformRole: 'member', passwordHash: null, emailVerifiedAt: now, totpSecretEncrypted: null, twoFactorEnabled: false, createdAt: now, updatedAt: now };
    this.users.set(user.id, user);
    return { user: structuredClone(user), isNewUser: true };
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const row = this.users.get(id);
    return row ? structuredClone(row) : null;
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const row = [...this.users.values()].find((user) => user.email === email);
    return row ? structuredClone(row) : null;
  }

  async createUserWithPassword(email: string, passwordHash: string, now: Date): Promise<UserRecord | null> {
    if ([...this.users.values()].some((user) => user.email === email)) return null;
    const user: UserRecord = {
      id: crypto.randomUUID(),
      email,
      displayName: null,
      platformRole: 'member',
      passwordHash,
      emailVerifiedAt: now,
      totpSecretEncrypted: null,
      twoFactorEnabled: false,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    return structuredClone(user);
  }

  async updateDisplayName(id: string, displayName: string, now: Date): Promise<UserRecord | null> {
    const row = this.users.get(id);
    if (!row) return null;
    row.displayName = displayName;
    row.updatedAt = now;
    return structuredClone(row);
  }

  async updatePassword(id: string, passwordHash: string, now: Date): Promise<UserRecord | null> {
    const row = this.users.get(id);
    if (!row) return null;
    row.passwordHash = passwordHash;
    row.emailVerifiedAt = now;
    row.updatedAt = now;
    return structuredClone(row);
  }

  async updateTwoFactor(id: string, secretEncrypted: string | null, enabled: boolean, now: Date): Promise<UserRecord | null> {
    const row = this.users.get(id);
    if (!row) return null;
    row.totpSecretEncrypted = secretEncrypted;
    row.twoFactorEnabled = enabled;
    row.updatedAt = now;
    return structuredClone(row);
  }

  async setPlatformRoleByEmail(email: string, role: PlatformRole, now: Date): Promise<UserRecord | null> {
    const row = [...this.users.values()].find((user) => user.email === email);
    if (!row) return null;
    row.platformRole = role;
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

  async createServerGraph(graph: ServerGraph): Promise<boolean> {
    if ([...this.servers.values()].some((server) => server.inviteCode === graph.server.inviteCode)) return false;
    this.servers.set(graph.server.id, structuredClone(graph.server));
    for (const member of graph.members) this.serverMembers.set(`${member.serverId}:${member.userId}`, structuredClone(member));
    for (const role of graph.roles) this.serverRoles.set(role.id, structuredClone(role));
    for (const assignment of graph.memberRoles) this.serverMemberRoles.add(`${assignment.serverId}:${assignment.userId}:${assignment.roleId}`);
    for (const channel of graph.channels) this.serverChannels.set(channel.id, structuredClone(channel));
    return true;
  }

  async listServersForUser(userId: string): Promise<ServerWithMemberCount[]> {
    const ids = new Set([...this.serverMembers.values()].filter((member) => member.userId === userId).map((member) => member.serverId));
    return [...this.servers.values()].filter((server) => ids.has(server.id)).map((server) => ({
      ...structuredClone(server),
      memberCount: [...this.serverMembers.values()].filter((member) => member.serverId === server.id).length,
    }));
  }

  async findServerById(id: string): Promise<ServerRecord | null> {
    const server = this.servers.get(id);
    return server ? structuredClone(server) : null;
  }

  async findServerByInviteCode(inviteCode: string): Promise<ServerRecord | null> {
    const server = [...this.servers.values()].find((current) => current.inviteCode === inviteCode);
    return server ? structuredClone(server) : null;
  }

  async findServerMember(serverId: string, userId: string): Promise<ServerMemberRecord | null> {
    const member = this.serverMembers.get(`${serverId}:${userId}`);
    return member ? structuredClone(member) : null;
  }

  async addServerMember(member: ServerMemberRecord): Promise<boolean> {
    const key = `${member.serverId}:${member.userId}`;
    if (this.serverMembers.has(key)) return false;
    this.serverMembers.set(key, structuredClone(member));
    return true;
  }

  async removeServerMember(serverId: string, userId: string): Promise<boolean> {
    const removed = this.serverMembers.delete(`${serverId}:${userId}`);
    const prefix = `${serverId}:${userId}:`;
    for (const key of this.serverMemberRoles) if (key.startsWith(prefix)) this.serverMemberRoles.delete(key);
    return removed;
  }

  async listServerMembers(serverId: string): Promise<ServerMemberProfile[]> {
    return [...this.serverMembers.values()].filter((member) => member.serverId === serverId).map((member) => {
      const user = this.users.get(member.userId);
      if (!user) throw new Error('Server member user was not found');
      return { ...structuredClone(member), displayName: user.displayName, platformRole: user.platformRole };
    });
  }

  async listServerRoles(serverId: string): Promise<ServerRoleRecord[]> {
    return [...this.serverRoles.values()].filter((role) => role.serverId === serverId).sort((a, b) => a.position - b.position).map((role) => structuredClone(role));
  }

  async listMemberRoleIds(serverId: string, userId: string): Promise<string[]> {
    const prefix = `${serverId}:${userId}:`;
    return [...this.serverMemberRoles].filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length));
  }

  async listAllMemberRoles(serverId: string): Promise<Array<{ userId: string; roleId: string }>> {
    const prefix = `${serverId}:`;
    return [...this.serverMemberRoles].filter((key) => key.startsWith(prefix)).map((key) => {
      const [, userId, roleId] = key.split(':');
      return { userId: userId ?? '', roleId: roleId ?? '' };
    });
  }

  async createServerRole(role: ServerRoleRecord): Promise<void> {
    this.serverRoles.set(role.id, structuredClone(role));
  }

  async updateServerRole(id: string, values: Partial<Pick<ServerRoleRecord, 'name' | 'color' | 'permissions'>>, now: Date): Promise<ServerRoleRecord | null> {
    const role = this.serverRoles.get(id);
    if (!role) return null;
    Object.assign(role, structuredClone(values), { updatedAt: now });
    return structuredClone(role);
  }

  async assignMemberRoles(serverId: string, userId: string, roleIds: string[]): Promise<void> {
    const prefix = `${serverId}:${userId}:`;
    for (const key of this.serverMemberRoles) if (key.startsWith(prefix)) this.serverMemberRoles.delete(key);
    for (const roleId of roleIds) this.serverMemberRoles.add(`${serverId}:${userId}:${roleId}`);
  }

  async listServerChannels(serverId: string): Promise<ServerChannelRecord[]> {
    return [...this.serverChannels.values()].filter((channel) => channel.serverId === serverId).sort((a, b) => a.position - b.position).map((channel) => structuredClone(channel));
  }

  async findServerChannel(id: string): Promise<ServerChannelRecord | null> {
    const channel = this.serverChannels.get(id);
    return channel ? structuredClone(channel) : null;
  }

  async createServerChannel(channel: ServerChannelRecord): Promise<void> {
    this.serverChannels.set(channel.id, structuredClone(channel));
  }

  async deleteServerChannel(id: string): Promise<boolean> {
    for (const [messageId, message] of this.textMessages) if (message.channelId === id) this.textMessages.delete(messageId);
    this.channelLeases.delete(id);
    return this.serverChannels.delete(id);
  }

  async listTextMessages(channelId: string, before: Date | null, limit: number): Promise<TextMessageWithAuthor[]> {
    return [...this.textMessages.values()]
      .filter((message) => message.channelId === channelId && (!before || message.createdAt < before))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .reverse()
      .map((message) => {
        const user = this.users.get(message.authorUserId);
        if (!user) throw new Error('Message author was not found');
        return { ...structuredClone(message), displayName: user.displayName, platformRole: user.platformRole };
      });
  }

  async findTextMessage(id: string): Promise<TextMessageRecord | null> {
    const message = this.textMessages.get(id);
    return message ? structuredClone(message) : null;
  }

  async createTextMessage(message: TextMessageRecord): Promise<void> {
    this.textMessages.set(message.id, structuredClone(message));
  }

  async updateTextMessage(id: string, content: string, now: Date): Promise<TextMessageRecord | null> {
    const message = this.textMessages.get(id);
    if (!message) return null;
    message.content = content;
    message.editedAt = now;
    return structuredClone(message);
  }

  async deleteTextMessage(id: string): Promise<boolean> {
    return this.textMessages.delete(id);
  }

  async claimChannelLease(channelId: string, participantIdentity: string, participantDisplayName: string, now: Date, leaseSeconds: number): Promise<{ status: 'ok'; lease: ChannelLeaseRecord } | { status: 'busy'; lease: ChannelLeaseRecord }> {
    const current = this.channelLeases.get(channelId) ?? null;
    const decision = decideScreenShareLease(current, participantIdentity, participantDisplayName, now, leaseSeconds);
    if (!decision.ok) return { status: 'busy', lease: structuredClone(current as ChannelLeaseRecord) };
    const lease = { channelId, ...decision.lease };
    this.channelLeases.set(channelId, lease);
    return { status: 'ok', lease: structuredClone(lease) };
  }

  async heartbeatChannelLease(channelId: string, participantIdentity: string, now: Date, leaseSeconds: number): Promise<ChannelLeaseRecord | null> {
    const lease = this.channelLeases.get(channelId);
    if (!lease || lease.participantIdentity !== participantIdentity || isExpired(lease.expiresAt, now)) return null;
    lease.expiresAt = expiresAt(now, leaseSeconds);
    return structuredClone(lease);
  }

  async releaseChannelLease(channelId: string, participantIdentity: string): Promise<boolean> {
    const lease = this.channelLeases.get(channelId);
    if (!lease || lease.participantIdentity !== participantIdentity) return false;
    return this.channelLeases.delete(channelId);
  }

  async releaseChannelLeaseByParticipant(participantIdentity: string): Promise<void> {
    for (const [channelId, lease] of this.channelLeases) if (lease.participantIdentity === participantIdentity) this.channelLeases.delete(channelId);
  }
}
