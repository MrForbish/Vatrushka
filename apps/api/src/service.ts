import { randomBytes, randomUUID } from 'node:crypto';

import { errors as joseErrors } from 'jose';
import { TrackSource } from 'livekit-server-sdk';

import {
  type AuthResponse,
  type ApiErrorCode,
  type PasswordLoginChallenge,
  type PublicUser,
  type RoomConnection,
  type ServerChannel,
  type ChannelPermissionOverwrite,
  type PermissionOverwriteTargetType,
  type ServerAuditLogEntry,
  type ServerDetail,
  type ServerMember,
  type ServerPermission,
  type ServerRole,
  type ServerSummary,
  type TextMessage,
  type VoiceChannelParticipant,
  type MessageNotification,
  type MessageNotificationPage,
  type DirectConversationSummary,
  type DirectMessage,
  type DirectMessageCandidate,
  type HomeActivityType,
  type HomeDashboardResponse,
  type SecurityEvent,
  type SecurityEventType,
  type TwoFactorSetup,
  type TwoFactorEnableResult,
  type UserSession,
  serverPermissions,
  highestRolePosition,
  resolveChannelPermissions,
  resolveServerPermissions,
  expiresAt,
  isExpired,
} from '@vatrushka/shared';

import { AppError } from './app-error.js';
import type { AppConfig } from './config.js';
import type { AuthCodeRecord, DirectConversationOverviewRecord, DirectConversationRecord, DirectMessageAttachmentMetadata, DirectMessageAttachmentRecord, DirectMessageWithAuthor, MessageAttachmentMetadata, MessageAttachmentRecord, MessageNotificationRecord, MessageReactionSummary, RecoveryCodeRecord, SecurityEventRecord, ServerChannelRecord, ServerRecord, ServerRoleRecord, SessionRecord, TextMessageWithAuthor, UserRecord } from './domain.js';
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

const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomRecoveryCode(): string {
  const bytes = randomBytes(12);
  const characters = [...bytes].map((byte) => RECOVERY_CODE_ALPHABET[byte % RECOVERY_CODE_ALPHABET.length]);
  return `${characters.slice(0, 4).join('')}-${characters.slice(4, 8).join('')}-${characters.slice(8, 12).join('')}`;
}

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
  'READ_MESSAGE_HISTORY',
  'SEND_MESSAGES',
  'SEND_ATTACHMENTS',
  'ADD_REACTIONS',
  'EMBED_LINKS',
  'MANAGE_OWN_MESSAGES',
  'CONNECT_VOICE',
  'SPEAK',
  'STREAM_SCREEN',
  'STREAM_APPLICATION_AUDIO',
  'MANAGE_INVITES',
];

function publicServerRole(role: ServerRoleRecord): ServerRole {
  return { id: role.id, serverId: role.serverId, name: role.name, color: role.color, position: role.position, isDefault: role.isDefault, kind: role.kind, permissions: role.permissions };
}

function publicServerChannel(channel: ServerChannelRecord, unreadCount = 0, permissions?: ServerPermission[], permissionOverwrites?: ChannelPermissionOverwrite[], voiceParticipants?: VoiceChannelParticipant[]): ServerChannel {
  return { id: channel.id, serverId: channel.serverId, name: channel.name, type: channel.type, position: channel.position, unreadCount, ...(voiceParticipants === undefined ? {} : { voiceParticipants }), ...(permissions === undefined ? {} : { permissions }), ...(permissionOverwrites === undefined ? {} : { permissionOverwrites }) };
}

export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 4;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'application/zip',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
]);

function safeAttachmentName(fileName: string): string {
  const normalized = fileName
    .normalize('NFKC')
    .replace(/[\\/]/gu, '_')
    .trim()
    .slice(0, 180);
  const printable = [...normalized].filter((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint >= 32 && codePoint !== 127;
  }).join('');
  return printable || 'attachment';
}

function publicTextMessage(message: TextMessageWithAuthor, replyTo: TextMessageWithAuthor | null, reactions: MessageReactionSummary[], attachments: MessageAttachmentMetadata[]): TextMessage {
  return {
    id: message.id,
    channelId: message.channelId,
    authorUserId: message.authorUserId,
    authorDisplayName: message.displayName ?? 'Участник',
    authorPlatformRole: message.platformRole,
    content: message.content,
    replyTo: replyTo === null ? null : { messageId: replyTo.id, authorUserId: replyTo.authorUserId, authorDisplayName: replyTo.displayName ?? 'Участник', content: replyTo.content },
    reactions: reactions.map(({ emoji, count, reactedByCurrentUser }) => ({ emoji, count, reactedByCurrentUser })),
    attachments: attachments.map(({ id, messageId, fileName, mimeType, size, createdAt }) => ({ id, messageId, fileName, mimeType, size, createdAt: createdAt.toISOString() })),
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
  };
}

function publicDirectMessage(message: DirectMessageWithAuthor, replyTo: DirectMessageWithAuthor | null, reactions: MessageReactionSummary[], attachments: DirectMessageAttachmentMetadata[]): DirectMessage {
  return {
    id: message.id,
    conversationId: message.conversationId,
    authorUserId: message.authorUserId,
    authorDisplayName: message.displayName ?? 'Участник',
    authorPlatformRole: message.platformRole,
    content: message.content,
    replyTo: replyTo === null ? null : { messageId: replyTo.id, authorUserId: replyTo.authorUserId, authorDisplayName: replyTo.displayName ?? 'Участник', content: replyTo.content },
    reactions: reactions.map(({ emoji, count, reactedByCurrentUser }) => ({ emoji, count, reactedByCurrentUser })),
    attachments: attachments.map(({ id, messageId, fileName, mimeType, size, createdAt }) => ({ id, messageId, fileName, mimeType, size, createdAt: createdAt.toISOString() })),
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
  };
}

function publicDirectConversation(overview: DirectConversationOverviewRecord): DirectConversationSummary {
  return {
    id: overview.conversation.id,
    participant: { userId: overview.participant.id, displayName: overview.participant.displayName ?? 'Участник', platformRole: overview.participant.platformRole },
    lastMessage: overview.lastMessage === null ? null : { ...overview.lastMessage, createdAt: overview.lastMessage.createdAt.toISOString() },
    unreadCount: overview.unreadCount,
    createdAt: overview.conversation.createdAt.toISOString(),
    updatedAt: overview.conversation.updatedAt.toISOString(),
  };
}

export class VatrushkaService {
  readonly config: AppConfig;
  readonly store: DataStore;
  readonly media: MediaService;
  private readonly mailer: Mailer;
  private readonly clock: () => Date;
  private readonly pendingVoiceMoves = new Map<string, { channelId: string; expiresAt: Date; seamlesslyMoved: boolean }>();

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

  inviteUrl(inviteToken: string): string {
    return new URL(`/i/${encodeURIComponent(inviteToken)}`, this.config.PUBLIC_INVITE_URL).toString();
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

  async beginPasswordLogin(email: string, password: string, requestedFactor: 'auto' | 'email' | 'totp' | 'recovery'): Promise<PasswordLoginChallenge> {
    const user = await this.requireValidPassword(email, password);
    const factor = requestedFactor === 'auto' ? (user.twoFactorEnabled ? 'totp' : 'email') : requestedFactor;
    if (factor === 'totp' || factor === 'recovery') {
      if (!user.twoFactorEnabled || !user.totpSecretEncrypted) throw new AppError('TWO_FACTOR_NOT_CONFIGURED', 409);
      return { status: 'SECOND_FACTOR_REQUIRED', factor, retryAfterSeconds: 0 };
    }
    const result = await this.issueEmailCode(email, 'password_login');
    return { status: 'SECOND_FACTOR_REQUIRED', factor, retryAfterSeconds: result.retryAfterSeconds };
  }

  async completePasswordLogin(email: string, password: string, code: string, factor: 'email' | 'totp' | 'recovery', deviceName: string): Promise<AuthResponse> {
    const user = await this.requireValidPassword(email, password);
    if (factor === 'email') {
      await this.consumeEmailCode(email, code, 'password_login', 'INVALID_SECOND_FACTOR');
    } else if (factor === 'totp') {
      if (!user.twoFactorEnabled || !user.totpSecretEncrypted) throw new AppError('TWO_FACTOR_NOT_CONFIGURED', 409);
      let secret: string;
      try {
        secret = decryptCredential(user.totpSecretEncrypted, this.config.CREDENTIAL_ENCRYPTION_KEY);
      } catch {
        throw new AppError('INTERNAL_ERROR', 500);
      }
      if (!verifyTotp(secret, code, this.now().getTime())) throw new AppError('INVALID_SECOND_FACTOR', 401);
    } else {
      if (!user.twoFactorEnabled || !(await this.store.consumeRecoveryCode(user.id, hashOpaqueToken(code.toUpperCase()), this.now()))) {
        throw new AppError('INVALID_SECOND_FACTOR', 401);
      }
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
    await this.recordSecurityEvent(updated, 'PASSWORD_CHANGED', null, 'Пароль изменён', 'Пароль вашего аккаунта был изменён.');
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

  async enableTwoFactor(authorization: string | undefined, code: string): Promise<TwoFactorEnableResult> {
    const user = await this.authenticate(authorization);
    if (!user.totpSecretEncrypted) throw new AppError('TWO_FACTOR_NOT_CONFIGURED', 409);
    const secret = decryptCredential(user.totpSecretEncrypted, this.config.CREDENTIAL_ENCRYPTION_KEY);
    if (!verifyTotp(secret, code, this.now().getTime())) throw new AppError('INVALID_SECOND_FACTOR', 401);
    const updated = await this.store.updateTwoFactor(user.id, user.totpSecretEncrypted, true, this.now());
    if (!updated) throw new AppError('UNAUTHORIZED', 401);
    const recoveryCodes = await this.replaceRecoveryCodes(updated.id);
    await this.recordSecurityEvent(updated, 'TWO_FACTOR_ENABLED', null, 'Двухфакторная защита включена', 'Для аккаунта включена двухфакторная аутентификация.');
    return { user: publicUser(updated), recoveryCodes };
  }

  async disableTwoFactor(authorization: string | undefined, code: string): Promise<PublicUser> {
    const user = await this.authenticate(authorization);
    if (!user.twoFactorEnabled || !user.totpSecretEncrypted) throw new AppError('TWO_FACTOR_NOT_CONFIGURED', 409);
    const secret = decryptCredential(user.totpSecretEncrypted, this.config.CREDENTIAL_ENCRYPTION_KEY);
    if (!verifyTotp(secret, code, this.now().getTime())) throw new AppError('INVALID_SECOND_FACTOR', 401);
    const updated = await this.store.updateTwoFactor(user.id, null, false, this.now());
    if (!updated) throw new AppError('UNAUTHORIZED', 401);
    await this.store.deleteRecoveryCodes(user.id);
    await this.recordSecurityEvent(updated, 'TWO_FACTOR_DISABLED', null, 'Двухфакторная защита отключена', 'Для аккаунта отключена двухфакторная аутентификация.');
    return publicUser(updated);
  }

  async regenerateRecoveryCodes(authorization: string | undefined, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.authenticate(authorization);
    if (!user.twoFactorEnabled || !user.totpSecretEncrypted) throw new AppError('TWO_FACTOR_NOT_CONFIGURED', 409);
    const secret = decryptCredential(user.totpSecretEncrypted, this.config.CREDENTIAL_ENCRYPTION_KEY);
    if (!verifyTotp(secret, code, this.now().getTime())) throw new AppError('INVALID_SECOND_FACTOR', 401);
    const recoveryCodes = await this.replaceRecoveryCodes(user.id);
    await this.recordSecurityEvent(user, 'RECOVERY_CODES_REGENERATED', null, 'Резервные коды обновлены', 'Старые резервные коды больше не действуют.');
    return { recoveryCodes };
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
      trustedAt: null,
      expiresAt: expiresAt(now, this.config.REFRESH_TOKEN_TTL_DAYS * 86_400),
      revokedAt: null,
      replacedBySessionId: null,
      createdAt: now,
      lastUsedAt: now,
    };
    const rotation = await this.store.rotateSession(hashOpaqueToken(refreshToken), replacement, now);
    if (rotation.status === 'reused') {
      const user = await this.store.findUserById(rotation.session.userId);
      if (user) await this.recordSecurityEvent(user, 'REFRESH_TOKEN_REUSE_DETECTED', rotation.session.deviceName, 'Подозрительная активность сессии', 'Повторно использован старый токен. Все токены этого устройства отозваны.');
      throw new AppError('SESSION_REVOKED', 401);
    }
    if (rotation.status === 'expired') throw new AppError('SESSION_EXPIRED', 401);
    if (rotation.status === 'not_found') throw new AppError('UNAUTHORIZED', 401);
    const user = await this.store.findUserById(rotation.newSession.userId);
    if (!user) throw new AppError('UNAUTHORIZED', 401);
    if (!user.passwordHash) {
      await this.store.revokeSessionFamily(rotation.newSession.tokenFamilyId, now);
      throw new AppError('SESSION_REVOKED', 401);
    }
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
    return (await this.authenticateContext(authorization)).user;
  }

  private async authenticateContext(authorization: string | undefined): Promise<{ user: UserRecord; session: SessionRecord }> {
    if (!authorization?.startsWith('Bearer ')) throw new AppError('UNAUTHORIZED', 401);
    try {
      const claims = await verifyAccessToken(authorization.slice('Bearer '.length), this.config);
      const [user, session] = await Promise.all([this.store.findUserById(claims.userId), this.store.findSessionById(claims.sessionId)]);
      if (!user || !user.passwordHash || !session || session.userId !== user.id) throw new AppError('UNAUTHORIZED', 401);
      if (session.revokedAt || isExpired(session.expiresAt, this.now())) throw new AppError('SESSION_REVOKED', 401);
      return { user, session };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof joseErrors.JWTExpired) throw new AppError('SESSION_EXPIRED', 401);
      throw new AppError('UNAUTHORIZED', 401);
    }
  }

  async listSessions(authorization: string | undefined): Promise<UserSession[]> {
    const { user, session: currentSession } = await this.authenticateContext(authorization);
    const rows = await this.store.listSessionsForUser(user.id);
    const latestByFamily = new Map<string, SessionRecord>();
    for (const row of rows) {
      const current = latestByFamily.get(row.tokenFamilyId);
      if (!current || row.createdAt > current.createdAt || (row.createdAt.getTime() === current.createdAt.getTime() && current.revokedAt !== null && row.revokedAt === null)) {
        latestByFamily.set(row.tokenFamilyId, row);
      }
    }
    return [...latestByFamily.values()]
      .filter((row) => !row.revokedAt && !isExpired(row.expiresAt, this.now()))
      .sort((left, right) => right.lastUsedAt.getTime() - left.lastUsedAt.getTime())
      .map((row) => ({
        id: row.tokenFamilyId,
        deviceName: row.deviceName,
        current: row.tokenFamilyId === currentSession.tokenFamilyId,
        trusted: row.trustedAt !== null,
        createdAt: row.createdAt.toISOString(),
        lastUsedAt: row.lastUsedAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      }));
  }

  async revokeSession(authorization: string | undefined, familyId: string): Promise<{ current: boolean }> {
    const { user, session } = await this.authenticateContext(authorization);
    const revoked = await this.store.revokeSessionFamilyForUser(user.id, familyId, this.now());
    if (!revoked) throw new AppError('SESSION_REVOKED', 404);
    const current = session.tokenFamilyId === familyId;
    await this.recordSecurityEvent(user, 'SESSION_REVOKED', null, 'Сессия завершена', current ? 'Текущая сессия была завершена.' : 'Одна из сессий вашего аккаунта была завершена.');
    return { current };
  }

  async revokeOtherSessions(authorization: string | undefined): Promise<{ revokedCount: number }> {
    const { user, session } = await this.authenticateContext(authorization);
    const families = new Set((await this.store.listSessionsForUser(user.id))
      .filter((candidate) => candidate.tokenFamilyId !== session.tokenFamilyId && !candidate.revokedAt && !isExpired(candidate.expiresAt, this.now()))
      .map((candidate) => candidate.tokenFamilyId));
    await Promise.all([...families].map((familyId) => this.store.revokeSessionFamilyForUser(user.id, familyId, this.now())));
    if (families.size > 0) await this.recordSecurityEvent(user, 'SESSION_REVOKED', null, 'Другие сессии завершены', `Завершено сессий: ${families.size}.`);
    return { revokedCount: families.size };
  }

  async setSessionTrusted(authorization: string | undefined, familyId: string, trusted: boolean): Promise<void> {
    const { user } = await this.authenticateContext(authorization);
    if (!(await this.store.setSessionFamilyTrusted(user.id, familyId, trusted ? this.now() : null))) throw new AppError('SESSION_REVOKED', 404);
  }

  async listSecurityEvents(authorization: string | undefined): Promise<SecurityEvent[]> {
    const user = await this.authenticate(authorization);
    return (await this.store.listSecurityEvents(user.id, 50)).map((event) => ({
      id: event.id,
      type: event.type,
      deviceName: event.deviceName,
      createdAt: event.createdAt.toISOString(),
    }));
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
      inviteUrl: this.inviteUrl(server.inviteToken),
      ownerUserId: server.ownerUserId,
      memberCount: server.memberCount,
      createdAt: server.createdAt.toISOString(),
    }));
  }

  async getHomeDashboard(authorization: string | undefined): Promise<HomeDashboardResponse> {
    const user = await this.authenticate(authorization);
    const serverRecords = await this.store.listServersForUser(user.id);
    const details = await Promise.all(serverRecords.map((server) => this.getServerDetailForUser(server, user)));
    const activity = await this.store.listUserActivity(user.id, 5);
    let connection: HomeDashboardResponse['readiness']['connection'] = 'healthy';
    try {
      await this.media.healthCheck();
    } catch {
      connection = 'degraded';
    }

    const lastActivityByChannel = new Map<string, Date>();
    for (const item of activity) {
      if (item.channelId && !lastActivityByChannel.has(item.channelId)) lastActivityByChannel.set(item.channelId, item.createdAt);
    }

    const activeSpaces: HomeDashboardResponse['activeSpaces'] = [];
    for (const server of details) {
      for (const channel of server.channels) {
        const participants = channel.voiceParticipants ?? [];
        if (channel.type === 'voice' && participants.length > 0) {
          activeSpaces.push({
            id: channel.id,
            type: 'voice_channel',
            title: channel.name,
            subtitle: server.name,
            participants: participants.slice(0, 4).map((participant) => ({ id: participant.userId, displayName: participant.displayName })),
            participantCount: participants.length,
            hasVoiceActivity: true,
            unreadCount: 0,
            lastActivityAt: (lastActivityByChannel.get(channel.id) ?? new Date(server.createdAt)).toISOString(),
            destination: { type: 'voice_channel', serverId: server.id, channelId: channel.id },
          });
        } else if (channel.type === 'text' && channel.unreadCount > 0) {
          activeSpaces.push({
            id: channel.id,
            type: 'text_channel',
            title: channel.name,
            subtitle: server.name,
            participants: [],
            participantCount: 0,
            hasVoiceActivity: false,
            unreadCount: channel.unreadCount,
            lastActivityAt: (lastActivityByChannel.get(channel.id) ?? new Date(server.createdAt)).toISOString(),
            destination: { type: 'text_channel', serverId: server.id, channelId: channel.id },
          });
        }
      }
    }
    activeSpaces.sort((left, right) => {
      if (left.type !== right.type) return left.type === 'voice_channel' ? -1 : 1;
      if (left.participantCount !== right.participantCount) return right.participantCount - left.participantCount;
      if (left.unreadCount !== right.unreadCount) return right.unreadCount - left.unreadCount;
      return Date.parse(right.lastActivityAt) - Date.parse(left.lastActivityAt);
    });

    const servers: HomeDashboardResponse['servers'] = details.map((server) => ({
      id: server.id,
      name: server.name,
      inviteUrl: server.inviteUrl,
      ownerUserId: server.ownerUserId,
      memberCount: server.memberCount,
      createdAt: server.createdAt,
      unreadCount: server.channels.reduce((total, channel) => total + channel.unreadCount, 0),
      activeVoiceCount: server.channels.reduce((total, channel) => total + (channel.voiceParticipants?.length ?? 0), 0),
    }));

    const continueItems: HomeDashboardResponse['continueItems'] = activeSpaces.slice(0, 2).map((space) => ({
      id: `space-${space.id}`,
      type: space.type,
      title: space.title,
      subtitle: space.subtitle,
      participantCount: space.participantCount,
      active: space.type === 'voice_channel',
      lastActivityAt: space.lastActivityAt,
      destination: space.destination,
    }));
    for (const server of servers) {
      if (continueItems.length >= 2) break;
      if (continueItems.some((item) => item.destination.serverId === server.id)) continue;
      continueItems.push({
        id: `server-${server.id}`,
        type: 'server',
        title: server.name,
        subtitle: 'Ваше пространство',
        participantCount: server.activeVoiceCount,
        active: server.activeVoiceCount > 0,
        lastActivityAt: server.createdAt,
        destination: { type: 'server', serverId: server.id },
      });
    }

    const firstServer = servers[0];
    const channelTypeById = new Map(details.flatMap((server) => server.channels.map((channel) => [channel.id, channel.type] as const)));
    const onboardingSteps: HomeDashboardResponse['onboarding']['steps'] = [
      { id: 'create_server', title: 'Создайте свой сервер', description: 'Соберите общение в одном пространстве.', complete: servers.length > 0, destination: null },
      { id: 'configure_channels', title: 'Настройте каналы', description: 'Подготовьте текстовые и голосовые каналы.', complete: details.some((server) => server.channels.length > 0), destination: firstServer ? { type: 'server', serverId: firstServer.id } : null },
      { id: 'invite_members', title: 'Пригласите участников', description: 'Отправьте короткую ссылку-приглашение.', complete: servers.some((server) => server.memberCount > 1), destination: firstServer ? { type: 'server', serverId: firstServer.id } : null },
    ];
    const accountAge = this.now().getTime() - user.createdAt.getTime();
    const onboardingVisible = servers.length === 0 && accountAge < 7 * 24 * 60 * 60 * 1000 && onboardingSteps.some((step) => !step.complete);

    return {
      user: {
        id: user.id,
        displayName: user.displayName ?? user.email,
        email: user.email,
        avatarUrl: null,
        presence: 'online',
        platformBadge: user.platformRole === 'owner' ? 'FOUNDER_DEVELOPER' : null,
      },
      readiness: { connection, audioSetupRequired: false },
      servers,
      continueItems,
      activeSpaces: activeSpaces.slice(0, 4),
      recentActivity: activity.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        context: item.context,
        occurredAt: item.createdAt.toISOString(),
        destination: item.serverId === null ? null : {
          type: item.channelId === null ? 'server' : channelTypeById.get(item.channelId) === 'voice' ? 'voice_channel' : 'text_channel',
          serverId: item.serverId,
          ...(item.channelId === null ? {} : { channelId: item.channelId }),
        },
      })),
      onboarding: { visible: onboardingVisible, steps: onboardingSteps },
    };
  }

  async recordOpenedChannel(authorization: string | undefined, channelId: string): Promise<void> {
    const user = await this.authenticate(authorization);
    const channel = await this.requireServerChannel(channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireChannelPermission(server, channel, user, 'VIEW_CHANNEL');
    await this.recordUserActivity(user.id, 'opened_channel', channel.type === 'text' ? `# ${channel.name}` : channel.name, server.name, server.id, channel.id);
  }

  async recordLeftVoiceChannel(authorization: string | undefined, channelId: string): Promise<void> {
    const user = await this.authenticate(authorization);
    const channel = await this.requireVoiceChannel(channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireChannelPermission(server, channel, user, 'VIEW_CHANNEL');
    await this.recordUserActivity(user.id, 'left_voice', channel.name, server.name, server.id, channel.id);
  }

  async createServer(authorization: string | undefined, name: string): Promise<ServerDetail> {
    const user = await this.authenticate(authorization);
    this.requireCompleteProfile(user);
    const now = this.now();
    let server: ServerRecord | null = null;
    for (let attempt = 0; attempt < 10 && !server; attempt += 1) {
      const candidate: ServerRecord = { id: randomUUID(), name, inviteToken: randomOpaqueToken(9), ownerUserId: user.id, createdAt: now, updatedAt: now };
      const everyone: ServerRoleRecord = {
        id: randomUUID(), serverId: candidate.id, name: '@everyone', color: '#8d7a72', position: 0, isDefault: true,
        kind: 'EVERYONE',
        permissions: DEFAULT_SERVER_PERMISSIONS, createdAt: now, updatedAt: now,
      };
      const ownerRole: ServerRoleRecord = {
        id: randomUUID(), serverId: candidate.id, name: 'Владелец', color: '#e38b54', position: 100, isDefault: false,
        kind: 'OWNER',
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
    await this.recordUserActivity(user.id, 'joined_server', server.name, 'Сервер создан', server.id, null);
    return this.getServerDetailForUser(server, user);
  }

  async acceptServerInvite(authorization: string | undefined, inviteToken: string): Promise<ServerDetail> {
    const user = await this.authenticate(authorization);
    this.requireCompleteProfile(user);
    const server = await this.store.findServerByInviteToken(inviteToken);
    if (!server) throw new AppError('SERVER_NOT_FOUND', 404);
    if (!await this.store.findServerMember(server.id, user.id)) {
      await this.store.addServerMember({ serverId: server.id, userId: user.id, joinedAt: this.now() });
      await this.recordUserActivity(user.id, 'joined_server', server.name, 'Вы приняли приглашение по ссылке', server.id, null);
    }
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
    await this.recordServerAudit(server.id, user, 'CHANNEL_CREATED', 'CHANNEL', channel.id, null, { name: channel.name, type: channel.type });
    return publicServerChannel(channel);
  }

  async deleteServerChannel(authorization: string | undefined, channelId: string): Promise<void> {
    const user = await this.authenticate(authorization);
    const channel = await this.requireServerChannel(channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireServerPermission(server, user, 'MANAGE_CHANNELS');
    if (!(await this.store.deleteServerChannel(channel.id))) throw new AppError('CHANNEL_NOT_FOUND', 404);
    await this.recordServerAudit(server.id, user, 'CHANNEL_DELETED', 'CHANNEL', channel.id, { name: channel.name, type: channel.type }, null);
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
      kind: 'CUSTOM',
      position: Number.isFinite(actorTopPosition)
        ? Math.max(1, Math.min(actorTopPosition - 1, Math.max(0, ...roles.filter((current) => current.position < actorTopPosition).map((current) => current.position)) + 1))
        : Math.min(99, Math.max(0, ...roles.filter((current) => current.kind !== 'OWNER').map((current) => current.position)) + 1),
      createdAt: now, updatedAt: now,
    };
    await this.store.createServerRole(role);
    await this.recordServerAudit(server.id, user, 'ROLE_CREATED', 'ROLE', role.id, null, publicServerRole(role));
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
    if (role.kind === 'OWNER') throw new AppError('SERVER_PERMISSION_DENIED', 403);
    if (role.kind === 'EVERYONE' && (values.name !== undefined || values.color !== undefined)) throw new AppError('SERVER_PERMISSION_DENIED', 403);
    if (role.position >= await this.serverRolePositionFor(server, user, roles)) throw new AppError('SERVER_PERMISSION_DENIED', 403);
    const changes: Partial<Pick<ServerRoleRecord, 'name' | 'color' | 'permissions'>> = {};
    if (values.name !== undefined) changes.name = values.name;
    if (values.color !== undefined) changes.color = values.color;
    if (values.permissions !== undefined) changes.permissions = values.permissions;
    const updated = await this.store.updateServerRole(role.id, changes, this.now());
    if (!updated) throw new AppError('ROLE_NOT_FOUND', 404);
    await this.recordServerAudit(server.id, user, 'ROLE_UPDATED', 'ROLE', role.id, publicServerRole(role), publicServerRole(updated));
    return publicServerRole(updated);
  }

  async reorderServerRole(authorization: string | undefined, serverId: string, roleId: string, position: number): Promise<ServerRole> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, 'MANAGE_ROLES');
    const roles = await this.store.listServerRoles(server.id);
    const role = roles.find((candidate) => candidate.id === roleId);
    if (!role) throw new AppError('ROLE_NOT_FOUND', 404);
    if (role.kind !== 'CUSTOM') throw new AppError('SERVER_PERMISSION_DENIED', 403);
    const actorPosition = await this.serverRolePositionFor(server, user, roles);
    const ownerPosition = Math.min(...roles.filter((candidate) => candidate.kind === 'OWNER').map((candidate) => candidate.position), 100);
    const ceiling = Math.min(actorPosition, ownerPosition);
    if (role.position >= ceiling || position >= ceiling || position < 1) throw new AppError('SERVER_PERMISSION_DENIED', 403);
    const updated = await this.store.reorderServerRole(server.id, role.id, role.position, position, this.now());
    if (!updated) throw new AppError('ROLE_NOT_FOUND', 404);
    await this.recordServerAudit(server.id, user, 'ROLE_REORDERED', 'ROLE', role.id, { position: role.position }, { position: updated.position });
    return publicServerRole(updated);
  }

  async deleteServerRole(authorization: string | undefined, serverId: string, roleId: string): Promise<void> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, 'MANAGE_ROLES');
    const roles = await this.store.listServerRoles(server.id);
    const role = roles.find((candidate) => candidate.id === roleId);
    if (!role) throw new AppError('ROLE_NOT_FOUND', 404);
    if (role.kind !== 'CUSTOM' || role.position >= await this.serverRolePositionFor(server, user, roles)) throw new AppError('SERVER_PERMISSION_DENIED', 403);
    if (!(await this.store.deleteServerRole(role.id))) throw new AppError('ROLE_NOT_FOUND', 404);
    await this.recordServerAudit(server.id, user, 'ROLE_DELETED', 'ROLE', role.id, publicServerRole(role), null);
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
    const assignable = new Set(roles.filter((role) => role.kind === 'CUSTOM' && role.position < actorTopPosition).map((role) => role.id));
    if (roleIds.some((roleId) => !assignable.has(roleId))) throw new AppError('ROLE_NOT_FOUND', 404);
    await this.store.assignMemberRoles(server.id, memberUserId, [...new Set(roleIds)]);
    await this.recordServerAudit(server.id, user, 'MEMBER_ROLES_UPDATED', 'MEMBER', memberUserId, { roleIds: [...targetRoleIds] }, { roleIds: [...new Set(roleIds)] });
  }

  async setChannelPermissionOverwrite(authorization: string | undefined, channelId: string, targetType: PermissionOverwriteTargetType, targetId: string, allow: ServerPermission[], deny: ServerPermission[]): Promise<void> {
    const user = await this.authenticate(authorization);
    const channel = await this.requireServerChannel(channelId);
    const server = await this.requireServer(channel.serverId);
    const actorPermissions = await this.requireServerPermission(server, user, 'MANAGE_ROLES');
    if (allow.some((permission) => !actorPermissions.has(permission))) throw new AppError('SERVER_PERMISSION_DENIED', 403);
    const roles = await this.store.listServerRoles(server.id);
    const actorPosition = await this.serverRolePositionFor(server, user, roles);
    if (targetType === 'ROLE') {
      const role = roles.find((candidate) => candidate.id === targetId);
      if (!role) throw new AppError('ROLE_NOT_FOUND', 404);
      if (role.kind === 'OWNER' || (role.kind === 'CUSTOM' && role.position >= actorPosition)) throw new AppError('SERVER_PERMISSION_DENIED', 403);
    } else {
      if (!(await this.store.findServerMember(server.id, targetId))) throw new AppError('SERVER_NOT_FOUND', 404);
      if (targetId === server.ownerUserId) throw new AppError('SERVER_PERMISSION_DENIED', 403);
      const targetRoleIds = await this.store.listMemberRoleIds(server.id, targetId);
      if (highestRolePosition(false, roles, targetRoleIds) >= actorPosition) throw new AppError('SERVER_PERMISSION_DENIED', 403);
    }
    const current = (await this.store.listChannelPermissionOverwrites([channel.id])).find((overwrite) => overwrite.targetType === targetType && overwrite.targetId === targetId) ?? null;
    const nextAllow = [...new Set(allow)];
    const nextDeny = [...new Set(deny)];
    if (nextAllow.length === 0 && nextDeny.length === 0) await this.store.deleteChannelPermissionOverwrite(channel.id, targetType, targetId);
    else {
      const now = this.now();
      await this.store.upsertChannelPermissionOverwrite({ channelId: channel.id, targetType, targetId, allow: nextAllow, deny: nextDeny, createdAt: current?.createdAt ?? now, updatedAt: now });
    }
    await this.recordServerAudit(server.id, user, 'CHANNEL_OVERWRITE_UPDATED', targetType, targetId, current && { allow: current.allow, deny: current.deny }, nextAllow.length === 0 && nextDeny.length === 0 ? null : { channelId: channel.id, allow: nextAllow, deny: nextDeny });
  }

  async listServerAuditLog(authorization: string | undefined, serverId: string): Promise<ServerAuditLogEntry[]> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, 'VIEW_AUDIT_LOG');
    return (await this.store.listServerAuditLog(server.id, 100)).map((entry) => ({
      id: entry.id,
      serverId: entry.serverId,
      actorUserId: entry.actorUserId,
      actorDisplayName: entry.actorDisplayName ?? 'Системное действие',
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      before: entry.before,
      after: entry.after,
      createdAt: entry.createdAt.toISOString(),
    }));
  }

  async kickServerMember(authorization: string | undefined, serverId: string, memberUserId: string): Promise<void> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, 'KICK_MEMBERS');
    if (memberUserId === server.ownerUserId || memberUserId === user.id) throw new AppError('SERVER_PERMISSION_DENIED', 403);
    const [roles, targetUser] = await Promise.all([this.store.listServerRoles(server.id), this.store.findUserById(memberUserId)]);
    if (!targetUser) throw new AppError('SERVER_NOT_FOUND', 404);
    const actorTopPosition = await this.serverRolePositionFor(server, user, roles);
    const targetRoleIds = new Set(await this.store.listMemberRoleIds(server.id, memberUserId));
    const targetTopPosition = Math.max(0, ...roles.filter((role) => targetRoleIds.has(role.id)).map((role) => role.position));
    if (targetTopPosition >= actorTopPosition) throw new AppError('SERVER_PERMISSION_DENIED', 403);
    if (!(await this.store.removeServerMember(server.id, memberUserId))) throw new AppError('SERVER_NOT_FOUND', 404);
    await this.recordServerAudit(server.id, user, 'MEMBER_KICKED', 'MEMBER', memberUserId, { displayName: targetUser.displayName }, null);
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
    await this.requireChannelPermission(server, channel, user, 'VIEW_CHANNEL');
    await this.requireChannelPermission(server, channel, user, 'READ_MESSAGE_HISTORY');
    return this.hydrateMessages(await this.store.listTextMessages(channel.id, before ? new Date(before) : null, limit), user.id);
  }

  async listMessageNotifications(authorization: string | undefined, since: string | undefined, afterId: string | undefined, limit: number): Promise<MessageNotificationPage> {
    const user = await this.authenticate(authorization);
    if (since === undefined) return { items: [], cursor: { createdAt: this.now().toISOString(), id: null } };
    const records = await this.store.listMessageNotifications(user.id, new Date(since), afterId ?? null, limit);
    const visibleChannelIds = new Set<string>();
    for (const notification of records) {
      const [server, channel] = await Promise.all([this.store.findServerById(notification.serverId), this.store.findServerChannel(notification.channelId)]);
      if (server && channel && (await this.channelPermissionsFor(server, channel, user)).has('VIEW_CHANNEL')) visibleChannelIds.add(notification.channelId);
    }
    const items: MessageNotification[] = records
      .filter((notification) => visibleChannelIds.has(notification.channelId))
      .map((notification: MessageNotificationRecord) => ({
        id: notification.id,
        serverId: notification.serverId,
        serverName: notification.serverName,
        channelId: notification.channelId,
        channelName: notification.channelName,
        authorUserId: notification.authorUserId,
        authorDisplayName: notification.authorDisplayName ?? 'Участник',
        content: notification.content,
        createdAt: notification.createdAt.toISOString(),
      }));
    const lastScanned = records.at(-1);
    return { items, cursor: lastScanned ? { createdAt: lastScanned.createdAt.toISOString(), id: lastScanned.id } : null };
  }

  async createMessage(authorization: string | undefined, channelId: string, content: string, replyToMessageId: string | null): Promise<TextMessage> {
    const user = await this.authenticate(authorization);
    this.requireCompleteProfile(user);
    const channel = await this.requireTextChannel(channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireChannelPermission(server, channel, user, 'SEND_MESSAGES');
    if (replyToMessageId !== null) {
      const replyTarget = await this.store.findTextMessage(replyToMessageId);
      if (!replyTarget || replyTarget.channelId !== channel.id) throw new AppError('MESSAGE_NOT_FOUND', 404);
    }
    const now = this.now();
    const message = { id: randomUUID(), channelId: channel.id, authorUserId: user.id, content, replyToMessageId, createdAt: now, editedAt: null };
    await this.store.createTextMessage(message);
    await this.recordUserActivity(user.id, 'sent_message', `# ${channel.name}`, server.name, server.id, channel.id);
    return (await this.hydrateMessages([{ ...message, displayName: user.displayName, platformRole: user.platformRole }], user.id))[0]!;
  }

  async updateMessage(authorization: string | undefined, messageId: string, content: string): Promise<TextMessage> {
    const user = await this.authenticate(authorization);
    const message = await this.store.findTextMessage(messageId);
    if (!message) throw new AppError('MESSAGE_NOT_FOUND', 404);
    const channel = await this.requireTextChannel(message.channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireChannelPermission(server, channel, user, message.authorUserId === user.id ? 'MANAGE_OWN_MESSAGES' : 'MANAGE_MESSAGES');
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
    await this.requireChannelPermission(server, channel, user, 'ADD_REACTIONS');
    if (active) await this.store.addMessageReaction({ messageId: message.id, userId: user.id, emoji, createdAt: this.now() });
    else await this.store.removeMessageReaction(message.id, user.id, emoji);
    const [withAuthor] = await this.store.findTextMessagesWithAuthors([message.id]);
    if (!withAuthor) throw new AppError('MESSAGE_NOT_FOUND', 404);
    return (await this.hydrateMessages([withAuthor], user.id))[0]!;
  }

  async uploadMessageAttachment(authorization: string | undefined, messageId: string, input: { fileName: string; mimeType: string; content: Buffer }): Promise<TextMessage> {
    const user = await this.authenticate(authorization);
    this.requireCompleteProfile(user);
    const message = await this.store.findTextMessage(messageId);
    if (!message) throw new AppError('MESSAGE_NOT_FOUND', 404);
    const channel = await this.requireTextChannel(message.channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireChannelPermission(server, channel, user, 'SEND_ATTACHMENTS');
    if (message.authorUserId !== user.id) throw new AppError('SERVER_PERMISSION_DENIED', 403);
    if (input.content.length === 0) throw new AppError('VALIDATION_ERROR', 400);
    if (input.content.length > MAX_ATTACHMENT_BYTES) throw new AppError('ATTACHMENT_TOO_LARGE', 413);
    const mimeType = input.mimeType.toLowerCase().split(';', 1)[0]?.trim() ?? '';
    if (!ALLOWED_ATTACHMENT_TYPES.has(mimeType)) throw new AppError('ATTACHMENT_TYPE_NOT_ALLOWED', 400);
    const existing = await this.store.listMessageAttachments([message.id]);
    if (existing.length >= MAX_ATTACHMENTS_PER_MESSAGE) throw new AppError('VALIDATION_ERROR', 400, undefined, { field: 'attachments', max: MAX_ATTACHMENTS_PER_MESSAGE });
    const attachment: MessageAttachmentRecord = {
      id: randomUUID(),
      messageId: message.id,
      uploaderUserId: user.id,
      fileName: safeAttachmentName(input.fileName),
      mimeType,
      size: input.content.length,
      content: input.content,
      createdAt: this.now(),
    };
    await this.store.createMessageAttachment(attachment);
    const [withAuthor] = await this.store.findTextMessagesWithAuthors([message.id]);
    if (!withAuthor) throw new AppError('MESSAGE_NOT_FOUND', 404);
    return (await this.hydrateMessages([withAuthor], user.id))[0]!;
  }

  async getMessageAttachment(authorization: string | undefined, attachmentId: string): Promise<MessageAttachmentRecord> {
    const user = await this.authenticate(authorization);
    const attachment = await this.store.findMessageAttachment(attachmentId);
    if (!attachment) throw new AppError('ATTACHMENT_NOT_FOUND', 404);
    const message = await this.store.findTextMessage(attachment.messageId);
    if (!message) throw new AppError('ATTACHMENT_NOT_FOUND', 404);
    const channel = await this.requireTextChannel(message.channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireChannelPermission(server, channel, user, 'VIEW_CHANNEL');
    await this.requireChannelPermission(server, channel, user, 'READ_MESSAGE_HISTORY');
    return attachment;
  }

  async deleteMessageAttachment(authorization: string | undefined, attachmentId: string): Promise<TextMessage> {
    const user = await this.authenticate(authorization);
    const attachment = await this.store.findMessageAttachment(attachmentId);
    if (!attachment) throw new AppError('ATTACHMENT_NOT_FOUND', 404);
    const message = await this.store.findTextMessage(attachment.messageId);
    if (!message) throw new AppError('ATTACHMENT_NOT_FOUND', 404);
    const channel = await this.requireTextChannel(message.channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireChannelPermission(server, channel, user, message.authorUserId === user.id || attachment.uploaderUserId === user.id ? 'MANAGE_OWN_MESSAGES' : 'MANAGE_MESSAGES');
    await this.store.deleteMessageAttachment(attachment.id);
    const [withAuthor] = await this.store.findTextMessagesWithAuthors([message.id]);
    if (!withAuthor) throw new AppError('MESSAGE_NOT_FOUND', 404);
    return (await this.hydrateMessages([withAuthor], user.id))[0]!;
  }

  async markChannelRead(authorization: string | undefined, channelId: string, messageId: string): Promise<void> {
    const user = await this.authenticate(authorization);
    const channel = await this.requireTextChannel(channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireChannelPermission(server, channel, user, 'VIEW_CHANNEL');
    const message = await this.store.findTextMessage(messageId);
    if (!message || message.channelId !== channel.id) throw new AppError('MESSAGE_NOT_FOUND', 404);
    await this.store.markChannelRead({ channelId: channel.id, userId: user.id, readAt: message.createdAt });
  }

  async deleteMessage(authorization: string | undefined, messageId: string): Promise<void> {
    const user = await this.authenticate(authorization);
    const message = await this.store.findTextMessage(messageId);
    if (!message) throw new AppError('MESSAGE_NOT_FOUND', 404);
    const channel = await this.requireTextChannel(message.channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireChannelPermission(server, channel, user, message.authorUserId === user.id ? 'MANAGE_OWN_MESSAGES' : 'MANAGE_MESSAGES');
    await this.store.deleteTextMessage(message.id);
  }

  async listDirectMessageCandidates(authorization: string | undefined): Promise<DirectMessageCandidate[]> {
    const user = await this.authenticate(authorization);
    const candidates = new Map<string, DirectMessageCandidate>();
    for (const server of await this.store.listServersForUser(user.id)) {
      const permissions = await this.serverPermissionsFor(server, user);
      if (!permissions.has('VIEW_SERVER')) continue;
      for (const member of await this.store.listServerMembers(server.id)) {
        if (member.userId === user.id || !member.displayName) continue;
        const existing = candidates.get(member.userId);
        if (existing) existing.sharedServerNames.push(server.name);
        else candidates.set(member.userId, { userId: member.userId, displayName: member.displayName, platformRole: member.platformRole, sharedServerNames: [server.name] });
      }
    }
    return [...candidates.values()].map((candidate) => ({ ...candidate, sharedServerNames: [...new Set(candidate.sharedServerNames)].sort() })).sort((left, right) => left.displayName.localeCompare(right.displayName, 'ru'));
  }

  async listDirectConversations(authorization: string | undefined): Promise<DirectConversationSummary[]> {
    const user = await this.authenticate(authorization);
    return (await this.store.listDirectConversationOverviews(user.id)).map(publicDirectConversation);
  }

  async createDirectConversation(authorization: string | undefined, participantUserId: string): Promise<DirectConversationSummary> {
    const user = await this.authenticate(authorization);
    this.requireCompleteProfile(user);
    if (participantUserId === user.id) throw new AppError('DIRECT_MESSAGE_NOT_ALLOWED', 400);
    const participant = await this.store.findUserById(participantUserId);
    if (!participant?.displayName) throw new AppError('DIRECT_MESSAGE_NOT_ALLOWED', 403);
    let shareVisibleServer = false;
    for (const server of await this.store.listServersForUser(user.id)) {
      if (!(await this.store.findServerMember(server.id, participant.id))) continue;
      if ((await this.serverPermissionsFor(server, user)).has('VIEW_SERVER')) {
        shareVisibleServer = true;
        break;
      }
    }
    if (!shareVisibleServer) throw new AppError('DIRECT_MESSAGE_NOT_ALLOWED', 403);
    const conversation = await this.store.getOrCreateDirectConversation(user.id, participant.id, this.now());
    const overview = (await this.store.listDirectConversationOverviews(user.id)).find((candidate) => candidate.conversation.id === conversation.id);
    if (!overview) throw new AppError('DIRECT_CONVERSATION_NOT_FOUND', 404);
    return publicDirectConversation(overview);
  }

  async listDirectMessages(authorization: string | undefined, conversationId: string, before: string | undefined, limit: number): Promise<DirectMessage[]> {
    const user = await this.authenticate(authorization);
    await this.requireDirectConversation(conversationId, user.id);
    return this.hydrateDirectMessages(await this.store.listDirectMessages(conversationId, before ? new Date(before) : null, limit), user.id);
  }

  async createDirectMessage(authorization: string | undefined, conversationId: string, content: string, replyToMessageId: string | null): Promise<DirectMessage> {
    const user = await this.authenticate(authorization);
    this.requireCompleteProfile(user);
    const conversation = await this.requireDirectConversation(conversationId, user.id);
    if (replyToMessageId !== null) {
      const reply = await this.store.findDirectMessage(replyToMessageId);
      if (!reply || reply.conversationId !== conversationId) throw new AppError('DIRECT_MESSAGE_NOT_FOUND', 404);
    }
    const createdAt = new Date(Math.max(this.now().getTime(), conversation.updatedAt.getTime() + 1));
    const message = { id: randomUUID(), conversationId, authorUserId: user.id, content, replyToMessageId, createdAt, editedAt: null };
    await this.store.createDirectMessage(message);
    return (await this.hydrateDirectMessages([{ ...message, displayName: user.displayName, platformRole: user.platformRole }], user.id))[0]!;
  }

  async updateDirectMessage(authorization: string | undefined, messageId: string, content: string): Promise<DirectMessage> {
    const user = await this.authenticate(authorization);
    const message = await this.store.findDirectMessage(messageId);
    if (!message || message.authorUserId !== user.id) throw new AppError('DIRECT_MESSAGE_NOT_FOUND', 404);
    await this.requireDirectConversation(message.conversationId, user.id);
    const updated = await this.store.updateDirectMessage(message.id, content, this.now());
    if (!updated) throw new AppError('DIRECT_MESSAGE_NOT_FOUND', 404);
    return (await this.hydrateDirectMessages([{ ...updated, displayName: user.displayName, platformRole: user.platformRole }], user.id))[0]!;
  }

  async deleteDirectMessage(authorization: string | undefined, messageId: string): Promise<void> {
    const user = await this.authenticate(authorization);
    const message = await this.store.findDirectMessage(messageId);
    if (!message || message.authorUserId !== user.id) throw new AppError('DIRECT_MESSAGE_NOT_FOUND', 404);
    await this.requireDirectConversation(message.conversationId, user.id);
    await this.store.deleteDirectMessage(message.id);
  }

  async setDirectMessageReaction(authorization: string | undefined, messageId: string, emoji: string, active: boolean): Promise<DirectMessage> {
    const user = await this.authenticate(authorization);
    const message = await this.store.findDirectMessage(messageId);
    if (!message) throw new AppError('DIRECT_MESSAGE_NOT_FOUND', 404);
    await this.requireDirectConversation(message.conversationId, user.id);
    if (active) await this.store.addDirectMessageReaction({ messageId, userId: user.id, emoji, createdAt: this.now() });
    else await this.store.removeDirectMessageReaction(messageId, user.id, emoji);
    const [withAuthor] = await this.store.findDirectMessagesWithAuthors([message.id]);
    if (!withAuthor) throw new AppError('DIRECT_MESSAGE_NOT_FOUND', 404);
    return (await this.hydrateDirectMessages([withAuthor], user.id))[0]!;
  }

  async markDirectConversationRead(authorization: string | undefined, conversationId: string, messageId: string): Promise<void> {
    const user = await this.authenticate(authorization);
    await this.requireDirectConversation(conversationId, user.id);
    const message = await this.store.findDirectMessage(messageId);
    if (!message || message.conversationId !== conversationId) throw new AppError('DIRECT_MESSAGE_NOT_FOUND', 404);
    await this.store.markDirectConversationRead(conversationId, user.id, message.createdAt, message.id);
  }

  async uploadDirectMessageAttachment(authorization: string | undefined, messageId: string, input: { fileName: string; mimeType: string; content: Buffer }): Promise<DirectMessage> {
    const user = await this.authenticate(authorization);
    const message = await this.store.findDirectMessage(messageId);
    if (!message || message.authorUserId !== user.id) throw new AppError('DIRECT_MESSAGE_NOT_FOUND', 404);
    await this.requireDirectConversation(message.conversationId, user.id);
    if (input.content.length === 0) throw new AppError('VALIDATION_ERROR', 400);
    if (input.content.length > MAX_ATTACHMENT_BYTES) throw new AppError('ATTACHMENT_TOO_LARGE', 413);
    const mimeType = input.mimeType.toLowerCase().split(';', 1)[0]?.trim() ?? '';
    if (!ALLOWED_ATTACHMENT_TYPES.has(mimeType)) throw new AppError('ATTACHMENT_TYPE_NOT_ALLOWED', 400);
    if ((await this.store.listDirectMessageAttachments([message.id])).length >= MAX_ATTACHMENTS_PER_MESSAGE) throw new AppError('VALIDATION_ERROR', 400, undefined, { field: 'attachments', max: MAX_ATTACHMENTS_PER_MESSAGE });
    const attachment: DirectMessageAttachmentRecord = { id: randomUUID(), messageId, uploaderUserId: user.id, fileName: safeAttachmentName(input.fileName), mimeType, size: input.content.length, content: input.content, createdAt: this.now() };
    await this.store.createDirectMessageAttachment(attachment);
    const [withAuthor] = await this.store.findDirectMessagesWithAuthors([message.id]);
    if (!withAuthor) throw new AppError('DIRECT_MESSAGE_NOT_FOUND', 404);
    return (await this.hydrateDirectMessages([withAuthor], user.id))[0]!;
  }

  async getDirectMessageAttachment(authorization: string | undefined, attachmentId: string): Promise<DirectMessageAttachmentRecord> {
    const user = await this.authenticate(authorization);
    const attachment = await this.store.findDirectMessageAttachment(attachmentId);
    if (!attachment) throw new AppError('ATTACHMENT_NOT_FOUND', 404);
    const message = await this.store.findDirectMessage(attachment.messageId);
    if (!message) throw new AppError('ATTACHMENT_NOT_FOUND', 404);
    await this.requireDirectConversation(message.conversationId, user.id);
    return attachment;
  }

  async deleteDirectMessageAttachment(authorization: string | undefined, attachmentId: string): Promise<DirectMessage> {
    const user = await this.authenticate(authorization);
    const attachment = await this.store.findDirectMessageAttachment(attachmentId);
    if (!attachment || attachment.uploaderUserId !== user.id) throw new AppError('ATTACHMENT_NOT_FOUND', 404);
    const message = await this.store.findDirectMessage(attachment.messageId);
    if (!message) throw new AppError('ATTACHMENT_NOT_FOUND', 404);
    await this.requireDirectConversation(message.conversationId, user.id);
    await this.store.deleteDirectMessageAttachment(attachment.id);
    const [withAuthor] = await this.store.findDirectMessagesWithAuthors([message.id]);
    if (!withAuthor) throw new AppError('DIRECT_MESSAGE_NOT_FOUND', 404);
    return (await this.hydrateDirectMessages([withAuthor], user.id))[0]!;
  }

  private async hydrateDirectMessages(messages: DirectMessageWithAuthor[], currentUserId: string): Promise<DirectMessage[]> {
    const replyIds = [...new Set(messages.map((message) => message.replyToMessageId).filter((id): id is string => id !== null))];
    const replies = new Map((await this.store.findDirectMessagesWithAuthors(replyIds)).map((message) => [message.id, message]));
    const messageIds = messages.map((message) => message.id);
    const [reactions, attachments] = await Promise.all([this.store.listDirectMessageReactionSummaries(messageIds, currentUserId), this.store.listDirectMessageAttachments(messageIds)]);
    const reactionsByMessage = new Map<string, MessageReactionSummary[]>();
    for (const reaction of reactions) reactionsByMessage.set(reaction.messageId, [...(reactionsByMessage.get(reaction.messageId) ?? []), reaction]);
    const attachmentsByMessage = new Map<string, DirectMessageAttachmentMetadata[]>();
    for (const attachment of attachments) attachmentsByMessage.set(attachment.messageId, [...(attachmentsByMessage.get(attachment.messageId) ?? []), attachment]);
    return messages.map((message) => publicDirectMessage(message, message.replyToMessageId === null ? null : replies.get(message.replyToMessageId) ?? null, reactionsByMessage.get(message.id) ?? [], attachmentsByMessage.get(message.id) ?? []));
  }

  private async hydrateMessages(messages: TextMessageWithAuthor[], currentUserId: string): Promise<TextMessage[]> {
    const replyIds = [...new Set(messages.map((message) => message.replyToMessageId).filter((id): id is string => id !== null))];
    const replies = new Map((await this.store.findTextMessagesWithAuthors(replyIds)).map((message) => [message.id, message]));
    const messageIds = messages.map((message) => message.id);
    const [reactions, attachments] = await Promise.all([
      this.store.listMessageReactionSummaries(messageIds, currentUserId),
      this.store.listMessageAttachments(messageIds),
    ]);
    const byMessage = new Map<string, MessageReactionSummary[]>();
    for (const reaction of reactions) byMessage.set(reaction.messageId, [...(byMessage.get(reaction.messageId) ?? []), reaction]);
    const attachmentsByMessage = new Map<string, MessageAttachmentMetadata[]>();
    for (const attachment of attachments) attachmentsByMessage.set(attachment.messageId, [...(attachmentsByMessage.get(attachment.messageId) ?? []), attachment]);
    return messages.map((message) => publicTextMessage(message, message.replyToMessageId === null ? null : replies.get(message.replyToMessageId) ?? null, byMessage.get(message.id) ?? [], attachmentsByMessage.get(message.id) ?? []));
  }

  async connectVoiceChannel(authorization: string | undefined, channelId: string): Promise<RoomConnection> {
    const user = await this.authenticate(authorization);
    this.requireCompleteProfile(user);
    const channel = await this.requireVoiceChannel(channelId);
    const server = await this.requireServer(channel.serverId);
    const permissions = await this.requireChannelPermission(server, channel, user, 'CONNECT_VOICE');
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
        canPublishScreen: permissions.has('STREAM_SCREEN'),
        canPublishScreenAudio: permissions.has('STREAM_APPLICATION_AUDIO'),
      });
      await this.recordUserActivity(user.id, 'joined_voice', channel.name, server.name, server.id, channel.id);
      return {
        roomId: channel.id,
        ownerUserId: server.ownerUserId,
        livekitUrl: this.config.LIVEKIT_URL,
        livekitToken: token,
        participantIdentity: identity,
        participantDisplayName: user.displayName,
        isOwner: permissions.has('MUTE_MEMBERS'),
        contextType: 'channel',
        serverId: server.id,
        channelId: channel.id,
        serverName: server.name,
        channelName: channel.name,
        canSpeak: permissions.has('SPEAK'),
        canStream: permissions.has('STREAM_SCREEN'),
        canStreamApplicationAudio: permissions.has('STREAM_APPLICATION_AUDIO'),
        canMoveMembers: permissions.has('MOVE_MEMBERS'),
      };
    } catch {
      throw new AppError('LIVEKIT_UNAVAILABLE', 503);
    }
  }

  async requestVoiceMemberMove(authorization: string | undefined, channelId: string, memberUserId: string): Promise<void> {
    const actor = await this.authenticate(authorization);
    const channel = await this.requireVoiceChannel(channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireChannelPermission(server, channel, actor, 'MOVE_MEMBERS');
    if (memberUserId === actor.id || memberUserId === server.ownerUserId) throw new AppError('SERVER_PERMISSION_DENIED', 403);
    const [targetMember, targetUser, roles] = await Promise.all([
      this.store.findServerMember(server.id, memberUserId),
      this.store.findUserById(memberUserId),
      this.store.listServerRoles(server.id),
    ]);
    if (!targetMember || !targetUser?.displayName) throw new AppError('SERVER_NOT_FOUND', 404);
    const actorTopPosition = await this.serverRolePositionFor(server, actor, roles);
    const targetRoleIds = new Set(await this.store.listMemberRoleIds(server.id, memberUserId));
    const targetTopPosition = Math.max(0, ...roles.filter((role) => targetRoleIds.has(role.id)).map((role) => role.position));
    if (targetTopPosition >= actorTopPosition) throw new AppError('SERVER_PERMISSION_DENIED', 403);
    const targetPermissions = await this.channelPermissionsFor(server, channel, targetUser);
    if (!targetPermissions.has('CONNECT_VOICE')) throw new AppError('SERVER_PERMISSION_DENIED', 403);
    if (!channel.livekitRoomName) throw new AppError('CHANNEL_NOT_FOUND', 404);

    let seamlesslyMoved = false;
    try {
      await this.media.createRoom({ id: channel.id, ownerUserId: server.ownerUserId, name: channel.livekitRoomName, maxParticipants: 25 });
      for (const candidate of await this.store.listServerChannels(server.id)) {
        if (candidate.type !== 'voice' || !candidate.livekitRoomName || candidate.id === channel.id) continue;
        for (const identity of (await this.media.participantIdentities(candidate.livekitRoomName)).filter((value) => value.startsWith(`user_${memberUserId}_`))) {
          try {
            await this.media.moveParticipant(candidate.livekitRoomName, identity, channel.livekitRoomName, {
              canPublishMicrophone: targetPermissions.has('SPEAK'),
              canPublishScreen: targetPermissions.has('STREAM_SCREEN'),
              canPublishScreenAudio: targetPermissions.has('STREAM_APPLICATION_AUDIO'),
            });
            seamlesslyMoved = true;
          } catch {
            // Older LiveKit servers may not support native moves; the target client will reconnect from the command below.
            await this.media.removeParticipant(candidate.livekitRoomName, identity);
          }
          await this.store.releaseChannelLeaseByParticipant(identity);
        }
      }
    } catch {
      // The target client will disconnect its previous room before accepting the move.
    }
    this.pendingVoiceMoves.set(memberUserId, { channelId: channel.id, expiresAt: new Date(this.now().getTime() + 60_000), seamlesslyMoved });
    await this.recordServerAudit(server.id, actor, 'MEMBER_VOICE_MOVED', 'MEMBER', memberUserId, null, { channelId: channel.id, channelName: channel.name });
  }

  async pollVoiceMemberMove(authorization: string | undefined): Promise<RoomConnection | null> {
    const user = await this.authenticate(authorization);
    const pending = this.pendingVoiceMoves.get(user.id);
    if (!pending) return null;
    if (pending.expiresAt.getTime() <= this.now().getTime()) {
      this.pendingVoiceMoves.delete(user.id);
      return null;
    }
    const connection = await this.connectVoiceChannel(authorization, pending.channelId);
    this.pendingVoiceMoves.delete(user.id);
    return { ...connection, seamlesslyMoved: pending.seamlesslyMoved };
  }

  async kickChannelParticipant(authorization: string | undefined, channelId: string, participantIdentity: string): Promise<void> {
    const user = await this.authenticate(authorization);
    const channel = await this.requireVoiceChannel(channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireChannelPermission(server, channel, user, 'MUTE_MEMBERS');
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
    const { channel, displayName } = await this.validateChannelMediaParticipant(authorization, channelId, participantIdentity, 'STREAM_SCREEN');
    const result = await this.store.claimChannelLease(channel.id, participantIdentity, displayName, this.now(), this.config.SCREEN_SHARE_LEASE_SECONDS);
    if (result.status === 'busy') throw new AppError('SCREEN_SHARE_BUSY', 409, undefined, { participantDisplayName: result.lease.participantDisplayName });
    return { expiresAt: result.lease.expiresAt.toISOString() };
  }

  async heartbeatChannelScreenShare(authorization: string | undefined, channelId: string, participantIdentity: string): Promise<{ expiresAt: string }> {
    await this.validateChannelMediaParticipant(authorization, channelId, participantIdentity, 'STREAM_SCREEN');
    const lease = await this.store.heartbeatChannelLease(channelId, participantIdentity, this.now(), this.config.SCREEN_SHARE_LEASE_SECONDS);
    if (!lease) throw new AppError('SCREEN_SHARE_BUSY', 409, 'Право на демонстрацию экрана утрачено');
    return { expiresAt: lease.expiresAt.toISOString() };
  }

  async releaseChannelScreenShare(authorization: string | undefined, channelId: string, participantIdentity: string): Promise<void> {
    const user = await this.authenticate(authorization);
    const channel = await this.requireVoiceChannel(channelId);
    await this.requireChannelPermission(await this.requireServer(channel.serverId), channel, user, 'STREAM_SCREEN');
    if (!participantIdentity.startsWith(`user_${user.id}_`)) throw new AppError('UNAUTHORIZED', 401);
    await this.store.releaseChannelLease(channelId, participantIdentity);
  }

  async handleWebhookEvent(event: { event?: string; participant?: { identity?: string }; room?: { metadata?: string }; track?: { source?: TrackSource } }): Promise<void> {
    const identity = event.participant?.identity;
    if ((event.event === 'participant_left' || (event.event === 'track_unpublished' && event.track?.source === TrackSource.SCREEN_SHARE)) && identity) {
      await this.store.releaseChannelLeaseByParticipant(identity);
    }
    if (event.event === 'room_finished' && event.room?.metadata) {
      try {
        const metadata = JSON.parse(event.room.metadata) as { appChannelId?: string };
        if (metadata.appChannelId) await this.store.releaseChannelLeaseByChannel(metadata.appChannelId);
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
      trustedAt: null,
      expiresAt: expiresAt(now, this.config.REFRESH_TOKEN_TTL_DAYS * 86_400),
      revokedAt: null,
      replacedBySessionId: null,
      createdAt: now,
      lastUsedAt: now,
    };
    await this.store.createSession(session);
    await this.recordSecurityEvent(user, 'SESSION_CREATED', deviceName, 'Новый вход в аккаунт', `Выполнен вход с устройства «${deviceName}».`);
    return {
      accessToken: await issueAccessToken({ userId: user.id, sessionId: session.id }, this.config),
      refreshToken,
      expiresIn: this.config.ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  private async replaceRecoveryCodes(userId: string): Promise<string[]> {
    const now = this.now();
    const codes = Array.from({ length: 10 }, () => randomRecoveryCode());
    const records: RecoveryCodeRecord[] = codes.map((code) => ({
      id: randomUUID(),
      userId,
      codeHash: hashOpaqueToken(code),
      createdAt: now,
      usedAt: null,
    }));
    await this.store.replaceRecoveryCodes(userId, records);
    return codes;
  }

  private async recordSecurityEvent(
    user: UserRecord,
    type: SecurityEventType,
    deviceName: string | null,
    title: string,
    message: string,
  ): Promise<void> {
    const event: SecurityEventRecord = { id: randomUUID(), userId: user.id, type, deviceName, createdAt: this.now() };
    await this.store.createSecurityEvent(event);
    try {
      await this.mailer.sendSecurityNotice(user.email, title, message);
    } catch {
      // The in-app audit event is authoritative; SMTP outages must not break security actions.
    }
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

  private async requireDirectConversation(id: string, userId: string): Promise<DirectConversationRecord> {
    const conversation = await this.store.findDirectConversation(id);
    if (!conversation || (conversation.userAId !== userId && conversation.userBId !== userId)) throw new AppError('DIRECT_CONVERSATION_NOT_FOUND', 404);
    return conversation;
  }

  private async requireVoiceChannel(id: string): Promise<ServerChannelRecord> {
    const channel = await this.requireServerChannel(id);
    if (channel.type !== 'voice') throw new AppError('CHANNEL_NOT_FOUND', 404);
    return channel;
  }

  private async serverPermissionsFor(server: ServerRecord, user: UserRecord): Promise<Set<ServerPermission>> {
    if (server.ownerUserId === user.id) return new Set(serverPermissions);
    if (!(await this.store.findServerMember(server.id, user.id))) return new Set();
    const [roles, roleIds] = await Promise.all([this.store.listServerRoles(server.id), this.store.listMemberRoleIds(server.id, user.id)]);
    return resolveServerPermissions({ isOwner: false, userId: user.id, roles, assignedRoleIds: roleIds });
  }

  private async channelPermissionsFor(server: ServerRecord, channel: ServerChannelRecord, user: UserRecord): Promise<Set<ServerPermission>> {
    if (!(await this.store.findServerMember(server.id, user.id))) return new Set();
    const [roles, roleIds, overwrites] = await Promise.all([
      this.store.listServerRoles(server.id),
      this.store.listMemberRoleIds(server.id, user.id),
      this.store.listChannelPermissionOverwrites([channel.id]),
    ]);
    return resolveChannelPermissions({
      isOwner: server.ownerUserId === user.id,
      userId: user.id,
      roles,
      assignedRoleIds: roleIds,
      overwrites: overwrites.map((overwrite) => ({ channelId: overwrite.channelId, targetType: overwrite.targetType, targetId: overwrite.targetId, allow: overwrite.allow, deny: overwrite.deny })),
    });
  }

  private async serverRolePositionFor(server: ServerRecord, user: UserRecord, roles: ServerRoleRecord[]): Promise<number> {
    const assigned = new Set(await this.store.listMemberRoleIds(server.id, user.id));
    return highestRolePosition(server.ownerUserId === user.id, roles, assigned);
  }

  private async recordUserActivity(
    userId: string,
    type: HomeActivityType,
    title: string,
    context: string,
    serverId: string | null,
    channelId: string | null,
  ): Promise<void> {
    try {
      await this.store.createUserActivity({ id: randomUUID(), userId, type, title, context, serverId, channelId, createdAt: this.now() });
    } catch {
      // Activity is a secondary dashboard signal and must never block calls or messages.
    }
  }

  private async requireServerPermission(server: ServerRecord, user: UserRecord, permission: ServerPermission): Promise<Set<ServerPermission>> {
    const permissions = await this.serverPermissionsFor(server, user);
    if (!permissions.has(permission)) throw new AppError('SERVER_PERMISSION_DENIED', 403);
    return permissions;
  }

  private async requireChannelPermission(server: ServerRecord, channel: ServerChannelRecord, user: UserRecord, permission: ServerPermission): Promise<Set<ServerPermission>> {
    const permissions = await this.channelPermissionsFor(server, channel, user);
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
    const membership = members.find((member) => member.userId === user.id);
    if (!membership) throw new AppError('SERVER_PERMISSION_DENIED', 403);
    const overwrites = await this.store.listChannelPermissionOverwrites(channels.map((channel) => channel.id));
    const currentRoleIds = assignments.filter((assignment) => assignment.userId === user.id).map((assignment) => assignment.roleId);
    const effectiveByChannel = new Map(channels.map((channel) => [channel.id, resolveChannelPermissions({
      isOwner: server.ownerUserId === user.id,
      userId: user.id,
      roles,
      assignedRoleIds: currentRoleIds,
      overwrites: overwrites.filter((overwrite) => overwrite.channelId === channel.id).map((overwrite) => ({ channelId: overwrite.channelId, targetType: overwrite.targetType, targetId: overwrite.targetId, allow: overwrite.allow, deny: overwrite.deny })),
    })]));
    const visibleChannels = channels.filter((channel) => effectiveByChannel.get(channel.id)?.has('VIEW_CHANNEL') === true);
    const unreadCounts = new Map((await this.store.listChannelUnreadCounts(visibleChannels.filter((channel) => channel.type === 'text').map((channel) => channel.id), user.id, membership.joinedAt)).map((entry) => [entry.channelId, entry.count]));
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
    const voiceParticipantsByChannel = new Map<string, VoiceChannelParticipant[]>();
    await Promise.all(visibleChannels.filter((channel) => channel.type === 'voice' && channel.livekitRoomName).map(async (channel) => {
      let identities: string[] = [];
      try {
        identities = await this.media.participantIdentities(channel.livekitRoomName!);
      } catch {
        // Server navigation remains available while LiveKit is temporarily unavailable.
      }
      const participants = new Map<string, VoiceChannelParticipant>();
      for (const identity of identities) {
        const member = publicMembers.find((candidate) => identity.startsWith(`user_${candidate.userId}_`));
        if (member && !participants.has(member.userId)) participants.set(member.userId, { identity, userId: member.userId, displayName: member.displayName, platformRole: member.platformRole });
      }
      voiceParticipantsByChannel.set(channel.id, [...participants.values()]);
    }));
    return {
      id: server.id,
      name: server.name,
      inviteUrl: this.inviteUrl(server.inviteToken),
      ownerUserId: server.ownerUserId,
      memberCount: members.length,
      createdAt: server.createdAt.toISOString(),
      channels: visibleChannels.map((channel) => publicServerChannel(
        channel,
        unreadCounts.get(channel.id) ?? 0,
        [...(effectiveByChannel.get(channel.id) ?? [])],
        permissions.has('MANAGE_ROLES') ? overwrites.filter((overwrite) => overwrite.channelId === channel.id).map((overwrite) => ({ channelId: overwrite.channelId, targetType: overwrite.targetType, targetId: overwrite.targetId, allow: overwrite.allow, deny: overwrite.deny })) : undefined,
        channel.type === 'voice' ? voiceParticipantsByChannel.get(channel.id) ?? [] : undefined,
      )),
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
    await this.requireChannelPermission(await this.requireServer(channel.serverId), channel, user, permission);
    if (!participantIdentity.startsWith(`user_${user.id}_`)) throw new AppError('UNAUTHORIZED', 401);
    try {
      if (!channel.livekitRoomName || !(await this.media.participantExists(channel.livekitRoomName, participantIdentity))) throw new AppError('PARTICIPANT_NOT_FOUND', 404);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('LIVEKIT_UNAVAILABLE', 503);
    }
    return { channel, displayName: user.displayName, user };
  }

  private async recordServerAudit(serverId: string, actor: UserRecord, action: string, targetType: string, targetId: string | null, before: unknown, after: unknown): Promise<void> {
    await this.store.createServerAuditLog({
      id: randomUUID(),
      serverId,
      actorUserId: actor.id,
      action,
      targetType,
      targetId,
      before,
      after,
      createdAt: this.now(),
    });
  }

  private requireCompleteProfile(user: UserRecord): asserts user is UserRecord & { displayName: string } {
    if (!user.displayName) throw new AppError('PROFILE_INCOMPLETE', 409);
  }

}
