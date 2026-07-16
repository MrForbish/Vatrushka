import { randomBytes, randomUUID } from 'node:crypto';

import { errors as joseErrors } from 'jose';
import { TrackSource } from 'livekit-server-sdk';

import {
  type AuthResponse,
  type ApiErrorCode,
  type PasswordLoginChallenge,
  type PublicRoom,
  type PublicUser,
  type RoomConnection,
  type ServerChannel,
  type ServerDetail,
  type ServerMember,
  type ServerPermission,
  type ServerRole,
  type ServerSummary,
  type TextMessage,
  type TwoFactorSetup,
  serverPermissions,
  expiresAt,
  generateRoomCode,
  isExpired,
} from '@vatrushka/shared';

import { AppError } from './app-error.js';
import type { AppConfig } from './config.js';
import type { AuthCodeRecord, GuestSessionRecord, MessageReactionSummary, RoomRecord, ServerChannelRecord, ServerRecord, ServerRoleRecord, SessionRecord, TextMessageWithAuthor, UserRecord } from './domain.js';
import type { DataStore, Mailer, MediaService } from './ports.js';
import {
  hashOpaqueToken,
  hashOtp,
  hashPassword,
  decryptCredential,
  encryptCredential,
  issueAccessToken,
  randomOpaqueToken,
  randomOtp,
  randomTotpSecret,
  safeHashEqual,
  totpUri,
  verifyAccessToken,
  verifyPassword,
  verifyTotp,
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
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    platformRole: user.platformRole,
    hasPassword: Boolean(user.passwordHash),
    twoFactorEnabled: user.twoFactorEnabled,
  };
}

const DEFAULT_SERVER_PERMISSIONS: ServerPermission[] = [
  'VIEW_SERVER',
  'VIEW_CHANNEL',
  'SEND_MESSAGES',
  'CONNECT_VOICE',
  'SPEAK',
  'STREAM',
  'CREATE_INVITES',
];

const SERVER_INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateServerInviteCode(): string {
  const bytes = randomBytes(8);
  return [...bytes].map((byte) => SERVER_INVITE_ALPHABET[byte % SERVER_INVITE_ALPHABET.length]).join('');
}

function publicServerRole(role: ServerRoleRecord): ServerRole {
  return { id: role.id, serverId: role.serverId, name: role.name, color: role.color, position: role.position, isDefault: role.isDefault, permissions: role.permissions };
}

function publicServerChannel(channel: ServerChannelRecord): ServerChannel {
  return { id: channel.id, serverId: channel.serverId, name: channel.name, type: channel.type, position: channel.position };
}

function publicTextMessage(message: TextMessageWithAuthor, replyTo: TextMessageWithAuthor | null, reactions: MessageReactionSummary[]): TextMessage {
  return {
    id: message.id,
    channelId: message.channelId,
    authorUserId: message.authorUserId,
    authorDisplayName: message.displayName ?? 'Участник',
    authorPlatformRole: message.platformRole,
    content: message.content,
    replyTo: replyTo === null ? null : { messageId: replyTo.id, authorUserId: replyTo.authorUserId, authorDisplayName: replyTo.displayName ?? 'Участник', content: replyTo.content },
    reactions: reactions.map(({ emoji, count, reactedByCurrentUser }) => ({ emoji, count, reactedByCurrentUser })),
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
  };
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
    const user = await this.store.findUserByEmail(email);
    if (user?.passwordHash) throw new AppError('PASSWORD_REQUIRED', 409);
    return this.issueEmailCode(email, 'login');
  }

  async verifyCode(email: string, code: string, deviceName: string): Promise<AuthResponse> {
    const now = this.now();
    await this.consumeEmailCode(email, code, 'login', 'INVALID_OTP');

    const created = await this.store.getOrCreateUser(email, now);
    const user = email === this.config.PLATFORM_OWNER_EMAIL && created.user.platformRole !== 'owner'
      ? (await this.store.setPlatformRoleByEmail(email, 'owner', now)) ?? created.user
      : created.user;
    const tokens = await this.createSessionTokens(user, deviceName, now);
    return { ...tokens, user: publicUser(user), isNewUser: created.isNewUser };
  }

  async requestRegistration(email: string, password: string): Promise<{ status: 'CODE_SENT'; retryAfterSeconds: number }> {
    if (await this.store.findUserByEmail(email)) throw new AppError('ACCOUNT_EXISTS', 409);
    return this.issueEmailCode(email, 'registration', await hashPassword(password));
  }

  async verifyRegistration(email: string, code: string, deviceName: string): Promise<AuthResponse> {
    const now = this.now();
    const authCode = await this.consumeEmailCode(email, code, 'registration', 'INVALID_OTP');
    if (!authCode.credentialHash) throw new AppError('INVALID_OTP', 401);
    let user = await this.store.createUserWithPassword(email, authCode.credentialHash, now);
    if (!user) throw new AppError('ACCOUNT_EXISTS', 409);
    user = await this.promotePlatformOwner(user, now);
    const tokens = await this.createSessionTokens(user, deviceName, now);
    return { ...tokens, user: publicUser(user), isNewUser: true };
  }

  async beginPasswordLogin(email: string, password: string, requestedFactor: 'auto' | 'email' | 'totp'): Promise<PasswordLoginChallenge> {
    const user = await this.requireValidPassword(email, password);
    const factor = requestedFactor === 'auto' ? (user.twoFactorEnabled ? 'totp' : 'email') : requestedFactor;
    if (factor === 'totp') {
      if (!user.twoFactorEnabled || !user.totpSecretEncrypted) throw new AppError('TWO_FACTOR_NOT_CONFIGURED', 409);
      return { status: 'SECOND_FACTOR_REQUIRED', factor, retryAfterSeconds: 0 };
    }
    const result = await this.issueEmailCode(email, 'password_login');
    return { status: 'SECOND_FACTOR_REQUIRED', factor, retryAfterSeconds: result.retryAfterSeconds };
  }

  async completePasswordLogin(email: string, password: string, code: string, factor: 'email' | 'totp', deviceName: string): Promise<AuthResponse> {
    const user = await this.requireValidPassword(email, password);
    if (factor === 'email') {
      await this.consumeEmailCode(email, code, 'password_login', 'INVALID_SECOND_FACTOR');
    } else {
      if (!user.twoFactorEnabled || !user.totpSecretEncrypted) throw new AppError('TWO_FACTOR_NOT_CONFIGURED', 409);
      let secret: string;
      try {
        secret = decryptCredential(user.totpSecretEncrypted, this.config.CREDENTIAL_ENCRYPTION_KEY);
      } catch {
        throw new AppError('INTERNAL_ERROR', 500);
      }
      if (!verifyTotp(secret, code, this.now().getTime())) throw new AppError('INVALID_SECOND_FACTOR', 401);
    }
    const promoted = await this.promotePlatformOwner(user, this.now());
    const tokens = await this.createSessionTokens(promoted, deviceName, this.now());
    return { ...tokens, user: publicUser(promoted), isNewUser: false };
  }

  async requestPasswordSetup(authorization: string | undefined): Promise<{ status: 'CODE_SENT'; retryAfterSeconds: number }> {
    const user = await this.authenticate(authorization);
    return this.issueEmailCode(user.email, 'password_setup');
  }

  async setPassword(authorization: string | undefined, code: string, password: string): Promise<PublicUser> {
    const user = await this.authenticate(authorization);
    await this.consumeEmailCode(user.email, code, 'password_setup', 'INVALID_SECOND_FACTOR');
    const updated = await this.store.updatePassword(user.id, await hashPassword(password), this.now());
    if (!updated) throw new AppError('UNAUTHORIZED', 401);
    return publicUser(updated);
  }

  async beginTwoFactorSetup(authorization: string | undefined): Promise<TwoFactorSetup> {
    const user = await this.authenticate(authorization);
    if (!user.passwordHash) throw new AppError('PASSWORD_REQUIRED', 409);
    const secret = randomTotpSecret();
    const updated = await this.store.updateTwoFactor(
      user.id,
      encryptCredential(secret, this.config.CREDENTIAL_ENCRYPTION_KEY),
      false,
      this.now(),
    );
    if (!updated) throw new AppError('UNAUTHORIZED', 401);
    return { secret, otpauthUri: totpUri(secret, user.email, this.config.APP_NAME) };
  }

  async enableTwoFactor(authorization: string | undefined, code: string): Promise<PublicUser> {
    const user = await this.authenticate(authorization);
    if (!user.totpSecretEncrypted) throw new AppError('TWO_FACTOR_NOT_CONFIGURED', 409);
    const secret = decryptCredential(user.totpSecretEncrypted, this.config.CREDENTIAL_ENCRYPTION_KEY);
    if (!verifyTotp(secret, code, this.now().getTime())) throw new AppError('INVALID_SECOND_FACTOR', 401);
    const updated = await this.store.updateTwoFactor(user.id, user.totpSecretEncrypted, true, this.now());
    if (!updated) throw new AppError('UNAUTHORIZED', 401);
    return publicUser(updated);
  }

  async disableTwoFactor(authorization: string | undefined, code: string): Promise<PublicUser> {
    const user = await this.authenticate(authorization);
    if (!user.twoFactorEnabled || !user.totpSecretEncrypted) throw new AppError('TWO_FACTOR_NOT_CONFIGURED', 409);
    const secret = decryptCredential(user.totpSecretEncrypted, this.config.CREDENTIAL_ENCRYPTION_KEY);
    if (!verifyTotp(secret, code, this.now().getTime())) throw new AppError('INVALID_SECOND_FACTOR', 401);
    const updated = await this.store.updateTwoFactor(user.id, null, false, this.now());
    if (!updated) throw new AppError('UNAUTHORIZED', 401);
    return publicUser(updated);
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

  async listServers(authorization: string | undefined): Promise<ServerSummary[]> {
    const user = await this.authenticate(authorization);
    return (await this.store.listServersForUser(user.id)).map((server) => ({
      id: server.id,
      name: server.name,
      inviteCode: server.inviteCode,
      ownerUserId: server.ownerUserId,
      memberCount: server.memberCount,
      createdAt: server.createdAt.toISOString(),
    }));
  }

  async createServer(authorization: string | undefined, name: string): Promise<ServerDetail> {
    const user = await this.authenticate(authorization);
    this.requireCompleteProfile(user);
    const now = this.now();
    let server: ServerRecord | null = null;
    for (let attempt = 0; attempt < 10 && !server; attempt += 1) {
      const candidate: ServerRecord = { id: randomUUID(), name, inviteCode: generateServerInviteCode(), ownerUserId: user.id, createdAt: now, updatedAt: now };
      const everyone: ServerRoleRecord = {
        id: randomUUID(), serverId: candidate.id, name: '@everyone', color: '#8d7a72', position: 0, isDefault: true,
        permissions: DEFAULT_SERVER_PERMISSIONS, createdAt: now, updatedAt: now,
      };
      const ownerRole: ServerRoleRecord = {
        id: randomUUID(), serverId: candidate.id, name: 'Владелец', color: '#e38b54', position: 100, isDefault: false,
        permissions: [...serverPermissions], createdAt: now, updatedAt: now,
      };
      const textChannel: ServerChannelRecord = {
        id: randomUUID(), serverId: candidate.id, name: 'общий', type: 'text', position: 0, livekitRoomName: null, createdAt: now, updatedAt: now,
      };
      const voiceChannel: ServerChannelRecord = {
        id: randomUUID(), serverId: candidate.id, name: 'Голосовой', type: 'voice', position: 1, livekitRoomName: `channel_${randomUUID()}`, createdAt: now, updatedAt: now,
      };
      if (await this.store.createServerGraph({
        server: candidate,
        members: [{ serverId: candidate.id, userId: user.id, joinedAt: now }],
        roles: [everyone, ownerRole],
        memberRoles: [{ serverId: candidate.id, userId: user.id, roleId: ownerRole.id }],
        channels: [textChannel, voiceChannel],
      })) server = candidate;
    }
    if (!server) throw new AppError('INTERNAL_ERROR', 500);
    return this.getServerDetailForUser(server, user);
  }

  async joinServer(authorization: string | undefined, inviteCode: string): Promise<ServerDetail> {
    const user = await this.authenticate(authorization);
    this.requireCompleteProfile(user);
    const server = await this.store.findServerByInviteCode(inviteCode);
    if (!server) throw new AppError('SERVER_NOT_FOUND', 404);
    if (await this.store.findServerMember(server.id, user.id)) throw new AppError('ALREADY_SERVER_MEMBER', 409);
    await this.store.addServerMember({ serverId: server.id, userId: user.id, joinedAt: this.now() });
    return this.getServerDetailForUser(server, user);
  }

  async getServer(authorization: string | undefined, serverId: string): Promise<ServerDetail> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    return this.getServerDetailForUser(server, user);
  }

  async createServerChannel(authorization: string | undefined, serverId: string, name: string, type: 'text' | 'voice'): Promise<ServerChannel> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, 'MANAGE_CHANNELS');
    const channels = await this.store.listServerChannels(server.id);
    const now = this.now();
    const channel: ServerChannelRecord = {
      id: randomUUID(), serverId: server.id, name, type, position: Math.max(-1, ...channels.map((current) => current.position)) + 1,
      livekitRoomName: type === 'voice' ? `channel_${randomUUID()}` : null, createdAt: now, updatedAt: now,
    };
    await this.store.createServerChannel(channel);
    return publicServerChannel(channel);
  }

  async deleteServerChannel(authorization: string | undefined, channelId: string): Promise<void> {
    const user = await this.authenticate(authorization);
    const channel = await this.requireServerChannel(channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireServerPermission(server, user, 'MANAGE_CHANNELS');
    if (!(await this.store.deleteServerChannel(channel.id))) throw new AppError('CHANNEL_NOT_FOUND', 404);
    if (channel.livekitRoomName) {
      try { await this.media.deleteRoom(channel.livekitRoomName); } catch { /* The database deletion is authoritative. */ }
    }
  }

  async createServerRole(authorization: string | undefined, serverId: string, name: string, color: string, permissions: ServerPermission[]): Promise<ServerRole> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    const actorPermissions = await this.requireServerPermission(server, user, 'MANAGE_ROLES');
    if (permissions.some((permission) => !actorPermissions.has(permission))) throw new AppError('SERVER_PERMISSION_DENIED', 403);
    const roles = await this.store.listServerRoles(server.id);
    const actorTopPosition = await this.serverRolePositionFor(server, user, roles);
    const now = this.now();
    const role: ServerRoleRecord = {
      id: randomUUID(), serverId: server.id, name, color, permissions, isDefault: false,
      position: Number.isFinite(actorTopPosition)
        ? Math.max(1, Math.min(actorTopPosition - 1, Math.max(0, ...roles.filter((current) => current.position < actorTopPosition).map((current) => current.position)) + 1))
        : Math.min(99, Math.max(0, ...roles.filter((current) => current.name !== 'Владелец').map((current) => current.position)) + 1),
      createdAt: now, updatedAt: now,
    };
    await this.store.createServerRole(role);
    return publicServerRole(role);
  }

  async updateServerRole(authorization: string | undefined, serverId: string, roleId: string, values: { name?: string | undefined; color?: string | undefined; permissions?: ServerPermission[] | undefined }): Promise<ServerRole> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    const actorPermissions = await this.requireServerPermission(server, user, 'MANAGE_ROLES');
    if (values.permissions?.some((permission) => !actorPermissions.has(permission))) throw new AppError('SERVER_PERMISSION_DENIED', 403);
    const roles = await this.store.listServerRoles(server.id);
    const role = roles.find((candidate) => candidate.id === roleId);
    if (!role) throw new AppError('ROLE_NOT_FOUND', 404);
    if (role.name === 'Владелец') throw new AppError('SERVER_PERMISSION_DENIED', 403);
    if (role.position >= await this.serverRolePositionFor(server, user, roles)) throw new AppError('SERVER_PERMISSION_DENIED', 403);
    const changes: Partial<Pick<ServerRoleRecord, 'name' | 'color' | 'permissions'>> = {};
    if (values.name !== undefined) changes.name = values.name;
    if (values.color !== undefined) changes.color = values.color;
    if (values.permissions !== undefined) changes.permissions = values.permissions;
    const updated = await this.store.updateServerRole(role.id, changes, this.now());
    if (!updated) throw new AppError('ROLE_NOT_FOUND', 404);
    return publicServerRole(updated);
  }

  async assignServerMemberRoles(authorization: string | undefined, serverId: string, memberUserId: string, roleIds: string[]): Promise<void> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, 'MANAGE_ROLES');
    if (!(await this.store.findServerMember(server.id, memberUserId))) throw new AppError('SERVER_NOT_FOUND', 404);
    const roles = await this.store.listServerRoles(server.id);
    const actorTopPosition = await this.serverRolePositionFor(server, user, roles);
    const targetRoleIds = new Set(await this.store.listMemberRoleIds(server.id, memberUserId));
    const targetTopPosition = Math.max(0, ...roles.filter((role) => targetRoleIds.has(role.id)).map((role) => role.position));
    if (targetTopPosition >= actorTopPosition) throw new AppError('SERVER_PERMISSION_DENIED', 403);
    const assignable = new Set(roles.filter((role) => !role.isDefault && role.name !== 'Владелец' && role.position < actorTopPosition).map((role) => role.id));
    if (roleIds.some((roleId) => !assignable.has(roleId))) throw new AppError('ROLE_NOT_FOUND', 404);
    await this.store.assignMemberRoles(server.id, memberUserId, [...new Set(roleIds)]);
  }

  async kickServerMember(authorization: string | undefined, serverId: string, memberUserId: string): Promise<void> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, 'KICK_MEMBERS');
    if (memberUserId === server.ownerUserId || memberUserId === user.id) throw new AppError('SERVER_PERMISSION_DENIED', 403);
    const [roles, targetUser] = await Promise.all([this.store.listServerRoles(server.id), this.store.findUserById(memberUserId)]);
    if (!targetUser) throw new AppError('SERVER_NOT_FOUND', 404);
    if (targetUser.platformRole !== 'member' && user.platformRole === 'member') throw new AppError('SERVER_PERMISSION_DENIED', 403);
    const actorTopPosition = await this.serverRolePositionFor(server, user, roles);
    const targetRoleIds = new Set(await this.store.listMemberRoleIds(server.id, memberUserId));
    const targetTopPosition = Math.max(0, ...roles.filter((role) => targetRoleIds.has(role.id)).map((role) => role.position));
    if (targetTopPosition >= actorTopPosition) throw new AppError('SERVER_PERMISSION_DENIED', 403);
    if (!(await this.store.removeServerMember(server.id, memberUserId))) throw new AppError('SERVER_NOT_FOUND', 404);
    try {
      const channels = await this.store.listServerChannels(server.id);
      for (const channel of channels) {
        if (!channel.livekitRoomName) continue;
        const identities = await this.media.participantIdentities(channel.livekitRoomName);
        for (const identity of identities.filter((candidate) => candidate.startsWith(`user_${memberUserId}_`))) {
          await this.media.removeParticipant(channel.livekitRoomName, identity);
          await this.store.releaseChannelLeaseByParticipant(identity);
        }
      }
    } catch {
      // Membership removal remains authoritative even if a stale media session cannot be disconnected immediately.
    }
  }

  async listMessages(authorization: string | undefined, channelId: string, before: string | undefined, limit: number): Promise<TextMessage[]> {
    const user = await this.authenticate(authorization);
    const channel = await this.requireTextChannel(channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireServerPermission(server, user, 'VIEW_CHANNEL');
    return this.hydrateMessages(await this.store.listTextMessages(channel.id, before ? new Date(before) : null, limit), user.id);
  }

  async createMessage(authorization: string | undefined, channelId: string, content: string, replyToMessageId: string | null): Promise<TextMessage> {
    const user = await this.authenticate(authorization);
    this.requireCompleteProfile(user);
    const channel = await this.requireTextChannel(channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireServerPermission(server, user, 'SEND_MESSAGES');
    if (replyToMessageId !== null) {
      const replyTarget = await this.store.findTextMessage(replyToMessageId);
      if (!replyTarget || replyTarget.channelId !== channel.id) throw new AppError('MESSAGE_NOT_FOUND', 404);
    }
    const now = this.now();
    const message = { id: randomUUID(), channelId: channel.id, authorUserId: user.id, content, replyToMessageId, createdAt: now, editedAt: null };
    await this.store.createTextMessage(message);
    return (await this.hydrateMessages([{ ...message, displayName: user.displayName, platformRole: user.platformRole }], user.id))[0]!;
  }

  async updateMessage(authorization: string | undefined, messageId: string, content: string): Promise<TextMessage> {
    const user = await this.authenticate(authorization);
    const message = await this.store.findTextMessage(messageId);
    if (!message) throw new AppError('MESSAGE_NOT_FOUND', 404);
    const channel = await this.requireTextChannel(message.channelId);
    const server = await this.requireServer(channel.serverId);
    if (message.authorUserId !== user.id) await this.requireServerPermission(server, user, 'MANAGE_MESSAGES');
    const updated = await this.store.updateTextMessage(message.id, content, this.now());
    if (!updated) throw new AppError('MESSAGE_NOT_FOUND', 404);
    const author = await this.store.findUserById(updated.authorUserId);
    if (!author) throw new AppError('MESSAGE_NOT_FOUND', 404);
    return (await this.hydrateMessages([{ ...updated, displayName: author.displayName, platformRole: author.platformRole }], user.id))[0]!;
  }

  async setMessageReaction(authorization: string | undefined, messageId: string, emoji: string, active: boolean): Promise<TextMessage> {
    const user = await this.authenticate(authorization);
    const message = await this.store.findTextMessage(messageId);
    if (!message) throw new AppError('MESSAGE_NOT_FOUND', 404);
    const channel = await this.requireTextChannel(message.channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireServerPermission(server, user, 'SEND_MESSAGES');
    if (active) await this.store.addMessageReaction({ messageId: message.id, userId: user.id, emoji, createdAt: this.now() });
    else await this.store.removeMessageReaction(message.id, user.id, emoji);
    const [withAuthor] = await this.store.findTextMessagesWithAuthors([message.id]);
    if (!withAuthor) throw new AppError('MESSAGE_NOT_FOUND', 404);
    return (await this.hydrateMessages([withAuthor], user.id))[0]!;
  }

  async deleteMessage(authorization: string | undefined, messageId: string): Promise<void> {
    const user = await this.authenticate(authorization);
    const message = await this.store.findTextMessage(messageId);
    if (!message) throw new AppError('MESSAGE_NOT_FOUND', 404);
    const channel = await this.requireTextChannel(message.channelId);
    const server = await this.requireServer(channel.serverId);
    if (message.authorUserId !== user.id) await this.requireServerPermission(server, user, 'MANAGE_MESSAGES');
    await this.store.deleteTextMessage(message.id);
  }

  private async hydrateMessages(messages: TextMessageWithAuthor[], currentUserId: string): Promise<TextMessage[]> {
    const replyIds = [...new Set(messages.map((message) => message.replyToMessageId).filter((id): id is string => id !== null))];
    const replies = new Map((await this.store.findTextMessagesWithAuthors(replyIds)).map((message) => [message.id, message]));
    const reactions = await this.store.listMessageReactionSummaries(messages.map((message) => message.id), currentUserId);
    const byMessage = new Map<string, MessageReactionSummary[]>();
    for (const reaction of reactions) byMessage.set(reaction.messageId, [...(byMessage.get(reaction.messageId) ?? []), reaction]);
    return messages.map((message) => publicTextMessage(message, message.replyToMessageId === null ? null : replies.get(message.replyToMessageId) ?? null, byMessage.get(message.id) ?? []));
  }

  async connectVoiceChannel(authorization: string | undefined, channelId: string): Promise<RoomConnection> {
    const user = await this.authenticate(authorization);
    this.requireCompleteProfile(user);
    const channel = await this.requireVoiceChannel(channelId);
    const server = await this.requireServer(channel.serverId);
    const permissions = await this.requireServerPermission(server, user, 'CONNECT_VOICE');
    if (!channel.livekitRoomName) throw new AppError('CHANNEL_NOT_FOUND', 404);
    try {
      await this.media.createRoom({ id: channel.id, ownerUserId: server.ownerUserId, name: channel.livekitRoomName, maxParticipants: 25 });
      const identity = `user_${user.id}_${randomOpaqueToken(6)}`;
      const token = await this.media.issueToken({
        roomName: channel.livekitRoomName,
        identity,
        displayName: user.displayName,
        metadata: { serverId: server.id, channelId: channel.id, kind: 'user', platformRole: user.platformRole },
        canPublishMicrophone: permissions.has('SPEAK'),
        canPublishScreen: permissions.has('STREAM'),
      });
      return {
        roomId: channel.id,
        ownerUserId: server.ownerUserId,
        code: server.inviteCode,
        livekitUrl: this.config.LIVEKIT_URL,
        livekitToken: token,
        participantIdentity: identity,
        participantDisplayName: user.displayName,
        isOwner: permissions.has('MUTE_MEMBERS'),
        contextType: 'channel',
        serverId: server.id,
        channelId: channel.id,
        canSpeak: permissions.has('SPEAK'),
        canStream: permissions.has('STREAM'),
      };
    } catch {
      throw new AppError('LIVEKIT_UNAVAILABLE', 503);
    }
  }

  async kickChannelParticipant(authorization: string | undefined, channelId: string, participantIdentity: string): Promise<void> {
    const user = await this.authenticate(authorization);
    const channel = await this.requireVoiceChannel(channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireServerPermission(server, user, 'MUTE_MEMBERS');
    if (participantIdentity.startsWith(`user_${user.id}_`)) throw new AppError('SERVER_PERMISSION_DENIED', 403);
    try {
      if (!channel.livekitRoomName || !(await this.media.participantExists(channel.livekitRoomName, participantIdentity))) throw new AppError('PARTICIPANT_NOT_FOUND', 404);
      await this.media.removeParticipant(channel.livekitRoomName, participantIdentity);
      await this.store.releaseChannelLeaseByParticipant(participantIdentity);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('LIVEKIT_UNAVAILABLE', 503);
    }
  }

  async claimChannelScreenShare(authorization: string | undefined, channelId: string, participantIdentity: string): Promise<{ expiresAt: string }> {
    const { channel, displayName } = await this.validateChannelMediaParticipant(authorization, channelId, participantIdentity, 'STREAM');
    const result = await this.store.claimChannelLease(channel.id, participantIdentity, displayName, this.now(), this.config.SCREEN_SHARE_LEASE_SECONDS);
    if (result.status === 'busy') throw new AppError('SCREEN_SHARE_BUSY', 409, undefined, { participantDisplayName: result.lease.participantDisplayName });
    return { expiresAt: result.lease.expiresAt.toISOString() };
  }

  async heartbeatChannelScreenShare(authorization: string | undefined, channelId: string, participantIdentity: string): Promise<{ expiresAt: string }> {
    await this.validateChannelMediaParticipant(authorization, channelId, participantIdentity, 'STREAM');
    const lease = await this.store.heartbeatChannelLease(channelId, participantIdentity, this.now(), this.config.SCREEN_SHARE_LEASE_SECONDS);
    if (!lease) throw new AppError('SCREEN_SHARE_BUSY', 409, 'Право на демонстрацию экрана утрачено');
    return { expiresAt: lease.expiresAt.toISOString() };
  }

  async releaseChannelScreenShare(authorization: string | undefined, channelId: string, participantIdentity: string): Promise<void> {
    const user = await this.authenticate(authorization);
    const channel = await this.requireVoiceChannel(channelId);
    await this.requireServerPermission(await this.requireServer(channel.serverId), user, 'STREAM');
    if (!participantIdentity.startsWith(`user_${user.id}_`)) throw new AppError('UNAUTHORIZED', 401);
    await this.store.releaseChannelLease(channelId, participantIdentity);
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
      await this.store.releaseChannelLeaseByParticipant(identity);
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

  private async issueEmailCode(
    email: string,
    purpose: AuthCodeRecord['purpose'],
    credentialHash: string | null = null,
  ): Promise<{ status: 'CODE_SENT'; retryAfterSeconds: number }> {
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
      purpose,
      credentialHash,
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

  private async consumeEmailCode(
    email: string,
    code: string,
    purpose: AuthCodeRecord['purpose'],
    invalidCode: Extract<ApiErrorCode, 'INVALID_OTP' | 'INVALID_SECOND_FACTOR'>,
  ): Promise<AuthCodeRecord> {
    const now = this.now();
    const authCode = await this.store.findLatestAuthCodeForPurpose(email, purpose);
    if (!authCode || authCode.consumedAt) throw new AppError(invalidCode, 401);
    if (isExpired(authCode.expiresAt, now)) throw new AppError('OTP_EXPIRED', 401);
    if (authCode.attempts >= 5) throw new AppError('OTP_ATTEMPTS_EXCEEDED', 429);
    const actualHash = hashOtp(email, code, this.config.OTP_PEPPER);
    if (!safeHashEqual(authCode.codeHash, actualHash)) {
      const attempts = await this.store.incrementAuthCodeAttempts(authCode.id);
      if (attempts >= 5) throw new AppError('OTP_ATTEMPTS_EXCEEDED', 429);
      throw new AppError(invalidCode, 401);
    }
    if (!(await this.store.consumeAuthCode(authCode.id, now))) throw new AppError(invalidCode, 401);
    return authCode;
  }

  private async requireValidPassword(email: string, password: string): Promise<UserRecord> {
    const user = await this.store.findUserByEmail(email);
    if (!user?.passwordHash) {
      await hashPassword(password);
      throw new AppError('INVALID_CREDENTIALS', 401);
    }
    if (!(await verifyPassword(password, user.passwordHash))) throw new AppError('INVALID_CREDENTIALS', 401);
    return user;
  }

  private async promotePlatformOwner(user: UserRecord, now: Date): Promise<UserRecord> {
    if (user.email !== this.config.PLATFORM_OWNER_EMAIL || user.platformRole === 'owner') return user;
    return (await this.store.setPlatformRoleByEmail(user.email, 'owner', now)) ?? user;
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
      livekitToken: await this.issueMediaToken(room, identity, displayName, 'user', user.platformRole),
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
    platformRole: UserRecord['platformRole'] = 'member',
  ): Promise<string> {
    try {
      return await this.media.issueToken({
        roomName: room.livekitRoomName,
        identity,
        displayName,
        metadata: { appRoomId: room.id, kind, platformRole },
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

  private async requireServer(id: string): Promise<ServerRecord> {
    const server = await this.store.findServerById(id);
    if (!server) throw new AppError('SERVER_NOT_FOUND', 404);
    return server;
  }

  private async requireServerChannel(id: string): Promise<ServerChannelRecord> {
    const channel = await this.store.findServerChannel(id);
    if (!channel) throw new AppError('CHANNEL_NOT_FOUND', 404);
    return channel;
  }

  private async requireTextChannel(id: string): Promise<ServerChannelRecord> {
    const channel = await this.requireServerChannel(id);
    if (channel.type !== 'text') throw new AppError('CHANNEL_NOT_FOUND', 404);
    return channel;
  }

  private async requireVoiceChannel(id: string): Promise<ServerChannelRecord> {
    const channel = await this.requireServerChannel(id);
    if (channel.type !== 'voice') throw new AppError('CHANNEL_NOT_FOUND', 404);
    return channel;
  }

  private async serverPermissionsFor(server: ServerRecord, user: UserRecord): Promise<Set<ServerPermission>> {
    if (server.ownerUserId === user.id || user.platformRole === 'owner' || user.platformRole === 'admin') return new Set(serverPermissions);
    if (!(await this.store.findServerMember(server.id, user.id))) return new Set();
    const [roles, roleIds] = await Promise.all([this.store.listServerRoles(server.id), this.store.listMemberRoleIds(server.id, user.id)]);
    const assigned = new Set(roleIds);
    return new Set(roles.filter((role) => role.isDefault || assigned.has(role.id)).flatMap((role) => role.permissions));
  }

  private async serverRolePositionFor(server: ServerRecord, user: UserRecord, roles: ServerRoleRecord[]): Promise<number> {
    if (server.ownerUserId === user.id || user.platformRole === 'owner' || user.platformRole === 'admin') return Number.POSITIVE_INFINITY;
    const assigned = new Set(await this.store.listMemberRoleIds(server.id, user.id));
    return Math.max(0, ...roles.filter((role) => role.isDefault || assigned.has(role.id)).map((role) => role.position));
  }

  private async requireServerPermission(server: ServerRecord, user: UserRecord, permission: ServerPermission): Promise<Set<ServerPermission>> {
    const permissions = await this.serverPermissionsFor(server, user);
    if (!permissions.has(permission)) throw new AppError('SERVER_PERMISSION_DENIED', 403);
    return permissions;
  }

  private async getServerDetailForUser(server: ServerRecord, user: UserRecord): Promise<ServerDetail> {
    const permissions = await this.requireServerPermission(server, user, 'VIEW_SERVER');
    const [channels, roles, members, assignments] = await Promise.all([
      this.store.listServerChannels(server.id),
      this.store.listServerRoles(server.id),
      this.store.listServerMembers(server.id),
      this.store.listAllMemberRoles(server.id),
    ]);
    const publicRoles = roles.map(publicServerRole);
    const roleById = new Map(publicRoles.map((role) => [role.id, role]));
    const defaultRoles = publicRoles.filter((role) => role.isDefault);
    const publicMembers: ServerMember[] = members.map((member) => ({
      userId: member.userId,
      displayName: member.displayName ?? 'Участник',
      platformRole: member.platformRole,
      joinedAt: member.joinedAt.toISOString(),
      roles: [
        ...defaultRoles,
        ...assignments.filter((assignment) => assignment.userId === member.userId).map((assignment) => roleById.get(assignment.roleId)).filter((role): role is ServerRole => Boolean(role)),
      ],
    }));
    return {
      id: server.id,
      name: server.name,
      inviteCode: server.inviteCode,
      ownerUserId: server.ownerUserId,
      memberCount: members.length,
      createdAt: server.createdAt.toISOString(),
      channels: channels.map(publicServerChannel),
      roles: publicRoles,
      members: publicMembers,
      permissions: [...permissions],
    };
  }

  private async validateChannelMediaParticipant(
    authorization: string | undefined,
    channelId: string,
    participantIdentity: string,
    permission: ServerPermission,
  ): Promise<{ channel: ServerChannelRecord; displayName: string; user: UserRecord }> {
    const user = await this.authenticate(authorization);
    this.requireCompleteProfile(user);
    const channel = await this.requireVoiceChannel(channelId);
    await this.requireServerPermission(await this.requireServer(channel.serverId), user, permission);
    if (!participantIdentity.startsWith(`user_${user.id}_`)) throw new AppError('UNAUTHORIZED', 401);
    try {
      if (!channel.livekitRoomName || !(await this.media.participantExists(channel.livekitRoomName, participantIdentity))) throw new AppError('PARTICIPANT_NOT_FOUND', 404);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('LIVEKIT_UNAVAILABLE', 503);
    }
    return { channel, displayName: user.displayName, user };
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
