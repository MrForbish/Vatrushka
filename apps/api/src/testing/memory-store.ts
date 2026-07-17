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
  readonly channelPermissionOverwrites = new Map<string, ChannelPermissionOverwriteRecord>();
  readonly serverAuditLogs = new Map<string, ServerAuditLogRecord>();
  readonly textMessages = new Map<string, TextMessageRecord>();
  readonly messageReactions = new Map<string, MessageReactionRecord>();
  readonly channelReadStates = new Map<string, ChannelReadStateRecord>();
  readonly messageAttachments = new Map<string, MessageAttachmentRecord>();
  readonly directConversations = new Map<string, DirectConversationRecord>();
  readonly directMessages = new Map<string, DirectMessageRecord>();
  readonly directMessageReactions = new Map<string, MessageReactionRecord>();
  readonly directMessageAttachments = new Map<string, DirectMessageAttachmentRecord>();
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

  async updateServerRole(id: string, values: Partial<Pick<ServerRoleRecord, 'name' | 'color' | 'permissions' | 'position'>>, now: Date): Promise<ServerRoleRecord | null> {
    const role = this.serverRoles.get(id);
    if (!role) return null;
    Object.assign(role, structuredClone(values), { updatedAt: now });
    return structuredClone(role);
  }

  async reorderServerRole(serverId: string, id: string, currentPosition: number, position: number, now: Date): Promise<ServerRoleRecord | null> {
    for (const role of this.serverRoles.values()) {
      if (role.serverId !== serverId || role.kind !== 'CUSTOM' || role.id === id) continue;
      if (position > currentPosition && role.position > currentPosition && role.position <= position) {
        role.position -= 1;
        role.updatedAt = now;
      }
      if (position < currentPosition && role.position >= position && role.position < currentPosition) {
        role.position += 1;
        role.updatedAt = now;
      }
    }
    return this.updateServerRole(id, { position }, now);
  }

  async deleteServerRole(id: string): Promise<boolean> {
    const role = this.serverRoles.get(id);
    if (!role) return false;
    for (const key of this.serverMemberRoles) if (key.endsWith(`:${id}`)) this.serverMemberRoles.delete(key);
    for (const [key, overwrite] of this.channelPermissionOverwrites) if (overwrite.targetType === 'ROLE' && overwrite.targetId === id) this.channelPermissionOverwrites.delete(key);
    return this.serverRoles.delete(id);
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
    for (const [messageId, message] of this.textMessages) if (message.channelId === id) {
      this.textMessages.delete(messageId);
      for (const [key, reaction] of this.messageReactions) if (reaction.messageId === messageId) this.messageReactions.delete(key);
      for (const [attachmentId, attachment] of this.messageAttachments) if (attachment.messageId === messageId) this.messageAttachments.delete(attachmentId);
    }
    for (const [key, state] of this.channelReadStates) if (state.channelId === id) this.channelReadStates.delete(key);
    this.channelLeases.delete(id);
    for (const [key, overwrite] of this.channelPermissionOverwrites) if (overwrite.channelId === id) this.channelPermissionOverwrites.delete(key);
    return this.serverChannels.delete(id);
  }

  async listChannelPermissionOverwrites(channelIds: string[]): Promise<ChannelPermissionOverwriteRecord[]> {
    const selected = new Set(channelIds);
    return [...this.channelPermissionOverwrites.values()].filter((overwrite) => selected.has(overwrite.channelId)).map((overwrite) => structuredClone(overwrite));
  }

  async upsertChannelPermissionOverwrite(overwrite: ChannelPermissionOverwriteRecord): Promise<void> {
    this.channelPermissionOverwrites.set(`${overwrite.channelId}:${overwrite.targetType}:${overwrite.targetId}`, structuredClone(overwrite));
  }

  async deleteChannelPermissionOverwrite(channelId: string, targetType: PermissionOverwriteTargetType, targetId: string): Promise<boolean> {
    return this.channelPermissionOverwrites.delete(`${channelId}:${targetType}:${targetId}`);
  }

  async createServerAuditLog(entry: ServerAuditLogRecord): Promise<void> {
    this.serverAuditLogs.set(entry.id, structuredClone(entry));
  }

  async listServerAuditLog(serverId: string, limit: number): Promise<Array<ServerAuditLogRecord & { actorDisplayName: string | null }>> {
    return [...this.serverAuditLogs.values()]
      .filter((entry) => entry.serverId === serverId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((entry) => ({ ...structuredClone(entry), actorDisplayName: entry.actorUserId === null ? null : this.users.get(entry.actorUserId)?.displayName ?? null }));
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

  async findTextMessagesWithAuthors(ids: string[]): Promise<TextMessageWithAuthor[]> {
    return ids.flatMap((id) => {
      const message = this.textMessages.get(id);
      if (!message) return [];
      const user = this.users.get(message.authorUserId);
      if (!user) return [];
      return [{ ...structuredClone(message), displayName: user.displayName, platformRole: user.platformRole }];
    });
  }

  async listMessageReactionSummaries(messageIds: string[], currentUserId: string): Promise<MessageReactionSummary[]> {
    const allowed = new Set(messageIds);
    const grouped = new Map<string, MessageReactionSummary>();
    for (const reaction of this.messageReactions.values()) {
      if (!allowed.has(reaction.messageId)) continue;
      const key = `${reaction.messageId}:${reaction.emoji}`;
      const current = grouped.get(key) ?? { messageId: reaction.messageId, emoji: reaction.emoji, count: 0, reactedByCurrentUser: false };
      current.count += 1;
      current.reactedByCurrentUser ||= reaction.userId === currentUserId;
      grouped.set(key, current);
    }
    return [...grouped.values()].map((reaction) => structuredClone(reaction));
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
    for (const [key, reaction] of this.messageReactions) if (reaction.messageId === id) this.messageReactions.delete(key);
    for (const [attachmentId, attachment] of this.messageAttachments) if (attachment.messageId === id) this.messageAttachments.delete(attachmentId);
    for (const message of this.textMessages.values()) if (message.replyToMessageId === id) message.replyToMessageId = null;
    return this.textMessages.delete(id);
  }

  async addMessageReaction(reaction: MessageReactionRecord): Promise<void> {
    this.messageReactions.set(`${reaction.messageId}:${reaction.userId}:${reaction.emoji}`, structuredClone(reaction));
  }

  async removeMessageReaction(messageId: string, userId: string, emoji: string): Promise<void> {
    this.messageReactions.delete(`${messageId}:${userId}:${emoji}`);
  }

  async markChannelRead(state: ChannelReadStateRecord): Promise<void> {
    const key = `${state.channelId}:${state.userId}`;
    const current = this.channelReadStates.get(key);
    if (!current || current.readAt < state.readAt) this.channelReadStates.set(key, structuredClone(state));
  }

  async listChannelUnreadCounts(channelIds: string[], userId: string, since: Date): Promise<ChannelUnreadCount[]> {
    return channelIds.map((channelId) => {
      const state = this.channelReadStates.get(`${channelId}:${userId}`);
      return { channelId, count: [...this.textMessages.values()].filter((message) => message.channelId === channelId && message.authorUserId !== userId && (state ? message.createdAt > state.readAt : message.createdAt >= since)).length };
    });
  }

  async listMessageAttachments(messageIds: string[]): Promise<MessageAttachmentMetadata[]> {
    const allowed = new Set(messageIds);
    return [...this.messageAttachments.values()].filter((attachment) => allowed.has(attachment.messageId)).map((attachment) => structuredClone({
      id: attachment.id,
      messageId: attachment.messageId,
      uploaderUserId: attachment.uploaderUserId,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      createdAt: attachment.createdAt,
    }));
  }

  async findMessageAttachment(id: string): Promise<MessageAttachmentRecord | null> {
    const attachment = this.messageAttachments.get(id);
    return attachment ? structuredClone(attachment) : null;
  }

  async createMessageAttachment(attachment: MessageAttachmentRecord): Promise<void> {
    this.messageAttachments.set(attachment.id, structuredClone(attachment));
  }

  async deleteMessageAttachment(id: string): Promise<boolean> {
    return this.messageAttachments.delete(id);
  }

  async getOrCreateDirectConversation(userAId: string, userBId: string, now: Date): Promise<DirectConversationRecord> {
    const [firstUserId, secondUserId] = [userAId, userBId].sort();
    const existing = [...this.directConversations.values()].find((conversation) => conversation.userAId === firstUserId && conversation.userBId === secondUserId);
    if (existing) return structuredClone(existing);
    const conversation: DirectConversationRecord = { id: crypto.randomUUID(), userAId: firstUserId!, userBId: secondUserId!, userAReadAt: now, userBReadAt: now, userAReadMessageId: null, userBReadMessageId: null, createdAt: now, updatedAt: now };
    this.directConversations.set(conversation.id, conversation);
    return structuredClone(conversation);
  }

  async findDirectConversation(id: string): Promise<DirectConversationRecord | null> {
    const conversation = this.directConversations.get(id);
    return conversation ? structuredClone(conversation) : null;
  }

  async listDirectConversationOverviews(userId: string): Promise<DirectConversationOverviewRecord[]> {
    return [...this.directConversations.values()]
      .filter((conversation) => conversation.userAId === userId || conversation.userBId === userId)
      .map((conversation): DirectConversationOverviewRecord | null => {
        const participantId = conversation.userAId === userId ? conversation.userBId : conversation.userAId;
        const participant = this.users.get(participantId);
        if (!participant) return null;
        const messages = [...this.directMessages.values()].filter((message) => message.conversationId === conversation.id).sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id));
        const readAt = conversation.userAId === userId ? conversation.userAReadAt : conversation.userBReadAt;
        const readMessageId = conversation.userAId === userId ? conversation.userAReadMessageId : conversation.userBReadMessageId;
        const latest = messages[0];
        return {
          conversation: structuredClone(conversation),
          participant: { id: participant.id, displayName: participant.displayName, platformRole: participant.platformRole },
          lastMessage: latest ? { authorUserId: latest.authorUserId, content: latest.content, createdAt: latest.createdAt } : null,
          unreadCount: messages.filter((message) => message.authorUserId !== userId && (message.createdAt > readAt || (message.createdAt.getTime() === readAt.getTime() && (readMessageId === null || message.id.localeCompare(readMessageId) > 0)))).length,
        };
      })
      .filter((overview): overview is DirectConversationOverviewRecord => overview !== null)
      .sort((left, right) => right.conversation.updatedAt.getTime() - left.conversation.updatedAt.getTime())
      .map((overview) => structuredClone(overview));
  }

  async listDirectMessages(conversationId: string, before: Date | null, limit: number): Promise<DirectMessageWithAuthor[]> {
    return [...this.directMessages.values()]
      .filter((message) => message.conversationId === conversationId && (!before || message.createdAt < before))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id))
      .slice(0, limit)
      .reverse()
      .flatMap((message) => {
        const author = this.users.get(message.authorUserId);
        return author ? [{ ...structuredClone(message), displayName: author.displayName, platformRole: author.platformRole }] : [];
      });
  }

  async findDirectMessagesWithAuthors(ids: string[]): Promise<DirectMessageWithAuthor[]> {
    return ids.flatMap((id) => {
      const message = this.directMessages.get(id);
      const author = message ? this.users.get(message.authorUserId) : null;
      return message && author ? [{ ...structuredClone(message), displayName: author.displayName, platformRole: author.platformRole }] : [];
    });
  }

  async findDirectMessage(id: string): Promise<DirectMessageRecord | null> {
    const message = this.directMessages.get(id);
    return message ? structuredClone(message) : null;
  }

  async createDirectMessage(message: DirectMessageRecord): Promise<void> {
    this.directMessages.set(message.id, structuredClone(message));
    const conversation = this.directConversations.get(message.conversationId);
    if (conversation) conversation.updatedAt = message.createdAt;
  }

  async updateDirectMessage(id: string, content: string, now: Date): Promise<DirectMessageRecord | null> {
    const message = this.directMessages.get(id);
    if (!message) return null;
    message.content = content;
    message.editedAt = now;
    return structuredClone(message);
  }

  async deleteDirectMessage(id: string): Promise<boolean> {
    for (const [key, reaction] of this.directMessageReactions) if (reaction.messageId === id) this.directMessageReactions.delete(key);
    for (const [attachmentId, attachment] of this.directMessageAttachments) if (attachment.messageId === id) this.directMessageAttachments.delete(attachmentId);
    for (const message of this.directMessages.values()) if (message.replyToMessageId === id) message.replyToMessageId = null;
    return this.directMessages.delete(id);
  }

  async listDirectMessageReactionSummaries(messageIds: string[], currentUserId: string): Promise<MessageReactionSummary[]> {
    const allowed = new Set(messageIds);
    const grouped = new Map<string, MessageReactionSummary>();
    for (const reaction of this.directMessageReactions.values()) {
      if (!allowed.has(reaction.messageId)) continue;
      const key = `${reaction.messageId}:${reaction.emoji}`;
      const current = grouped.get(key) ?? { messageId: reaction.messageId, emoji: reaction.emoji, count: 0, reactedByCurrentUser: false };
      current.count += 1;
      current.reactedByCurrentUser ||= reaction.userId === currentUserId;
      grouped.set(key, current);
    }
    return [...grouped.values()].map((reaction) => structuredClone(reaction));
  }

  async addDirectMessageReaction(reaction: MessageReactionRecord): Promise<void> {
    this.directMessageReactions.set(`${reaction.messageId}:${reaction.userId}:${reaction.emoji}`, structuredClone(reaction));
  }

  async removeDirectMessageReaction(messageId: string, userId: string, emoji: string): Promise<void> {
    this.directMessageReactions.delete(`${messageId}:${userId}:${emoji}`);
  }

  async markDirectConversationRead(conversationId: string, userId: string, readAt: Date, messageId: string): Promise<boolean> {
    const conversation = this.directConversations.get(conversationId);
    if (!conversation) return false;
    if (conversation.userAId === userId && (conversation.userAReadAt < readAt || (conversation.userAReadAt.getTime() === readAt.getTime() && (conversation.userAReadMessageId === null || messageId.localeCompare(conversation.userAReadMessageId) > 0)))) {
      conversation.userAReadAt = readAt;
      conversation.userAReadMessageId = messageId;
    } else if (conversation.userBId === userId && (conversation.userBReadAt < readAt || (conversation.userBReadAt.getTime() === readAt.getTime() && (conversation.userBReadMessageId === null || messageId.localeCompare(conversation.userBReadMessageId) > 0)))) {
      conversation.userBReadAt = readAt;
      conversation.userBReadMessageId = messageId;
    } else if (conversation.userAId !== userId && conversation.userBId !== userId) return false;
    return true;
  }

  async listDirectMessageAttachments(messageIds: string[]): Promise<DirectMessageAttachmentMetadata[]> {
    const allowed = new Set(messageIds);
    return [...this.directMessageAttachments.values()].filter((attachment) => allowed.has(attachment.messageId)).map((attachment) => structuredClone({ id: attachment.id, messageId: attachment.messageId, uploaderUserId: attachment.uploaderUserId, fileName: attachment.fileName, mimeType: attachment.mimeType, size: attachment.size, createdAt: attachment.createdAt }));
  }

  async findDirectMessageAttachment(id: string): Promise<DirectMessageAttachmentRecord | null> {
    const attachment = this.directMessageAttachments.get(id);
    return attachment ? structuredClone(attachment) : null;
  }

  async createDirectMessageAttachment(attachment: DirectMessageAttachmentRecord): Promise<void> {
    this.directMessageAttachments.set(attachment.id, structuredClone(attachment));
  }

  async deleteDirectMessageAttachment(id: string): Promise<boolean> {
    return this.directMessageAttachments.delete(id);
  }

  async listMessageNotifications(userId: string, since: Date, afterId: string | null, limit: number): Promise<MessageNotificationRecord[]> {
    return [...this.textMessages.values()]
      .filter((message) => message.authorUserId !== userId && (message.createdAt > since || (message.createdAt.getTime() === since.getTime() && (afterId === null || message.id.localeCompare(afterId) > 0))))
      .map((message): MessageNotificationRecord | null => {
        const channel = this.serverChannels.get(message.channelId);
        const author = this.users.get(message.authorUserId);
        if (!channel || channel.type !== 'text' || !author || !this.serverMembers.has(`${channel.serverId}:${userId}`)) return null;
        const server = this.servers.get(channel.serverId);
        if (!server) return null;
        return {
          id: message.id,
          serverId: server.id,
          serverName: server.name,
          channelId: channel.id,
          channelName: channel.name,
          authorUserId: author.id,
          authorDisplayName: author.displayName,
          content: message.content,
          createdAt: message.createdAt,
        };
      })
      .filter((notification): notification is MessageNotificationRecord => notification !== null)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id))
      .slice(0, limit)
      .map((notification) => structuredClone(notification));
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
