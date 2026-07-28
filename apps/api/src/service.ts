import { createHash, randomBytes, randomUUID } from "node:crypto";

import { errors as joseErrors } from "jose";
import { TrackSource } from "livekit-server-sdk";

import {
  type AuthResponse,
  type ApiErrorCode,
  type PasswordLoginChallenge,
  type PublicUser,
  type PublicServerSummary,
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
  type MessageMention,
  type MessageMentionInput,
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
  type UserPresence,
  type UserPrivacySettings,
  type PresencePreference,
  type DirectMessagePrivacy,
  type PresenceVisibility,
  type ConversationMessage,
  type ConversationMessagePage,
  type ConversationReadState,
  type ConversationMemberReadState,
  type ConversationSummary,
  type InternalNotification,
  type UserUnreadSummary,
  type UserNotificationPreferences,
  type ServerNotificationPreferences,
  type ConversationNotificationPreferences,
  type BlockedUserSettings,
  type UserAccountSettings,
  type UserProfileSettings,
  type CreatedServerInvite,
  type ServerAppearanceSettings,
  type ServerAuditLogPage,
  type ServerBanSettings,
  type ServerChannelCategory,
  type ServerChannelSettings,
  type ServerInviteSettings,
  type ServerModerationSettings,
  type ServerOverviewSettings,
  type ServerSettingsMember,
  type MoveVoiceMemberAccepted,
  type MoveVoiceMemberRequest,
  type ServerVoiceStateDto,
  type UpdateOwnVoiceStateRequest,
  type RealtimeEventType,
  serverPermissions,
  highestRolePosition,
  resolveChannelPermissions,
  resolveServerPermissions,
  expiresAt,
  isExpired,
  codePointLength,
  codePointSlice,
} from "@vatrushka/shared";

import { AppError } from "./app-error.js";
import type { AppConfig } from "./config.js";
import type {
  AuthCodeRecord,
  DirectConversationOverviewRecord,
  DirectConversationRecord,
  DirectMessageAttachmentMetadata,
  DirectMessageAttachmentRecord,
  DirectMessageWithAuthor,
  MessageAttachmentMetadata,
  MessageAttachmentRecord,
  MessageMentionRecord,
  MessageMentionWithUser,
  MessageNotificationRecord,
  MessageReactionSummary,
  RecoveryCodeRecord,
  SecurityEventRecord,
  ServerChannelRecord,
  ServerRecord,
  ServerRoleRecord,
  SessionRecord,
  TextMessageWithAuthor,
  UserRecord,
} from "./domain.js";
import type {
  DataStore,
  Mailer,
  MediaService,
  ObjectStorage,
  PresenceStore,
} from "./ports.js";
import { attachmentObjectKey } from "./services/attachment-objects.js";
import { MemoryPresenceStore } from "./services/presence-store.js";
import {
  MemoryVoicePresenceStore,
  type PendingVoiceMove,
  type VoicePresenceStore,
  type VoiceSession,
} from "./services/voice-presence-store.js";
import type {
  CanonicalMentionInput,
  CanonicalMessagingStore,
} from "./services/canonical-messaging.js";
import type { RedisRealtimeBus } from "./services/realtime.js";
import type {
  ServerModerationUpdate,
  ServerOverviewUpdate,
  ServerSettingsStore,
} from "./services/server-settings.js";
import type { IdentitySettingsStore } from "./services/identity-settings.js";
import { technicalMetrics } from "./services/metrics.js";
import {
  createVoiceTransportAdapter,
  type VoiceTransportAdapter,
} from "./services/voice-transport.js";
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
} from "./security.js";

export interface ServiceDependencies {
  config: AppConfig;
  store: DataStore;
  mailer: Mailer;
  media: MediaService;
  objectStorage?: ObjectStorage | null;
  presenceStore?: PresenceStore;
  voicePresenceStore?: VoicePresenceStore;
  voiceTransport?: VoiceTransportAdapter;
  canonicalMessagingStore?: CanonicalMessagingStore;
  realtimeBus?: RedisRealtimeBus | null;
  serverSettingsStore?: ServerSettingsStore;
  identitySettingsStore?: IdentitySettingsStore;
  clock?: () => Date;
}

const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LIVEKIT_METRIC_EVENTS = new Set([
  "participant_joined",
  "participant_left",
  "participant_connection_aborted",
  "track_published",
  "track_unpublished",
  "room_finished",
]);

function liveKitMetricEvent(event: string | undefined): string {
  return event && LIVEKIT_METRIC_EVENTS.has(event) ? event : "other";
}

function randomRecoveryCode(): string {
  const bytes = randomBytes(12);
  const characters = [...bytes].map(
    (byte) => RECOVERY_CODE_ALPHABET[byte % RECOVERY_CODE_ALPHABET.length],
  );
  return `${characters.slice(0, 4).join("")}-${characters.slice(4, 8).join("")}-${characters.slice(8, 12).join("")}`;
}

function publicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    platformRole: user.platformRole,
    hasPassword: Boolean(user.passwordHash),
    twoFactorEnabled: user.twoFactorEnabled,
    avatarUrl: null,
  };
}

const DEFAULT_SERVER_PERMISSIONS: ServerPermission[] = [
  "VIEW_SERVER",
  "VIEW_CHANNEL",
  "READ_MESSAGE_HISTORY",
  "SEND_MESSAGES",
  "SEND_ATTACHMENTS",
  "ADD_REACTIONS",
  "EMBED_LINKS",
  "MANAGE_OWN_MESSAGES",
  "CONNECT_VOICE",
  "SPEAK",
  "STREAM_VIDEO",
  "STREAM_SCREEN",
  "STREAM_APPLICATION_AUDIO",
  "MANAGE_INVITES",
];

function publicServerRole(role: ServerRoleRecord): ServerRole {
  return {
    id: role.id,
    serverId: role.serverId,
    name: role.name,
    color: role.color,
    position: role.position,
    isDefault: role.isDefault,
    kind: role.kind,
    permissions: role.permissions,
  };
}

function publicServerChannel(
  channel: ServerChannelRecord,
  unreadCount = 0,
  mentionCount = 0,
  permissions?: ServerPermission[],
  permissionOverwrites?: ChannelPermissionOverwrite[],
  voiceParticipants?: VoiceChannelParticipant[],
): ServerChannel {
  return {
    id: channel.id,
    serverId: channel.serverId,
    name: channel.name,
    type: channel.type,
    position: channel.position,
    unreadCount,
    mentionCount,
    ...(voiceParticipants === undefined ? {} : { voiceParticipants }),
    ...(permissions === undefined ? {} : { permissions }),
    ...(permissionOverwrites === undefined ? {} : { permissionOverwrites }),
  };
}

export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 4;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "application/zip",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);

function safeAttachmentName(fileName: string): string {
  const normalized = fileName
    .normalize("NFKC")
    .replace(/[\\/]/gu, "_")
    .trim()
    .slice(0, 180);
  const printable = [...normalized]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= 32 && codePoint !== 127;
    })
    .join("");
  return printable || "attachment";
}

function mediaUrl(objectKey: string | null | undefined): string | null {
  return objectKey
    ? `/api/v1/media/${encodeURIComponent(objectKey)}`
    : null;
}

function publicTextMessage(
  message: TextMessageWithAuthor,
  replyTo: TextMessageWithAuthor | null,
  reactions: MessageReactionSummary[],
  attachments: MessageAttachmentMetadata[],
  mentions: MessageMentionWithUser[],
): TextMessage {
  return {
    id: message.id,
    channelId: message.channelId,
    authorUserId: message.authorUserId,
    authorDisplayName: message.displayName ?? "Участник",
    authorAvatarUrl: mediaUrl(message.avatarObjectKey),
    authorPlatformRole: message.platformRole,
    content: message.content,
    mentions: mentions.map(
      ({ mentionedUserId, start, length, displayName }): MessageMention => ({
        userId: mentionedUserId,
        start,
        length,
        displayName: displayName ?? "Удалённый участник",
      }),
    ),
    replyTo:
      replyTo === null
        ? null
        : {
            messageId: replyTo.id,
            authorUserId: replyTo.authorUserId,
            authorDisplayName: replyTo.displayName ?? "Участник",
            content: replyTo.content,
          },
    reactions: reactions.map(({ emoji, count, reactedByCurrentUser }) => ({
      emoji,
      count,
      reactedByCurrentUser,
    })),
    attachments: attachments.map(
      ({ id, messageId, fileName, mimeType, size, createdAt }) => ({
        id,
        messageId,
        fileName,
        mimeType,
        size,
        createdAt: createdAt.toISOString(),
      }),
    ),
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
  };
}

function publicDirectMessage(
  message: DirectMessageWithAuthor,
  replyTo: DirectMessageWithAuthor | null,
  reactions: MessageReactionSummary[],
  attachments: DirectMessageAttachmentMetadata[],
): DirectMessage {
  return {
    id: message.id,
    conversationId: message.conversationId,
    authorUserId: message.authorUserId,
    authorDisplayName: message.displayName ?? "Участник",
    authorAvatarUrl: mediaUrl(message.avatarObjectKey),
    authorPlatformRole: message.platformRole,
    content: message.content,
    replyTo:
      replyTo === null
        ? null
        : {
            messageId: replyTo.id,
            authorUserId: replyTo.authorUserId,
            authorDisplayName: replyTo.displayName ?? "Участник",
            content: replyTo.content,
          },
    reactions: reactions.map(({ emoji, count, reactedByCurrentUser }) => ({
      emoji,
      count,
      reactedByCurrentUser,
    })),
    attachments: attachments.map(
      ({ id, messageId, fileName, mimeType, size, createdAt }) => ({
        id,
        messageId,
        fileName,
        mimeType,
        size,
        createdAt: createdAt.toISOString(),
      }),
    ),
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
  };
}

function publicDirectConversation(
  overview: DirectConversationOverviewRecord,
): DirectConversationSummary {
  return {
    id: overview.conversation.id,
    participant: {
      userId: overview.participant.id,
      displayName: overview.participant.displayName ?? "Участник",
      platformRole: overview.participant.platformRole,
      avatarUrl: mediaUrl(overview.participant.avatarObjectKey),
    },
    lastMessage:
      overview.lastMessage === null
        ? null
        : {
            ...overview.lastMessage,
            createdAt: overview.lastMessage.createdAt.toISOString(),
          },
    unreadCount: overview.unreadCount,
    createdAt: overview.conversation.createdAt.toISOString(),
    updatedAt: overview.conversation.updatedAt.toISOString(),
  };
}

export class VatrushkaService {
  readonly config: AppConfig;
  readonly store: DataStore;
  readonly media: MediaService;
  readonly objectStorage: ObjectStorage | null;
  readonly presenceStore: PresenceStore;
  readonly voicePresenceStore: VoicePresenceStore;
  readonly voiceTransport: VoiceTransportAdapter;
  readonly canonicalMessagingStore: CanonicalMessagingStore | null;
  readonly realtimeBus: RedisRealtimeBus | null;
  readonly serverSettingsStore: ServerSettingsStore | null;
  readonly identitySettingsStore: IdentitySettingsStore | null;
  private readonly mailer: Mailer;
  private readonly clock: () => Date;
  private readonly voiceMoveTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(dependencies: ServiceDependencies) {
    this.config = dependencies.config;
    this.store = dependencies.store;
    this.mailer = dependencies.mailer;
    this.media = dependencies.media;
    this.objectStorage = dependencies.objectStorage ?? null;
    this.presenceStore =
      dependencies.presenceStore ?? new MemoryPresenceStore();
    this.voicePresenceStore =
      dependencies.voicePresenceStore ?? new MemoryVoicePresenceStore();
    this.voiceTransport =
      dependencies.voiceTransport ??
      createVoiceTransportAdapter(dependencies.config, dependencies.media);
    this.canonicalMessagingStore = dependencies.canonicalMessagingStore ?? null;
    this.realtimeBus = dependencies.realtimeBus ?? null;
    this.serverSettingsStore = dependencies.serverSettingsStore ?? null;
    this.identitySettingsStore = dependencies.identitySettingsStore ?? null;
    this.clock = dependencies.clock ?? (() => new Date());
  }

  now(): Date {
    return this.clock();
  }

  private async publicMediaUrl(
    objectKey: string | null | undefined,
  ): Promise<string | null> {
    if (!objectKey) return null;
    if (!this.objectStorage) return mediaUrl(objectKey);
    if (this.config.MEDIA_CDN_BASE_URL && this.config.MEDIA_CDN_TOKEN_SECRET)
      return this.createCdnUrl(objectKey, 900);
    return this.objectStorage.createGetUrl(objectKey, 900);
  }

  private createCdnUrl(objectKey: string, expiresInSeconds: number): string {
    const tokenSecret = this.config.MEDIA_CDN_TOKEN_SECRET;
    const configuredBaseUrl = this.config.MEDIA_CDN_BASE_URL;
    if (!tokenSecret) throw new Error("CDN token secret is not configured");
    if (!configuredBaseUrl) throw new Error("CDN base URL is not configured");
    const baseUrl = configuredBaseUrl.replace(/\/$/u, "");
    const path = `/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
    const expires = Math.floor(this.now().getTime() / 1_000) + expiresInSeconds;
    const signature = createHash("md5")
      .update(`${tokenSecret}${path}${expires}`)
      .digest("base64")
      .replace(/\+/gu, "-")
      .replace(/\//gu, "_")
      .replace(/=/gu, "");
    return `${baseUrl}/md5(${signature},${expires})${path}`;
  }

  private async resolveMediaUrl(
    url: string | null | undefined,
  ): Promise<string | null> {
    if (!url || !url.startsWith("/api/v1/media/")) return url ?? null;
    return this.publicMediaUrl(
      decodeURIComponent(url.slice("/api/v1/media/".length)),
    );
  }

  private async resolveConversationMessage(
    message: ConversationMessage,
  ): Promise<ConversationMessage> {
    return {
      ...message,
      author: {
        ...message.author,
        avatarUrl: await this.resolveMediaUrl(message.author.avatarUrl),
      },
    };
  }

  inviteUrl(inviteToken: string): string {
    return new URL(
      `/i/${encodeURIComponent(inviteToken)}`,
      this.config.PUBLIC_INVITE_URL,
    ).toString();
  }

  private async prepareAttachmentContent(
    scope: "channels" | "direct",
    messageId: string,
    attachmentId: string,
    content: Buffer,
    mimeType: string,
  ): Promise<{ content: Buffer; storageKey: string | null }> {
    if (this.objectStorage === null) return { content, storageKey: null };
    const storageKey = attachmentObjectKey(
      this.config.S3_KEY_PREFIX,
      scope,
      messageId,
      attachmentId,
    );
    try {
      await this.objectStorage.putObject({
        key: storageKey,
        content,
        mimeType,
      });
    } catch {
      throw new AppError("MEDIA_STORAGE_UNAVAILABLE", 503);
    }
    return { content, storageKey };
  }

  private async resolveAttachmentContent(attachment: {
    content: Buffer;
    size: number;
    storageKey: string | null;
  }): Promise<Buffer> {
    if (attachment.storageKey === null || this.objectStorage === null)
      return attachment.content;
    try {
      const content = await this.objectStorage.getObject(attachment.storageKey);
      if (
        content.length !== attachment.size ||
        content.length > MAX_ATTACHMENT_BYTES
      )
        throw new Error("Stored attachment size does not match its metadata");
      return content;
    } catch {
      return attachment.content;
    }
  }

  private async deleteStoredObjects(
    storageKeys: Array<string | null>,
  ): Promise<void> {
    if (this.objectStorage === null) return;
    await Promise.allSettled(
      storageKeys.flatMap((storageKey) =>
        storageKey === null
          ? []
          : [this.objectStorage!.deleteObject(storageKey)],
      ),
    );
  }

  async requestRegistration(
    email: string,
    password: string,
    username: string,
  ): Promise<{ status: "CODE_SENT"; retryAfterSeconds: number }> {
    if (await this.store.findUserByEmail(email))
      throw new AppError("ACCOUNT_EXISTS", 409);
    if (await this.store.findUserByUsername(username))
      throw new AppError("VALIDATION_ERROR", 409, undefined, {
        field: "username",
        message: "Username уже занят",
      });
    return this.issueEmailCode(
      email,
      "registration",
      await hashPassword(password),
    );
  }

  async verifyRegistration(
    email: string,
    code: string,
    deviceName: string,
    username: string,
  ): Promise<AuthResponse> {
    if (await this.store.findUserByUsername(username))
      throw new AppError("VALIDATION_ERROR", 409, undefined, {
        field: "username",
        message: "Username уже занят",
      });
    const now = this.now();
    const authCode = await this.consumeEmailCode(
      email,
      code,
      "registration",
      "INVALID_OTP",
    );
    if (!authCode.credentialHash) throw new AppError("INVALID_OTP", 401);
    let user = await this.store.createUserWithPassword(
      email,
      authCode.credentialHash,
      username,
      now,
    );
    if (!user) {
      if (await this.store.findUserByUsername(username))
        throw new AppError("VALIDATION_ERROR", 409, undefined, {
          field: "username",
          message: "Username уже занят",
        });
      throw new AppError("ACCOUNT_EXISTS", 409);
    }
    user = await this.promotePlatformOwner(user, now);
    const tokens = await this.createSessionTokens(user, deviceName, now);
    return { ...tokens, user: publicUser(user), isNewUser: true };
  }

  async requestPasswordReset(
    email: string,
  ): Promise<{ status: "CODE_SENT"; retryAfterSeconds: number }> {
    // The same response and SMTP path are used for registered and unknown
    // addresses so the endpoint does not disclose whether an account exists.
    return this.issueEmailCode(email, "password_reset");
  }

  async completePasswordReset(
    email: string,
    code: string,
    password: string,
  ): Promise<{ status: "PASSWORD_RESET" }> {
    await this.consumeEmailCode(email, code, "password_reset", "INVALID_OTP");
    const user = await this.store.findUserByEmail(email);
    if (!user?.passwordHash) throw new AppError("INVALID_OTP", 401);
    const result = await this.store.resetPasswordAndRevokeSessions(
      user.id,
      await hashPassword(password),
      this.now(),
    );
    if (!result) throw new AppError("INVALID_OTP", 401);
    await Promise.allSettled(
      result.revokedSessionIds.map((sessionId) =>
        this.presenceStore.removeSession(user.id, sessionId),
      ),
    );
    await this.recordSecurityEvent(
      result.user,
      "PASSWORD_RESET",
      null,
      "Пароль восстановлен",
      "Пароль аккаунта был восстановлен по коду из письма. Все активные сессии завершены.",
    );
    return { status: "PASSWORD_RESET" };
  }

  async beginPasswordLogin(
    email: string,
    password: string,
    requestedFactor: "auto" | "email" | "totp" | "recovery",
  ): Promise<PasswordLoginChallenge> {
    const startedAt = performance.now();
    const user = await this.requireValidPassword(email, password);
    const factor =
      requestedFactor === "auto"
        ? user.twoFactorEnabled
          ? "totp"
          : "email"
        : requestedFactor;
    if (factor === "totp" || factor === "recovery") {
      if (!user.twoFactorEnabled || !user.totpSecretEncrypted)
        throw new AppError("TWO_FACTOR_NOT_CONFIGURED", 409);
      technicalMetrics.observeHistogram(
        "auth_login_challenge_duration_seconds",
        (performance.now() - startedAt) / 1_000,
        [0.05, 0.1, 0.25, 0.5, 1, 2],
        { factor },
      );
      return { status: "SECOND_FACTOR_REQUIRED", factor, retryAfterSeconds: 0 };
    }
    const result = await this.issueEmailCode(email, "password_login");
    technicalMetrics.observeHistogram(
      "auth_login_challenge_duration_seconds",
      (performance.now() - startedAt) / 1_000,
      [0.05, 0.1, 0.25, 0.5, 1, 2],
      { factor },
    );
    return {
      status: "SECOND_FACTOR_REQUIRED",
      factor,
      retryAfterSeconds: result.retryAfterSeconds,
    };
  }

  async completePasswordLogin(
    email: string,
    password: string,
    code: string,
    factor: "email" | "totp" | "recovery",
    deviceName: string,
  ): Promise<AuthResponse> {
    const user = await this.requireValidPassword(email, password);
    if (factor === "email") {
      await this.consumeEmailCode(
        email,
        code,
        "password_login",
        "INVALID_SECOND_FACTOR",
      );
    } else if (factor === "totp") {
      if (!user.twoFactorEnabled || !user.totpSecretEncrypted)
        throw new AppError("TWO_FACTOR_NOT_CONFIGURED", 409);
      let secret: string;
      try {
        secret = decryptCredential(
          user.totpSecretEncrypted,
          this.config.CREDENTIAL_ENCRYPTION_KEY,
        );
      } catch {
        throw new AppError("INTERNAL_ERROR", 500);
      }
      if (!verifyTotp(secret, code, this.now().getTime()))
        throw new AppError("INVALID_SECOND_FACTOR", 401);
    } else {
      if (
        !user.twoFactorEnabled ||
        !(await this.store.consumeRecoveryCode(
          user.id,
          hashOpaqueToken(code.toUpperCase()),
          this.now(),
        ))
      ) {
        throw new AppError("INVALID_SECOND_FACTOR", 401);
      }
    }
    const promoted = await this.promotePlatformOwner(user, this.now());
    const tokens = await this.createSessionTokens(
      promoted,
      deviceName,
      this.now(),
    );
    return { ...tokens, user: publicUser(promoted), isNewUser: false };
  }

  async requestPasswordSetup(
    authorization: string | undefined,
  ): Promise<{ status: "CODE_SENT"; retryAfterSeconds: number }> {
    const user = await this.authenticate(authorization);
    return this.issueEmailCode(user.email, "password_setup");
  }

  async setPassword(
    authorization: string | undefined,
    code: string,
    password: string,
  ): Promise<PublicUser> {
    const user = await this.authenticate(authorization);
    await this.consumeEmailCode(
      user.email,
      code,
      "password_setup",
      "INVALID_SECOND_FACTOR",
    );
    const updated = await this.store.updatePassword(
      user.id,
      await hashPassword(password),
      this.now(),
    );
    if (!updated) throw new AppError("UNAUTHORIZED", 401);
    await this.recordSecurityEvent(
      updated,
      "PASSWORD_CHANGED",
      null,
      "Пароль изменён",
      "Пароль вашего аккаунта был изменён.",
    );
    return publicUser(updated);
  }

  async beginTwoFactorSetup(
    authorization: string | undefined,
  ): Promise<TwoFactorSetup> {
    const user = await this.authenticate(authorization);
    if (!user.passwordHash) throw new AppError("PASSWORD_REQUIRED", 409);
    const secret = randomTotpSecret();
    const updated = await this.store.updateTwoFactor(
      user.id,
      encryptCredential(secret, this.config.CREDENTIAL_ENCRYPTION_KEY),
      false,
      this.now(),
    );
    if (!updated) throw new AppError("UNAUTHORIZED", 401);
    return {
      secret,
      otpauthUri: totpUri(secret, user.email, this.config.APP_NAME),
    };
  }

  async enableTwoFactor(
    authorization: string | undefined,
    code: string,
  ): Promise<TwoFactorEnableResult> {
    const user = await this.authenticate(authorization);
    if (!user.totpSecretEncrypted)
      throw new AppError("TWO_FACTOR_NOT_CONFIGURED", 409);
    const secret = decryptCredential(
      user.totpSecretEncrypted,
      this.config.CREDENTIAL_ENCRYPTION_KEY,
    );
    if (!verifyTotp(secret, code, this.now().getTime()))
      throw new AppError("INVALID_SECOND_FACTOR", 401);
    const updated = await this.store.updateTwoFactor(
      user.id,
      user.totpSecretEncrypted,
      true,
      this.now(),
    );
    if (!updated) throw new AppError("UNAUTHORIZED", 401);
    const recoveryCodes = await this.replaceRecoveryCodes(updated.id);
    await this.recordSecurityEvent(
      updated,
      "TWO_FACTOR_ENABLED",
      null,
      "Двухфакторная защита включена",
      "Для аккаунта включена двухфакторная аутентификация.",
    );
    return { user: publicUser(updated), recoveryCodes };
  }

  async disableTwoFactor(
    authorization: string | undefined,
    code: string,
  ): Promise<PublicUser> {
    const user = await this.authenticate(authorization);
    if (!user.twoFactorEnabled || !user.totpSecretEncrypted)
      throw new AppError("TWO_FACTOR_NOT_CONFIGURED", 409);
    const secret = decryptCredential(
      user.totpSecretEncrypted,
      this.config.CREDENTIAL_ENCRYPTION_KEY,
    );
    if (!verifyTotp(secret, code, this.now().getTime()))
      throw new AppError("INVALID_SECOND_FACTOR", 401);
    const updated = await this.store.updateTwoFactor(
      user.id,
      null,
      false,
      this.now(),
    );
    if (!updated) throw new AppError("UNAUTHORIZED", 401);
    await this.store.deleteRecoveryCodes(user.id);
    await this.recordSecurityEvent(
      updated,
      "TWO_FACTOR_DISABLED",
      null,
      "Двухфакторная защита отключена",
      "Для аккаунта отключена двухфакторная аутентификация.",
    );
    return publicUser(updated);
  }

  async regenerateRecoveryCodes(
    authorization: string | undefined,
    code: string,
  ): Promise<{ recoveryCodes: string[] }> {
    const user = await this.authenticate(authorization);
    if (!user.twoFactorEnabled || !user.totpSecretEncrypted)
      throw new AppError("TWO_FACTOR_NOT_CONFIGURED", 409);
    const secret = decryptCredential(
      user.totpSecretEncrypted,
      this.config.CREDENTIAL_ENCRYPTION_KEY,
    );
    if (!verifyTotp(secret, code, this.now().getTime()))
      throw new AppError("INVALID_SECOND_FACTOR", 401);
    const recoveryCodes = await this.replaceRecoveryCodes(user.id);
    await this.recordSecurityEvent(
      user,
      "RECOVERY_CODES_REGENERATED",
      null,
      "Резервные коды обновлены",
      "Старые резервные коды больше не действуют.",
    );
    return { recoveryCodes };
  }

  async refresh(
    refreshToken: string,
  ): Promise<Omit<AuthResponse, "isNewUser">> {
    const now = this.now();
    const replacementToken = randomOpaqueToken();
    const replacement: SessionRecord = {
      id: randomUUID(),
      userId: randomUUID(),
      tokenHash: hashOpaqueToken(replacementToken),
      tokenFamilyId: randomUUID(),
      deviceName: "rotated",
      trustedAt: null,
      expiresAt: expiresAt(now, this.config.REFRESH_TOKEN_TTL_DAYS * 86_400),
      revokedAt: null,
      replacedBySessionId: null,
      createdAt: now,
      lastUsedAt: now,
    };
    const rotation = await this.store.rotateSession(
      hashOpaqueToken(refreshToken),
      replacement,
      now,
    );
    if (rotation.status === "reused") {
      const user = await this.store.findUserById(rotation.session.userId);
      if (user)
        await this.recordSecurityEvent(
          user,
          "REFRESH_TOKEN_REUSE_DETECTED",
          rotation.session.deviceName,
          "Подозрительная активность сессии",
          "Повторно использован старый токен. Все токены этого устройства отозваны.",
        );
      throw new AppError("SESSION_REVOKED", 401);
    }
    if (rotation.status === "expired")
      throw new AppError("SESSION_EXPIRED", 401);
    if (rotation.status === "not_found")
      throw new AppError("UNAUTHORIZED", 401);
    const user = await this.store.findUserById(rotation.newSession.userId);
    if (!user) throw new AppError("UNAUTHORIZED", 401);
    if (!user.passwordHash) {
      await this.store.revokeSessionFamily(
        rotation.newSession.tokenFamilyId,
        now,
      );
      throw new AppError("SESSION_REVOKED", 401);
    }
    return {
      accessToken: await issueAccessToken(
        { userId: user.id, sessionId: rotation.newSession.id },
        this.config,
      ),
      refreshToken: replacementToken,
      expiresIn: this.config.ACCESS_TOKEN_TTL_SECONDS,
      user: publicUser(user),
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.store.revokeSessionByHash(
      hashOpaqueToken(refreshToken),
      this.now(),
    );
  }

  async authenticate(authorization: string | undefined): Promise<UserRecord> {
    return (await this.authenticateContext(authorization)).user;
  }

  private async authenticateContext(
    authorization: string | undefined,
  ): Promise<{ user: UserRecord; session: SessionRecord }> {
    if (!authorization?.startsWith("Bearer "))
      throw new AppError("UNAUTHORIZED", 401);
    try {
      const claims = await verifyAccessToken(
        authorization.slice("Bearer ".length),
        this.config,
      );
      const [user, session] = await Promise.all([
        this.store.findUserById(claims.userId),
        this.store.findSessionById(claims.sessionId),
      ]);
      if (!user || !user.passwordHash || !session || session.userId !== user.id)
        throw new AppError("UNAUTHORIZED", 401);
      if (session.revokedAt || isExpired(session.expiresAt, this.now()))
        throw new AppError("SESSION_REVOKED", 401);
      return { user, session };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof joseErrors.JWTExpired)
        throw new AppError("SESSION_EXPIRED", 401);
      throw new AppError("UNAUTHORIZED", 401);
    }
  }

  async listSessions(
    authorization: string | undefined,
  ): Promise<UserSession[]> {
    const { user, session: currentSession } =
      await this.authenticateContext(authorization);
    const rows = await this.store.listSessionsForUser(user.id);
    const latestByFamily = new Map<string, SessionRecord>();
    for (const row of rows) {
      const current = latestByFamily.get(row.tokenFamilyId);
      if (
        !current ||
        row.createdAt > current.createdAt ||
        (row.createdAt.getTime() === current.createdAt.getTime() &&
          current.revokedAt !== null &&
          row.revokedAt === null)
      ) {
        latestByFamily.set(row.tokenFamilyId, row);
      }
    }
    return [...latestByFamily.values()]
      .filter((row) => !row.revokedAt && !isExpired(row.expiresAt, this.now()))
      .sort(
        (left, right) => right.lastUsedAt.getTime() - left.lastUsedAt.getTime(),
      )
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

  async revokeSession(
    authorization: string | undefined,
    familyId: string,
  ): Promise<{ current: boolean }> {
    const { user, session } = await this.authenticateContext(authorization);
    const familySessions = (
      await this.store.listSessionsForUser(user.id)
    ).filter((candidate) => candidate.tokenFamilyId === familyId);
    const revoked = await this.store.revokeSessionFamilyForUser(
      user.id,
      familyId,
      this.now(),
    );
    if (!revoked) throw new AppError("SESSION_REVOKED", 404);
    const current = session.tokenFamilyId === familyId;
    await Promise.allSettled(
      familySessions.map((candidate) =>
        this.presenceStore.removeSession(user.id, candidate.id),
      ),
    );
    await this.recordSecurityEvent(
      user,
      "SESSION_REVOKED",
      null,
      "Сессия завершена",
      current
        ? "Текущая сессия была завершена."
        : "Одна из сессий вашего аккаунта была завершена.",
    );
    return { current };
  }

  async revokeOtherSessions(
    authorization: string | undefined,
  ): Promise<{ revokedCount: number }> {
    const { user, session } = await this.authenticateContext(authorization);
    const allSessions = await this.store.listSessionsForUser(user.id);
    const families = new Set(
      allSessions
        .filter(
          (candidate) =>
            candidate.tokenFamilyId !== session.tokenFamilyId &&
            !candidate.revokedAt &&
            !isExpired(candidate.expiresAt, this.now()),
        )
        .map((candidate) => candidate.tokenFamilyId),
    );
    await Promise.all(
      [...families].map((familyId) =>
        this.store.revokeSessionFamilyForUser(user.id, familyId, this.now()),
      ),
    );
    await Promise.allSettled(
      allSessions
        .filter((candidate) => families.has(candidate.tokenFamilyId))
        .map((candidate) =>
          this.presenceStore.removeSession(user.id, candidate.id),
        ),
    );
    if (families.size > 0)
      await this.recordSecurityEvent(
        user,
        "SESSION_REVOKED",
        null,
        "Другие сессии завершены",
        `Завершено сессий: ${families.size}.`,
      );
    return { revokedCount: families.size };
  }

  async setSessionTrusted(
    authorization: string | undefined,
    familyId: string,
    trusted: boolean,
  ): Promise<void> {
    const { user } = await this.authenticateContext(authorization);
    if (
      !(await this.store.setSessionFamilyTrusted(
        user.id,
        familyId,
        trusted ? this.now() : null,
      ))
    )
      throw new AppError("SESSION_REVOKED", 404);
  }

  async listSecurityEvents(
    authorization: string | undefined,
  ): Promise<SecurityEvent[]> {
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

  async updateMe(
    authorization: string | undefined,
    displayName: string,
  ): Promise<PublicUser> {
    const user = await this.authenticate(authorization);
    const updated = await this.store.updateDisplayName(
      user.id,
      displayName,
      this.now(),
    );
    if (!updated) throw new AppError("UNAUTHORIZED", 401);
    return publicUser(updated);
  }

  async getUserProfileSettings(
    authorization: string | undefined,
  ): Promise<UserProfileSettings> {
    const user = await this.authenticate(authorization);
    const profile = await this.identity().getProfile(user.id, async (key) =>
      (await this.publicMediaUrl(key)) ?? "",
    );
    if (!profile) throw new AppError("PROFILE_INCOMPLETE", 409);
    return profile;
  }

  async updateUserProfileSettings(
    authorization: string | undefined,
    input: { displayName: string; username: string | null; bio: string | null },
  ): Promise<UserProfileSettings> {
    const user = await this.authenticate(authorization);
    const reserved = new Set([
      "admin",
      "administrator",
      "api",
      "bot",
      "everyone",
      "here",
      "moderator",
      "owner",
      "root",
      "security",
      "support",
      "system",
      "vatrushka",
    ]);
    if (input.username && reserved.has(input.username))
      throw new AppError("VALIDATION_ERROR", 400, undefined, {
        field: "username",
        message: "Этот username зарезервирован",
      });
    const before = await this.identity().getProfile(user.id, () =>
      Promise.resolve(""),
    );
    try {
      const result = await this.identity().updateProfile(
        user.id,
        input,
        this.now(),
      );
      if (!result.updated)
        throw new AppError("VALIDATION_ERROR", 409, undefined, {
          field: "username",
          message: "Username можно менять не чаще одного раза в 7 дней",
        });
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      )
        throw new AppError("VALIDATION_ERROR", 409, undefined, {
          field: "username",
          message: "Username уже занят",
        });
      throw error;
    }
    const current = await this.store.findUserById(user.id);
    if (current && before?.username !== input.username)
      await this.recordSecurityEvent(
        current,
        "USERNAME_CHANGED",
        null,
        "Username изменён",
        `Username аккаунта изменён на ${input.username ? `@${input.username}` : "пустое значение"}.`,
        true,
      );
    else if (current)
      await this.store.createSecurityEvent({
        id: randomUUID(),
        userId: current.id,
        type: "PROFILE_UPDATED",
        deviceName: null,
        createdAt: this.now(),
      });
    return this.getUserProfileSettings(authorization);
  }

  async createUserAvatarUploadIntent(
    authorization: string | undefined,
    input: { mimeType: string; sizeBytes: number },
  ): Promise<{
    objectKey: string;
    uploadUrl: string;
    headers: Record<string, string>;
    expiresAt: string;
  }> {
    const user = await this.authenticate(authorization);
    if (!this.objectStorage)
      throw new AppError("MEDIA_STORAGE_UNAVAILABLE", 503);
    if (!["image/jpeg", "image/png", "image/webp"].includes(input.mimeType))
      throw new AppError("ATTACHMENT_TYPE_NOT_ALLOWED", 415);
    if (input.sizeBytes > 5 * 1024 * 1024)
      throw new AppError("ATTACHMENT_TOO_LARGE", 413);
    const objectKey = `users/${user.id}/avatar/${randomUUID()}`;
    return {
      objectKey,
      uploadUrl: await this.objectStorage.createPutUrl(
        objectKey,
        input.mimeType,
        input.sizeBytes,
        900,
      ),
      headers: { "Content-Type": input.mimeType },
      expiresAt: expiresAt(this.now(), 900).toISOString(),
    };
  }

  async updateUserAvatar(
    authorization: string | undefined,
    objectKey: string | null,
  ): Promise<UserProfileSettings> {
    const user = await this.authenticate(authorization);
    const previous = await this.identity().getMediaObjectKeys(user.id);
    if (objectKey) {
      if (
        !this.objectStorage ||
        !objectKey.startsWith(`users/${user.id}/avatar/`)
      )
        throw new AppError("VALIDATION_ERROR", 400);
      await this.objectStorage.headObject(objectKey).catch(() => {
        throw new AppError("ATTACHMENT_NOT_FOUND", 404);
      });
    }
    if (!(await this.identity().updateAvatar(user.id, objectKey, this.now())))
      throw new AppError("UNAUTHORIZED", 401);
    await this.enqueueReplacedMediaCleanup(
      previous?.avatarObjectKey ?? null,
      objectKey,
      "replaced_user_avatar",
    );
    return this.getUserProfileSettings(authorization);
  }

  async createUserProfileCoverUploadIntent(
    authorization: string | undefined,
    input: { mimeType: string; sizeBytes: number },
  ): Promise<{
    objectKey: string;
    uploadUrl: string;
    headers: Record<string, string>;
    expiresAt: string;
  }> {
    const user = await this.authenticate(authorization);
    if (!this.objectStorage)
      throw new AppError("MEDIA_STORAGE_UNAVAILABLE", 503);
    if (!["image/jpeg", "image/png", "image/webp"].includes(input.mimeType))
      throw new AppError("ATTACHMENT_TYPE_NOT_ALLOWED", 415);
    if (input.sizeBytes > 12 * 1024 * 1024)
      throw new AppError("ATTACHMENT_TOO_LARGE", 413);
    const objectKey = `users/${user.id}/profile-cover/${randomUUID()}`;
    return {
      objectKey,
      uploadUrl: await this.objectStorage.createPutUrl(
        objectKey,
        input.mimeType,
        input.sizeBytes,
        900,
      ),
      headers: { "Content-Type": input.mimeType },
      expiresAt: expiresAt(this.now(), 900).toISOString(),
    };
  }

  async updateUserProfileCover(
    authorization: string | undefined,
    objectKey: string | null,
  ): Promise<UserProfileSettings> {
    const user = await this.authenticate(authorization);
    const previous = await this.identity().getMediaObjectKeys(user.id);
    if (objectKey) {
      if (
        !this.objectStorage ||
        !objectKey.startsWith(`users/${user.id}/profile-cover/`)
      )
        throw new AppError("VALIDATION_ERROR", 400);
      const metadata = await this.objectStorage
        .headObject(objectKey)
        .catch(() => {
          throw new AppError("ATTACHMENT_NOT_FOUND", 404);
        });
      if (
        metadata.size > 12 * 1024 * 1024 ||
        !metadata.mimeType ||
        !["image/jpeg", "image/png", "image/webp"].includes(metadata.mimeType)
      )
        throw new AppError("ATTACHMENT_TYPE_NOT_ALLOWED", 415);
    }
    if (
      !(await this.identity().updateProfileCover(
        user.id,
        objectKey,
        this.now(),
      ))
    )
      throw new AppError("UNAUTHORIZED", 401);
    await this.enqueueReplacedMediaCleanup(
      previous?.profileCoverObjectKey ?? null,
      objectKey,
      "replaced_profile_cover",
    );
    return this.getUserProfileSettings(authorization);
  }

  async requestEmailChange(
    authorization: string | undefined,
    input: { email: string; password: string; totpCode: string | null },
  ): Promise<{ status: "CODE_SENT"; retryAfterSeconds: number }> {
    const user = await this.authenticate(authorization);
    await this.requireDangerReauthentication(user, input);
    if (input.email === user.email)
      throw new AppError("VALIDATION_ERROR", 400, undefined, {
        field: "email",
        message: "Это уже текущий email",
      });
    if (await this.store.findUserByEmail(input.email))
      throw new AppError("ACCOUNT_EXISTS", 409);
    const code = randomOtp();
    const now = this.now();
    try {
      await this.identity().createPendingEmailChange({
        id: randomUUID(),
        userId: user.id,
        newEmail: input.email,
        codeHash: hashOtp(input.email, code, this.config.OTP_PEPPER),
        expiresAt: expiresAt(now, this.config.OTP_TTL_SECONDS),
        now,
      });
      await this.mailer.sendOtp(
        input.email,
        code,
        Math.ceil(this.config.OTP_TTL_SECONDS / 60),
        "email_change",
      );
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      )
        throw new AppError("ACCOUNT_EXISTS", 409);
      await this.identity()
        .discardPendingEmailChange(user.id, input.email)
        .catch(() => undefined);
      throw new AppError("EMAIL_DELIVERY_FAILED", 502);
    }
    return { status: "CODE_SENT", retryAfterSeconds: 60 };
  }

  async confirmEmailChange(
    authorization: string | undefined,
    code: string,
  ): Promise<PublicUser> {
    const user = await this.authenticate(authorization);
    const account = await this.identity().getAccount(user.id);
    if (!account?.pendingEmail) throw new AppError("INVALID_OTP", 401);
    let email: string | null;
    try {
      email = await this.identity().confirmEmailChange(
        user.id,
        hashOtp(account.pendingEmail, code, this.config.OTP_PEPPER),
        this.now(),
      );
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      )
        throw new AppError("ACCOUNT_EXISTS", 409);
      throw error;
    }
    if (!email) throw new AppError("INVALID_OTP", 401);
    const updated = await this.store.findUserById(user.id);
    if (!updated) throw new AppError("UNAUTHORIZED", 401);
    await this.recordSecurityEvent(
      updated,
      "EMAIL_CHANGED",
      null,
      "Email изменён",
      `Email аккаунта изменён на ${email}.`,
    );
    return publicUser(updated);
  }

  async listBlockedUsers(
    authorization: string | undefined,
  ): Promise<BlockedUserSettings[]> {
    return this.identity().listBlockedUsers(
      (await this.authenticate(authorization)).id,
    );
  }

  async blockUser(
    authorization: string | undefined,
    blockedUserId: string,
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    if (!(await this.identity().blockUser(user.id, blockedUserId, this.now())))
      throw new AppError("VALIDATION_ERROR", 409);
  }

  async unblockUser(
    authorization: string | undefined,
    blockedUserId: string,
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    if (!(await this.identity().unblockUser(user.id, blockedUserId)))
      throw new AppError("VALIDATION_ERROR", 404);
  }

  async getUserAccountSettings(
    authorization: string | undefined,
  ): Promise<UserAccountSettings> {
    const account = await this.identity().getAccount(
      (await this.authenticate(authorization)).id,
    );
    if (!account) throw new AppError("UNAUTHORIZED", 401);
    return account;
  }

  async scheduleAccountDeactivation(
    authorization: string | undefined,
    reauthentication: { password: string; totpCode: string | null },
  ): Promise<UserAccountSettings> {
    const user = await this.authenticate(authorization);
    await this.requireDangerReauthentication(user, reauthentication);
    if (!(await this.identity().scheduleDeactivation(user.id, this.now())))
      throw new AppError("VALIDATION_ERROR", 409, undefined, {
        field: "servers",
        message: "Сначала передайте владение своими серверами",
      });
    await this.recordSecurityEvent(
      user,
      "ACCOUNT_DEACTIVATION_SCHEDULED",
      null,
      "Удаление аккаунта запланировано",
      "Аккаунт будет анонимизирован через 14 дней. До этого момента удаление можно отменить.",
    );
    return this.getUserAccountSettings(authorization);
  }

  async cancelAccountDeactivation(
    authorization: string | undefined,
  ): Promise<UserAccountSettings> {
    const user = await this.authenticate(authorization);
    if (!(await this.identity().cancelDeactivation(user.id, this.now())))
      throw new AppError("VALIDATION_ERROR", 409);
    await this.recordSecurityEvent(
      user,
      "ACCOUNT_DEACTIVATION_CANCELLED",
      null,
      "Удаление аккаунта отменено",
      "Запланированная анонимизация аккаунта отменена.",
    );
    return this.getUserAccountSettings(authorization);
  }

  async exportPersonalData(
    authorization: string | undefined,
  ): Promise<Record<string, unknown>> {
    const data = await this.identity().exportPersonalData(
      (await this.authenticate(authorization)).id,
    );
    if (!data) throw new AppError("UNAUTHORIZED", 401);
    return data;
  }

  private async currentUserRecord(user: UserRecord): Promise<UserRecord> {
    if (
      user.customStatusExpiresAt === null ||
      user.customStatusExpiresAt > this.now()
    )
      return user;
    return (
      (await this.store.updatePresence(
        user.id,
        {
          preference: user.presencePreference,
          customText: null,
          customTextExpiresAt: null,
        },
        this.now(),
      )) ?? user
    );
  }

  private async publicPresence(user: UserRecord): Promise<UserPresence> {
    const current = await this.currentUserRecord(user);
    let ephemeral: "online" | "idle" | "offline" = "offline";
    try {
      ephemeral = await this.presenceStore.status(current.id, this.now());
    } catch {
      // Presence fails closed: storage outages never expose a stale online state.
    }
    const effectiveStatus =
      ephemeral === "offline"
        ? "offline"
        : current.presencePreference === "invisible"
          ? "offline"
          : current.presencePreference === "do_not_disturb"
            ? "dnd"
            : current.presencePreference === "idle" || ephemeral === "idle"
              ? "idle"
              : "online";
    return {
      preference: current.presencePreference,
      effectiveStatus,
      customText: current.customStatusText,
      customTextExpiresAt: current.customStatusExpiresAt?.toISOString() ?? null,
      updatedAt: current.updatedAt.toISOString(),
    };
  }

  async getPresence(authorization: string | undefined): Promise<UserPresence> {
    return this.publicPresence(await this.authenticate(authorization));
  }

  async heartbeatPresence(
    authorization: string | undefined,
    idle: boolean,
  ): Promise<UserPresence> {
    const { user, session } = await this.authenticateContext(authorization);
    await this.presenceStore.heartbeat(
      user.id,
      session.id,
      idle,
      this.now(),
      this.config.PRESENCE_TTL_SECONDS,
    );
    const presence = await this.publicPresence(user);
    await this.broadcastPresence(user, presence);
    return presence;
  }

  async updatePresence(
    authorization: string | undefined,
    input: {
      preference: PresencePreference;
      customText: string | null;
      customTextExpiresAt: string | null;
    },
  ): Promise<UserPresence> {
    const user = await this.authenticate(authorization);
    const expiresAt =
      input.customText && input.customTextExpiresAt
        ? new Date(input.customTextExpiresAt)
        : null;
    const updated = await this.store.updatePresence(
      user.id,
      {
        preference: input.preference,
        customText: input.customText || null,
        customTextExpiresAt: expiresAt,
      },
      this.now(),
    );
    if (!updated) throw new AppError("UNAUTHORIZED", 401);
    const presence = await this.publicPresence(updated);
    await this.broadcastPresence(updated, presence);
    return presence;
  }

  private async broadcastPresence(
    user: UserRecord,
    presence: UserPresence,
  ): Promise<void> {
    if (!this.realtimeBus) return;
    const recipients = new Set<string>([user.id]);
    if (user.presenceVisibility === "shared_servers") {
      for (const server of await this.store.listServersForUser(user.id)) {
        for (const member of await this.store.listServerMembers(server.id))
          recipients.add(member.userId);
      }
    }
    await this.realtimeBus.publishPresence(user.id, [...recipients], {
      effectiveStatus: presence.effectiveStatus,
      customText:
        user.presenceVisibility === "shared_servers"
          ? presence.customText
          : null,
      customTextExpiresAt:
        user.presenceVisibility === "shared_servers"
          ? presence.customTextExpiresAt
          : null,
      updatedAt: presence.updatedAt,
    });
  }

  private async broadcastServerUpdate(
    serverId: string,
    type: RealtimeEventType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!this.realtimeBus) return;
    try {
      const targetUserIds = (await this.store.listServerMembers(serverId)).map(
        (member) => member.userId,
      );
      await this.realtimeBus.publish({
        id: randomUUID(),
        type,
        occurredAt: this.now().toISOString(),
        conversationId: null,
        targetUserIds,
        payload: { serverId, ...payload },
      });
    } catch {
      // Database updates are authoritative. A temporary Redis outage is healed
      // by the client's periodic refresh and must not roll back user changes.
    }
  }

  private async voiceRecipients(
    serverId: string,
    channelIds: string[],
    requireEveryChannel = true,
  ): Promise<string[]> {
    const server = await this.store.findServerById(serverId);
    if (!server) return [];
    const channels = (
      await Promise.all(
        channelIds.map((channelId) => this.store.findServerChannel(channelId)),
      )
    ).filter(
      (channel): channel is ServerChannelRecord =>
        Boolean(channel && channel.serverId === serverId),
    );
    if (channels.length !== channelIds.length) return [];
    const members = await this.store.listServerMembers(serverId);
    const recipients: string[] = [];
    for (const member of members) {
      const user = await this.store.findUserById(member.userId);
      if (!user) continue;
      const visibility = await Promise.all(
        channels.map(async (channel) =>
          (await this.channelPermissionsFor(server, channel, user)).has(
            "VIEW_CHANNEL",
          ),
        ),
      );
      if (
        requireEveryChannel
          ? visibility.every(Boolean)
          : visibility.some(Boolean)
      )
        recipients.push(user.id);
    }
    return recipients;
  }

  private async publishVoiceUpdate(
    serverId: string,
    channelIds: string[],
    type: RealtimeEventType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!this.realtimeBus) return;
    try {
      const targetUserIds = await this.voiceRecipients(serverId, channelIds);
      if (targetUserIds.length === 0) return;
      await this.realtimeBus.publish({
        id: randomUUID(),
        type,
        occurredAt: this.now().toISOString(),
        conversationId: null,
        targetUserIds,
        payload: { serverId, ...payload },
      });
    } catch {
      // Snapshot reconciliation heals a temporary realtime fanout failure.
    }
  }

  private async publishVoiceMoved(
    serverId: string,
    sourceChannelId: string,
    targetChannelId: string,
    payload: {
      movementId: string;
      userId: string;
      sessionId: string;
      version: number;
      channelName: string;
    },
  ): Promise<void> {
    if (!this.realtimeBus) return;
    try {
      const [sourceRecipients, targetRecipients] = await Promise.all([
        this.voiceRecipients(serverId, [sourceChannelId]),
        this.voiceRecipients(serverId, [targetChannelId]),
      ]);
      const source = new Set(sourceRecipients);
      const target = new Set(targetRecipients);
      const both = sourceRecipients.filter((userId) => target.has(userId));
      const sourceOnly = sourceRecipients.filter((userId) => !target.has(userId));
      const targetOnly = targetRecipients.filter((userId) => !source.has(userId));
      const publish = (
        type: RealtimeEventType,
        targetUserIds: string[],
        eventPayload: Record<string, unknown>,
      ) =>
        targetUserIds.length === 0
          ? Promise.resolve(true)
          : this.realtimeBus!.publish({
              id: randomUUID(),
              type,
              occurredAt: this.now().toISOString(),
              conversationId: null,
              targetUserIds,
              payload: { serverId, ...eventPayload },
            });
      await Promise.all([
        publish("voice.member.moved", both, {
          ...payload,
          fromChannelId: sourceChannelId,
          toChannelId: targetChannelId,
        }),
        publish("voice.member.left", sourceOnly, {
          channelId: sourceChannelId,
          userId: payload.userId,
          sessionId: payload.sessionId,
          version: payload.version,
        }),
        publish("voice.member.joined", targetOnly, {
          channelId: targetChannelId,
          userId: payload.userId,
          sessionId: payload.sessionId,
          version: payload.version,
        }),
      ]);
    } catch {
      // Snapshot reconciliation heals a temporary realtime fanout failure.
    }
  }

  async getPrivacySettings(
    authorization: string | undefined,
  ): Promise<UserPrivacySettings> {
    const user = await this.authenticate(authorization);
    return {
      directMessages: user.directMessagePrivacy,
      presenceVisibility: user.presenceVisibility,
      activityVisible: user.activityVisible,
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  async updatePrivacySettings(
    authorization: string | undefined,
    input: {
      directMessages: DirectMessagePrivacy;
      presenceVisibility: PresenceVisibility;
      activityVisible: boolean;
    },
  ): Promise<UserPrivacySettings> {
    const user = await this.authenticate(authorization);
    const updated = await this.store.updatePrivacySettings(
      user.id,
      {
        directMessagePrivacy: input.directMessages,
        presenceVisibility: input.presenceVisibility,
        activityVisible: input.activityVisible,
      },
      this.now(),
    );
    if (!updated) throw new AppError("UNAUTHORIZED", 401);
    return {
      directMessages: updated.directMessagePrivacy,
      presenceVisibility: updated.presenceVisibility,
      activityVisible: updated.activityVisible,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async listServers(
    authorization: string | undefined,
  ): Promise<ServerSummary[]> {
    const user = await this.authenticate(authorization);
    return Promise.all(
      (await this.store.listServersForUser(user.id)).map(async (server) => ({
        id: server.id,
        name: server.name,
        description: server.description ?? null,
        inviteUrl: this.inviteUrl(server.inviteToken),
        ownerUserId: server.ownerUserId,
        memberCount: server.memberCount,
        createdAt: server.createdAt.toISOString(),
        iconUrl: await this.publicMediaUrl(server.iconObjectKey),
        bannerUrl: await this.publicMediaUrl(server.bannerObjectKey),
        accentColor: server.accentColor ?? null,
        visibility: server.visibility ?? "private",
      })),
    );
  }

  async listPublicServers(
    authorization: string | undefined,
    input: { search?: string | undefined; limit: number; offset: number },
  ): Promise<PublicServerSummary[]> {
    const user = await this.authenticate(authorization);
    this.requireCompleteProfile(user);
    const rows = await this.settings().listPublicServers(
      user.id,
      input.search?.trim() || null,
      input.limit,
      input.offset,
      this.config.FEATURED_SERVER_ID || null,
    );
    const summaries = await Promise.all(
      rows.map(async (server) => ({
        id: server.id,
        name: server.name,
        description: server.description,
        iconUrl: await this.publicMediaUrl(server.iconObjectKey),
        bannerUrl: await this.publicMediaUrl(server.bannerObjectKey),
        accentColor: server.accentColor,
        memberCount: server.memberCount,
        featured: Boolean(
          this.config.FEATURED_SERVER_ID &&
          server.id === this.config.FEATURED_SERVER_ID,
        ),
        joined: server.joined,
      })),
    );
    return summaries.sort(
      (left, right) =>
        Number(right.featured) - Number(left.featured) ||
        left.name.localeCompare(right.name, "ru"),
    );
  }

  async joinPublicServer(
    authorization: string | undefined,
    serverId: string,
  ): Promise<ServerDetail> {
    const user = await this.authenticate(authorization);
    this.requireCompleteProfile(user);
    const server = await this.requireServer(serverId);
    if (server.visibility !== "public")
      throw new AppError("SERVER_NOT_FOUND", 404);
    if (!(await this.store.findServerMember(server.id, user.id))) {
      await this.store.addServerMember({
        serverId: server.id,
        userId: user.id,
        joinedAt: this.now(),
      });
      await this.recordUserActivity(
        user.id,
        "joined_server",
        server.name,
        "Вы присоединились к публичному серверу",
        server.id,
        null,
      );
      await this.broadcastServerUpdate(server.id, "server.updated", {
        action: "member_joined",
        userId: user.id,
      });
    }
    return this.getServerDetailForUser(server, user);
  }

  async getHomeDashboard(
    authorization: string | undefined,
  ): Promise<HomeDashboardResponse> {
    const user = await this.authenticate(authorization);
    const presence = await this.publicPresence(user);
    const serverRecords = await this.store.listServersForUser(user.id);
    const details = await Promise.all(
      serverRecords.map((server) => this.getServerDetailForUser(server, user)),
    );
    const activity = await this.store.listUserActivity(user.id, 5);
    let connection: HomeDashboardResponse["readiness"]["connection"] =
      "healthy";
    try {
      await this.media.healthCheck();
    } catch {
      connection = "degraded";
    }

    const lastActivityByChannel = new Map<string, Date>();
    for (const item of activity) {
      if (item.channelId && !lastActivityByChannel.has(item.channelId))
        lastActivityByChannel.set(item.channelId, item.createdAt);
    }

    const [voiceRuntime, directContacts] = await Promise.all([
      Promise.all(
        details.map(async (server) => {
          const [snapshot, channelSettings] = await Promise.all([
            this.voicePresenceStore
              .snapshot(server.id)
              .catch(() => ({
                serverId: server.id,
                version: 0,
                generatedAt: this.now().toISOString(),
                sessions: [],
              })),
            this.serverSettingsStore
              ? this.serverSettingsStore.listChannels(server.id).catch(() => [])
              : Promise.resolve([]),
          ]);
          return { server, snapshot, channelSettings };
        }),
      ),
      this.store.listDirectConversationOverviews(user.id),
    ]);
    const visibleMemberIds = new Set(
      details.flatMap((server) => server.members.map((member) => member.userId)),
    );
    const contactRecords = (
      await Promise.all(
        [
          ...new Set(
            directContacts.map((conversation) => conversation.participant.id),
          ),
        ].map((userId) => this.store.findUserById(userId)),
      )
    ).filter(
      (contact): contact is UserRecord =>
        contact !== null && visibleMemberIds.has(contact.id),
    );
    const contactIds = new Set(contactRecords.map((contact) => contact.id));
    const voiceSpaceByChannel = new Map<
      string,
      HomeDashboardResponse["gaming"]["activeSpaces"][number]
    >();
    const voiceChannelByUser = new Map<string, string>();

    for (const runtime of voiceRuntime) {
      const settingsByChannel = new Map(
        runtime.channelSettings.map((channel) => [channel.id, channel]),
      );
      const sessionsByChannel = new Map<string, typeof runtime.snapshot.sessions>();
      for (const session of runtime.snapshot.sessions) {
        const sessions = sessionsByChannel.get(session.channelId) ?? [];
        sessions.push(session);
        sessionsByChannel.set(session.channelId, sessions);
        voiceChannelByUser.set(session.userId, session.channelId);
      }
      const memberById = new Map(
        runtime.server.members.map((member) => [member.userId, member]),
      );
      for (const channel of runtime.server.channels) {
        if (channel.type !== "voice") continue;
        const channelSettings = settingsByChannel.get(channel.id);
        if (channelSettings?.archivedAt) continue;
        const sessions = sessionsByChannel.get(channel.id) ?? [];
        const fallbackParticipants = channel.voiceParticipants ?? [];
        const participantIds =
          sessions.length > 0
            ? sessions.map((session) => session.userId)
            : fallbackParticipants.map((participant) => participant.userId);
        const participantCount = new Set(participantIds).size;
        const participantLimit = channelSettings?.maxParticipants ?? null;
        const hasFreeSlots =
          participantLimit === null || participantCount < participantLimit;
        const lastActivityAt =
          sessions
            .map((session) => Date.parse(session.joinedAt))
            .filter(Number.isFinite)
            .sort((left, right) => right - left)[0] ??
          lastActivityByChannel.get(channel.id)?.getTime() ??
          Date.parse(runtime.server.createdAt);
        voiceSpaceByChannel.set(channel.id, {
          channelId: channel.id,
          serverId: runtime.server.id,
          serverName: runtime.server.name,
          serverIconUrl: runtime.server.iconUrl ?? null,
          serverAccentColor: runtime.server.accentColor ?? null,
          channelName: channel.name,
          gameName: null,
          coverUrl: runtime.server.bannerUrl ?? null,
          participantCount,
          participantLimit,
          friendCount: participantIds.filter((id) => contactIds.has(id)).length,
          participantAvatars: participantIds
            .map((id) => memberById.get(id)?.avatarUrl ?? null)
            .filter((url): url is string => Boolean(url))
            .slice(0, 4),
          hasScreenShare: sessions.some((session) => session.screenSharing),
          hasFreeSlots,
          canJoin:
            hasFreeSlots &&
            (channel.permissions?.includes("CONNECT_VOICE") ?? false),
          lastActivityAt: new Date(lastActivityAt).toISOString(),
        });
      }
    }

    const activeGamingSpaces = [...voiceSpaceByChannel.values()]
      .filter((space) => space.participantCount > 0)
      .sort((left, right) => {
        if (left.friendCount !== right.friendCount)
          return right.friendCount - left.friendCount;
        if (left.hasScreenShare !== right.hasScreenShare)
          return left.hasScreenShare ? -1 : 1;
        if (left.participantCount !== right.participantCount)
          return right.participantCount - left.participantCount;
        return Date.parse(right.lastActivityAt) - Date.parse(left.lastActivityAt);
      })
      .slice(0, 6);

    const currentVoiceSession = await this.voicePresenceStore
      .getSession(user.id)
      .catch(() => null);
    const quickReturn: HomeDashboardResponse["gaming"]["quickReturn"] = [];
    const quickChannelIds = new Set<string>();
    const currentVoiceSpace = currentVoiceSession
      ? voiceSpaceByChannel.get(currentVoiceSession.channelId)
      : undefined;
    if (currentVoiceSpace) {
      quickReturn.push({
        ...currentVoiceSpace,
        returnReason: "current_voice",
      });
      quickChannelIds.add(currentVoiceSpace.channelId);
    }
    for (const item of activity) {
      if (item.type !== "left_voice" || item.channelId === null) continue;
      const space = voiceSpaceByChannel.get(item.channelId);
      if (!space || quickChannelIds.has(space.channelId)) continue;
      quickReturn.push({ ...space, returnReason: "recently_left" });
      quickChannelIds.add(space.channelId);
      if (quickReturn.length === 3) break;
    }
    for (const space of activeGamingSpaces) {
      if (quickReturn.length === 3) break;
      if (quickChannelIds.has(space.channelId)) continue;
      if (space.friendCount === 0 && !space.hasScreenShare) continue;
      quickReturn.push({
        ...space,
        returnReason:
          space.friendCount > 0 ? "friends_inside" : "screen_share",
      });
      quickChannelIds.add(space.channelId);
    }

    const friendsInGame = (
      await Promise.all(
        contactRecords.map(async (contact) => {
          if (contact.presenceVisibility !== "shared_servers") return null;
          const publicContactPresence = await this.publicPresence(contact);
          if (publicContactPresence.effectiveStatus === "offline") return null;
          const channelId = voiceChannelByUser.get(contact.id);
          const space = channelId ? voiceSpaceByChannel.get(channelId) : undefined;
          const customStatusActive =
            contact.activityVisible &&
            (contact.customStatusExpiresAt === null ||
              contact.customStatusExpiresAt > this.now());
          const gameName = customStatusActive
            ? (contact.customStatusText ?? null)
            : null;
          const avatarUrl = await this.publicMediaUrl(contact.avatarObjectKey);
          return {
            userId: contact.id,
            displayName: contact.displayName ?? contact.email,
            avatarUrl,
            presence:
              publicContactPresence.effectiveStatus === "idle"
                ? ("away" as const)
                : publicContactPresence.effectiveStatus === "dnd"
                  ? ("dnd" as const)
                  : ("online" as const),
            gameName,
            gameDetails: space?.channelName ?? null,
            voiceChannel: space
              ? {
                  channelId: space.channelId,
                  serverId: space.serverId,
                  channelName: space.channelName,
                  canJoin: space.canJoin,
                }
              : null,
          };
        }),
      )
    )
      .filter(
        (
          contact,
        ): contact is HomeDashboardResponse["gaming"]["friendsInGame"][number] =>
          contact !== null,
      )
      .sort((left, right) => {
        const score = (
          contact: HomeDashboardResponse["gaming"]["friendsInGame"][number],
        ): number =>
          contact.voiceChannel?.channelId === currentVoiceSession?.channelId
            ? 4
            : contact.voiceChannel
              ? 3
              : contact.gameName
                ? 2
                : contact.presence === "online"
                  ? 1
                  : 0;
        return score(right) - score(left);
      })
      .slice(0, 8);

    const activeSpaces: HomeDashboardResponse["activeSpaces"] = [];
    for (const server of details) {
      for (const channel of server.channels) {
        const participants = channel.voiceParticipants ?? [];
        if (channel.type === "voice" && participants.length > 0) {
          activeSpaces.push({
            id: channel.id,
            type: "voice_channel",
            title: channel.name,
            subtitle: server.name,
            participants: participants
              .slice(0, 4)
              .map((participant) => ({
                id: participant.userId,
                displayName: participant.displayName,
              })),
            participantCount: participants.length,
            hasVoiceActivity: true,
            unreadCount: 0,
            lastActivityAt: (
              lastActivityByChannel.get(channel.id) ??
              new Date(server.createdAt)
            ).toISOString(),
            destination: {
              type: "voice_channel",
              serverId: server.id,
              channelId: channel.id,
            },
          });
        } else if (channel.type === "text" && channel.unreadCount > 0) {
          activeSpaces.push({
            id: channel.id,
            type: "text_channel",
            title: channel.name,
            subtitle: server.name,
            participants: [],
            participantCount: 0,
            hasVoiceActivity: false,
            unreadCount: channel.unreadCount,
            lastActivityAt: (
              lastActivityByChannel.get(channel.id) ??
              new Date(server.createdAt)
            ).toISOString(),
            destination: {
              type: "text_channel",
              serverId: server.id,
              channelId: channel.id,
            },
          });
        }
      }
    }
    activeSpaces.sort((left, right) => {
      if (left.type !== right.type)
        return left.type === "voice_channel" ? -1 : 1;
      if (left.participantCount !== right.participantCount)
        return right.participantCount - left.participantCount;
      if (left.unreadCount !== right.unreadCount)
        return right.unreadCount - left.unreadCount;
      return Date.parse(right.lastActivityAt) - Date.parse(left.lastActivityAt);
    });

    const servers: HomeDashboardResponse["servers"] = details.map((server) => ({
      id: server.id,
      name: server.name,
      description: server.description,
      inviteUrl: server.inviteUrl,
      ownerUserId: server.ownerUserId,
      memberCount: server.memberCount,
      createdAt: server.createdAt,
      iconUrl: server.iconUrl ?? null,
      bannerUrl: server.bannerUrl ?? null,
      accentColor: server.accentColor ?? null,
      visibility: server.visibility ?? "private",
      unreadCount: server.channels.reduce(
        (total, channel) => total + channel.unreadCount,
        0,
      ),
      activeVoiceCount: server.channels.reduce(
        (total, channel) => total + (channel.voiceParticipants?.length ?? 0),
        0,
      ),
    }));

    const continueItems: HomeDashboardResponse["continueItems"] = activeSpaces
      .slice(0, 2)
      .map((space) => ({
        id: `space-${space.id}`,
        type: space.type,
        title: space.title,
        subtitle: space.subtitle,
        participantCount: space.participantCount,
        active: space.type === "voice_channel",
        lastActivityAt: space.lastActivityAt,
        destination: space.destination,
      }));
    for (const server of servers) {
      if (continueItems.length >= 2) break;
      if (continueItems.some((item) => item.destination.serverId === server.id))
        continue;
      continueItems.push({
        id: `server-${server.id}`,
        type: "server",
        title: server.name,
        subtitle: "Ваше пространство",
        participantCount: server.activeVoiceCount,
        active: server.activeVoiceCount > 0,
        lastActivityAt: server.createdAt,
        destination: { type: "server", serverId: server.id },
      });
    }

    const firstServer = servers[0];
    const channelTypeById = new Map(
      details.flatMap((server) =>
        server.channels.map((channel) => [channel.id, channel.type] as const),
      ),
    );
    const onboardingSteps: HomeDashboardResponse["onboarding"]["steps"] = [
      {
        id: "create_server",
        title: "Создайте свой сервер",
        description: "Соберите общение в одном пространстве.",
        complete: servers.length > 0,
        destination: null,
      },
      {
        id: "configure_channels",
        title: "Настройте каналы",
        description: "Подготовьте текстовые и голосовые каналы.",
        complete: details.some((server) => server.channels.length > 0),
        destination: firstServer
          ? { type: "server", serverId: firstServer.id }
          : null,
      },
      {
        id: "invite_members",
        title: "Пригласите участников",
        description: "Отправьте короткую ссылку-приглашение.",
        complete: servers.some((server) => server.memberCount > 1),
        destination: firstServer
          ? { type: "server", serverId: firstServer.id }
          : null,
      },
    ];
    const accountAge = this.now().getTime() - user.createdAt.getTime();
    const onboardingVisible =
      servers.length === 0 &&
      accountAge < 7 * 24 * 60 * 60 * 1000 &&
      onboardingSteps.some((step) => !step.complete);

    return {
      user: {
        id: user.id,
        displayName: user.displayName ?? user.email,
        email: user.email,
        avatarUrl: null,
        presence: presence.effectiveStatus,
        platformBadge:
          user.platformRole === "owner" ? "FOUNDER_DEVELOPER" : null,
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
        destination:
          item.serverId === null
            ? null
            : {
                type:
                  item.channelId === null
                    ? "server"
                    : channelTypeById.get(item.channelId) === "voice"
                      ? "voice_channel"
                      : "text_channel",
                serverId: item.serverId,
                ...(item.channelId === null
                  ? {}
                  : { channelId: item.channelId }),
              },
      })),
      onboarding: { visible: onboardingVisible, steps: onboardingSteps },
      gaming: {
        voiceStatus: {
          microphone: { available: false, enabled: false, label: null },
          output: { available: false, label: null },
          pingMs: null,
          connectionQuality:
            connection === "healthy" ? "excellent" : "poor",
        },
        quickReturn,
        activeSpaces: activeGamingSpaces,
        friendsInGame,
      },
    };
  }

  async recordOpenedChannel(
    authorization: string | undefined,
    channelId: string,
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    const channel = await this.requireServerChannel(channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireChannelPermission(server, channel, user, "VIEW_CHANNEL");
    await this.recordUserActivity(
      user.id,
      "opened_channel",
      channel.type === "text" ? `# ${channel.name}` : channel.name,
      server.name,
      server.id,
      channel.id,
    );
  }

  async recordLeftVoiceChannel(
    authorization: string | undefined,
    channelId: string,
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    const channel = await this.requireVoiceChannel(channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireChannelPermission(server, channel, user, "VIEW_CHANNEL");
    await this.recordUserActivity(
      user.id,
      "left_voice",
      channel.name,
      server.name,
      server.id,
      channel.id,
    );
  }

  async createServer(
    authorization: string | undefined,
    name: string,
  ): Promise<ServerDetail> {
    const user = await this.authenticate(authorization);
    this.requireCompleteProfile(user);
    const now = this.now();
    let server: ServerRecord | null = null;
    let serverTextChannel: ServerChannelRecord | null = null;
    for (let attempt = 0; attempt < 10 && !server; attempt += 1) {
      const candidate: ServerRecord = {
        id: randomUUID(),
        name,
        description: null,
        inviteToken: randomOpaqueToken(9),
        ownerUserId: user.id,
        createdAt: now,
        updatedAt: now,
      };
      const everyone: ServerRoleRecord = {
        id: randomUUID(),
        serverId: candidate.id,
        name: "@everyone",
        color: "#8d7a72",
        position: 0,
        isDefault: true,
        kind: "EVERYONE",
        permissions: DEFAULT_SERVER_PERMISSIONS,
        createdAt: now,
        updatedAt: now,
      };
      const ownerRole: ServerRoleRecord = {
        id: randomUUID(),
        serverId: candidate.id,
        name: "Владелец",
        color: "#e38b54",
        position: 100,
        isDefault: false,
        kind: "OWNER",
        permissions: [...serverPermissions],
        createdAt: now,
        updatedAt: now,
      };
      const textChannel: ServerChannelRecord = {
        id: randomUUID(),
        serverId: candidate.id,
        name: "общий",
        type: "text",
        position: 0,
        livekitRoomName: null,
        createdAt: now,
        updatedAt: now,
      };
      const voiceChannel: ServerChannelRecord = {
        id: randomUUID(),
        serverId: candidate.id,
        name: "Голосовой",
        type: "voice",
        position: 1,
        livekitRoomName: `channel_${randomUUID()}`,
        createdAt: now,
        updatedAt: now,
      };
      if (
        await this.store.createServerGraph({
          server: candidate,
          members: [{ serverId: candidate.id, userId: user.id, joinedAt: now }],
          roles: [everyone, ownerRole],
          memberRoles: [
            { serverId: candidate.id, userId: user.id, roleId: ownerRole.id },
          ],
          channels: [textChannel, voiceChannel],
        })
      ) {
        server = candidate;
        serverTextChannel = textChannel;
      }
    }
    if (!server) throw new AppError("INTERNAL_ERROR", 500);
    if (this.canonicalMessagingStore && serverTextChannel) {
      await this.canonicalMessagingStore.ensureServerChannelConversation(
        serverTextChannel.id,
        server.id,
        user.id,
        now,
      );
    }
    await this.recordUserActivity(
      user.id,
      "joined_server",
      server.name,
      "Сервер создан",
      server.id,
      null,
    );
    return this.getServerDetailForUser(server, user);
  }

  async acceptServerInvite(
    authorization: string | undefined,
    inviteToken: string,
  ): Promise<ServerDetail> {
    const user = await this.authenticate(authorization);
    this.requireCompleteProfile(user);
    const modernInvite = this.serverSettingsStore
      ? await this.serverSettingsStore.consumeInvite(
          hashOpaqueToken(inviteToken),
          this.now(),
        )
      : null;
    const server = modernInvite
      ? await this.store.findServerById(modernInvite.serverId)
      : await this.store.findServerByInviteToken(inviteToken);
    if (!server) throw new AppError("SERVER_NOT_FOUND", 404);
    if (!(await this.store.findServerMember(server.id, user.id))) {
      await this.store.addServerMember({
        serverId: server.id,
        userId: user.id,
        joinedAt: this.now(),
      });
      await this.recordUserActivity(
        user.id,
        "joined_server",
        server.name,
        "Вы приняли приглашение по ссылке",
        server.id,
        null,
      );
    }
    return this.getServerDetailForUser(server, user);
  }

  async getServer(
    authorization: string | undefined,
    serverId: string,
  ): Promise<ServerDetail> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    return this.getServerDetailForUser(server, user);
  }

  async createServerChannel(
    authorization: string | undefined,
    serverId: string,
    name: string,
    type: "text" | "voice",
  ): Promise<ServerChannel> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, "MANAGE_CHANNELS");
    const channels = await this.store.listServerChannels(server.id);
    const now = this.now();
    const channel: ServerChannelRecord = {
      id: randomUUID(),
      serverId: server.id,
      name,
      type,
      position:
        Math.max(-1, ...channels.map((current) => current.position)) + 1,
      livekitRoomName: type === "voice" ? `channel_${randomUUID()}` : null,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.createServerChannel(channel);
    if (type === "text" && this.canonicalMessagingStore) {
      await this.canonicalMessagingStore.ensureServerChannelConversation(
        channel.id,
        server.id,
        user.id,
        now,
      );
    }
    await this.recordServerAudit(
      server.id,
      user,
      "CHANNEL_CREATED",
      "CHANNEL",
      channel.id,
      null,
      { name: channel.name, type: channel.type },
    );
    await this.broadcastServerUpdate(server.id, "server.channel.updated", {
      action: "created",
      channelId: channel.id,
    });
    return publicServerChannel(channel);
  }

  async deleteServerChannel(
    authorization: string | undefined,
    channelId: string,
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    const channel = await this.requireServerChannel(channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireServerPermission(server, user, "MANAGE_CHANNELS");
    const attachmentStorageKeys =
      channel.type === "text"
        ? await this.store.listChannelAttachmentStorageKeys(channel.id)
        : [];
    if (!(await this.store.deleteServerChannel(channel.id)))
      throw new AppError("CHANNEL_NOT_FOUND", 404);
    await this.deleteStoredObjects(attachmentStorageKeys);
    await this.recordServerAudit(
      server.id,
      user,
      "CHANNEL_DELETED",
      "CHANNEL",
      channel.id,
      { name: channel.name, type: channel.type },
      null,
    );
    await this.broadcastServerUpdate(server.id, "server.channel.updated", {
      action: "deleted",
      channelId: channel.id,
    });
    if (channel.livekitRoomName) {
      try {
        await this.media.deleteRoom(channel.livekitRoomName);
      } catch {
        /* The database deletion is authoritative. */
      }
    }
  }

  async createServerRole(
    authorization: string | undefined,
    serverId: string,
    name: string,
    color: string,
    permissions: ServerPermission[],
  ): Promise<ServerRole> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    const actorPermissions = await this.requireServerPermission(
      server,
      user,
      "MANAGE_ROLES",
    );
    if (permissions.some((permission) => !actorPermissions.has(permission)))
      throw new AppError("SERVER_PERMISSION_DENIED", 403);
    const roles = await this.store.listServerRoles(server.id);
    const actorTopPosition = await this.serverRolePositionFor(
      server,
      user,
      roles,
    );
    const now = this.now();
    const role: ServerRoleRecord = {
      id: randomUUID(),
      serverId: server.id,
      name,
      color,
      permissions,
      isDefault: false,
      kind: "CUSTOM",
      position: Number.isFinite(actorTopPosition)
        ? Math.max(
            1,
            Math.min(
              actorTopPosition - 1,
              Math.max(
                0,
                ...roles
                  .filter((current) => current.position < actorTopPosition)
                  .map((current) => current.position),
              ) + 1,
            ),
          )
        : Math.min(
            99,
            Math.max(
              0,
              ...roles
                .filter((current) => current.kind !== "OWNER")
                .map((current) => current.position),
            ) + 1,
          ),
      createdAt: now,
      updatedAt: now,
    };
    await this.store.createServerRole(role);
    await this.recordServerAudit(
      server.id,
      user,
      "ROLE_CREATED",
      "ROLE",
      role.id,
      null,
      publicServerRole(role),
    );
    return publicServerRole(role);
  }

  async updateServerRole(
    authorization: string | undefined,
    serverId: string,
    roleId: string,
    values: {
      name?: string | undefined;
      color?: string | undefined;
      permissions?: ServerPermission[] | undefined;
    },
  ): Promise<ServerRole> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    const actorPermissions = await this.requireServerPermission(
      server,
      user,
      "MANAGE_ROLES",
    );
    if (
      values.permissions?.some(
        (permission) => !actorPermissions.has(permission),
      )
    )
      throw new AppError("SERVER_PERMISSION_DENIED", 403);
    const roles = await this.store.listServerRoles(server.id);
    const role = roles.find((candidate) => candidate.id === roleId);
    if (!role) throw new AppError("ROLE_NOT_FOUND", 404);
    if (role.kind === "OWNER")
      throw new AppError("SERVER_PERMISSION_DENIED", 403);
    if (
      role.kind === "EVERYONE" &&
      (values.name !== undefined || values.color !== undefined)
    )
      throw new AppError("SERVER_PERMISSION_DENIED", 403);
    if (
      role.position >= (await this.serverRolePositionFor(server, user, roles))
    )
      throw new AppError("SERVER_PERMISSION_DENIED", 403);
    const changes: Partial<
      Pick<ServerRoleRecord, "name" | "color" | "permissions">
    > = {};
    if (values.name !== undefined) changes.name = values.name;
    if (values.color !== undefined) changes.color = values.color;
    if (values.permissions !== undefined)
      changes.permissions = values.permissions;
    const updated = await this.store.updateServerRole(
      role.id,
      changes,
      this.now(),
    );
    if (!updated) throw new AppError("ROLE_NOT_FOUND", 404);
    await this.recordServerAudit(
      server.id,
      user,
      "ROLE_UPDATED",
      "ROLE",
      role.id,
      publicServerRole(role),
      publicServerRole(updated),
    );
    return publicServerRole(updated);
  }

  async reorderServerRole(
    authorization: string | undefined,
    serverId: string,
    roleId: string,
    position: number,
  ): Promise<ServerRole> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, "MANAGE_ROLES");
    const roles = await this.store.listServerRoles(server.id);
    const role = roles.find((candidate) => candidate.id === roleId);
    if (!role) throw new AppError("ROLE_NOT_FOUND", 404);
    if (role.kind !== "CUSTOM")
      throw new AppError("SERVER_PERMISSION_DENIED", 403);
    const actorPosition = await this.serverRolePositionFor(server, user, roles);
    const ownerPosition = Math.min(
      ...roles
        .filter((candidate) => candidate.kind === "OWNER")
        .map((candidate) => candidate.position),
      100,
    );
    const ceiling = Math.min(actorPosition, ownerPosition);
    if (role.position >= ceiling || position >= ceiling || position < 1)
      throw new AppError("SERVER_PERMISSION_DENIED", 403);
    const updated = await this.store.reorderServerRole(
      server.id,
      role.id,
      role.position,
      position,
      this.now(),
    );
    if (!updated) throw new AppError("ROLE_NOT_FOUND", 404);
    await this.recordServerAudit(
      server.id,
      user,
      "ROLE_REORDERED",
      "ROLE",
      role.id,
      { position: role.position },
      { position: updated.position },
    );
    return publicServerRole(updated);
  }

  async deleteServerRole(
    authorization: string | undefined,
    serverId: string,
    roleId: string,
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, "MANAGE_ROLES");
    const roles = await this.store.listServerRoles(server.id);
    const role = roles.find((candidate) => candidate.id === roleId);
    if (!role) throw new AppError("ROLE_NOT_FOUND", 404);
    if (
      role.kind !== "CUSTOM" ||
      role.position >= (await this.serverRolePositionFor(server, user, roles))
    )
      throw new AppError("SERVER_PERMISSION_DENIED", 403);
    if (!(await this.store.deleteServerRole(role.id)))
      throw new AppError("ROLE_NOT_FOUND", 404);
    await this.recordServerAudit(
      server.id,
      user,
      "ROLE_DELETED",
      "ROLE",
      role.id,
      publicServerRole(role),
      null,
    );
  }

  async assignServerMemberRoles(
    authorization: string | undefined,
    serverId: string,
    memberUserId: string,
    roleIds: string[],
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, "MANAGE_ROLES");
    if (!(await this.store.findServerMember(server.id, memberUserId)))
      throw new AppError("SERVER_NOT_FOUND", 404);
    const roles = await this.store.listServerRoles(server.id);
    const actorTopPosition = await this.serverRolePositionFor(
      server,
      user,
      roles,
    );
    const targetRoleIds = new Set(
      await this.store.listMemberRoleIds(server.id, memberUserId),
    );
    const targetTopPosition = Math.max(
      0,
      ...roles
        .filter((role) => targetRoleIds.has(role.id))
        .map((role) => role.position),
    );
    if (targetTopPosition >= actorTopPosition)
      throw new AppError("SERVER_PERMISSION_DENIED", 403);
    const assignable = new Set(
      roles
        .filter(
          (role) => role.kind === "CUSTOM" && role.position < actorTopPosition,
        )
        .map((role) => role.id),
    );
    if (roleIds.some((roleId) => !assignable.has(roleId)))
      throw new AppError("ROLE_NOT_FOUND", 404);
    await this.store.assignMemberRoles(server.id, memberUserId, [
      ...new Set(roleIds),
    ]);
    await this.recordServerAudit(
      server.id,
      user,
      "MEMBER_ROLES_UPDATED",
      "MEMBER",
      memberUserId,
      { roleIds: [...targetRoleIds] },
      { roleIds: [...new Set(roleIds)] },
    );
  }

  async setChannelPermissionOverwrite(
    authorization: string | undefined,
    channelId: string,
    targetType: PermissionOverwriteTargetType,
    targetId: string,
    allow: ServerPermission[],
    deny: ServerPermission[],
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    const channel = await this.requireServerChannel(channelId);
    const server = await this.requireServer(channel.serverId);
    const actorPermissions = await this.requireServerPermission(
      server,
      user,
      "MANAGE_ROLES",
    );
    if (allow.some((permission) => !actorPermissions.has(permission)))
      throw new AppError("SERVER_PERMISSION_DENIED", 403);
    const roles = await this.store.listServerRoles(server.id);
    const actorPosition = await this.serverRolePositionFor(server, user, roles);
    if (targetType === "ROLE") {
      const role = roles.find((candidate) => candidate.id === targetId);
      if (!role) throw new AppError("ROLE_NOT_FOUND", 404);
      if (
        role.kind === "OWNER" ||
        (role.kind === "CUSTOM" && role.position >= actorPosition)
      )
        throw new AppError("SERVER_PERMISSION_DENIED", 403);
    } else {
      if (!(await this.store.findServerMember(server.id, targetId)))
        throw new AppError("SERVER_NOT_FOUND", 404);
      if (targetId === server.ownerUserId)
        throw new AppError("SERVER_PERMISSION_DENIED", 403);
      const targetRoleIds = await this.store.listMemberRoleIds(
        server.id,
        targetId,
      );
      if (highestRolePosition(false, roles, targetRoleIds) >= actorPosition)
        throw new AppError("SERVER_PERMISSION_DENIED", 403);
    }
    const current =
      (await this.store.listChannelPermissionOverwrites([channel.id])).find(
        (overwrite) =>
          overwrite.targetType === targetType &&
          overwrite.targetId === targetId,
      ) ?? null;
    const nextAllow = [...new Set(allow)];
    const nextDeny = [...new Set(deny)];
    if (nextAllow.length === 0 && nextDeny.length === 0)
      await this.store.deleteChannelPermissionOverwrite(
        channel.id,
        targetType,
        targetId,
      );
    else {
      const now = this.now();
      await this.store.upsertChannelPermissionOverwrite({
        channelId: channel.id,
        targetType,
        targetId,
        allow: nextAllow,
        deny: nextDeny,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      });
    }
    await this.recordServerAudit(
      server.id,
      user,
      "CHANNEL_OVERWRITE_UPDATED",
      targetType,
      targetId,
      current && { allow: current.allow, deny: current.deny },
      nextAllow.length === 0 && nextDeny.length === 0
        ? null
        : { channelId: channel.id, allow: nextAllow, deny: nextDeny },
    );
  }

  async listServerAuditLog(
    authorization: string | undefined,
    serverId: string,
  ): Promise<ServerAuditLogEntry[]> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, "VIEW_AUDIT_LOG");
    return (await this.store.listServerAuditLog(server.id, 100)).map(
      (entry) => ({
        id: entry.id,
        serverId: entry.serverId,
        actorUserId: entry.actorUserId,
        actorDisplayName: entry.actorDisplayName ?? "Системное действие",
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        before: entry.before,
        after: entry.after,
        createdAt: entry.createdAt.toISOString(),
      }),
    );
  }

  async kickServerMember(
    authorization: string | undefined,
    serverId: string,
    memberUserId: string,
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, "KICK_MEMBERS");
    if (memberUserId === server.ownerUserId || memberUserId === user.id)
      throw new AppError("SERVER_PERMISSION_DENIED", 403);
    const [roles, targetUser] = await Promise.all([
      this.store.listServerRoles(server.id),
      this.store.findUserById(memberUserId),
    ]);
    if (!targetUser) throw new AppError("SERVER_NOT_FOUND", 404);
    const actorTopPosition = await this.serverRolePositionFor(
      server,
      user,
      roles,
    );
    const targetRoleIds = new Set(
      await this.store.listMemberRoleIds(server.id, memberUserId),
    );
    const targetTopPosition = Math.max(
      0,
      ...roles
        .filter((role) => targetRoleIds.has(role.id))
        .map((role) => role.position),
    );
    if (targetTopPosition >= actorTopPosition)
      throw new AppError("SERVER_PERMISSION_DENIED", 403);
    if (!(await this.store.removeServerMember(server.id, memberUserId)))
      throw new AppError("SERVER_NOT_FOUND", 404);
    await this.recordServerAudit(
      server.id,
      user,
      "MEMBER_KICKED",
      "MEMBER",
      memberUserId,
      { displayName: targetUser.displayName },
      null,
    );
    try {
      const channels = await this.store.listServerChannels(server.id);
      for (const channel of channels) {
        if (!channel.livekitRoomName) continue;
        const identities = await this.media.participantIdentities(
          channel.livekitRoomName,
        );
        for (const identity of identities.filter((candidate) =>
          candidate.startsWith(`user_${memberUserId}_`),
        )) {
          await this.media.removeParticipant(channel.livekitRoomName, identity);
          await this.store.releaseChannelLeaseByParticipant(identity);
        }
      }
    } catch {
      // Membership removal remains authoritative even if a stale media session cannot be disconnected immediately.
    }
  }

  async listMessages(
    authorization: string | undefined,
    channelId: string,
    before: string | undefined,
    limit: number,
  ): Promise<TextMessage[]> {
    const user = await this.authenticate(authorization);
    const channel = await this.requireTextChannel(channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireChannelPermission(server, channel, user, "VIEW_CHANNEL");
    await this.requireChannelPermission(
      server,
      channel,
      user,
      "READ_MESSAGE_HISTORY",
    );
    return this.hydrateMessages(
      await this.store.listTextMessages(
        channel.id,
        before ? new Date(before) : null,
        limit,
      ),
      user.id,
    );
  }

  async listMessageNotifications(
    authorization: string | undefined,
    since: string | undefined,
    afterId: string | undefined,
    limit: number,
  ): Promise<MessageNotificationPage> {
    const user = await this.authenticate(authorization);
    if (since === undefined)
      return {
        items: [],
        cursor: { createdAt: this.now().toISOString(), id: null },
      };
    const records = await this.store.listMessageNotifications(
      user.id,
      new Date(since),
      afterId ?? null,
      limit,
    );
    const visibleChannelIds = new Set<string>();
    for (const notification of records) {
      const [server, channel] = await Promise.all([
        this.store.findServerById(notification.serverId),
        this.store.findServerChannel(notification.channelId),
      ]);
      if (
        server &&
        channel &&
        (await this.channelPermissionsFor(server, channel, user)).has(
          "VIEW_CHANNEL",
        )
      )
        visibleChannelIds.add(notification.channelId);
    }
    const items: MessageNotification[] = (
      user.presencePreference === "do_not_disturb" ? [] : records
    )
      .filter((notification) => visibleChannelIds.has(notification.channelId))
      .map((notification: MessageNotificationRecord) => ({
        id: notification.id,
        serverId: notification.serverId,
        serverName: notification.serverName,
        channelId: notification.channelId,
        channelName: notification.channelName,
        authorUserId: notification.authorUserId,
        authorDisplayName: notification.authorDisplayName ?? "Участник",
        content: notification.content,
        mention: notification.mention,
        createdAt: notification.createdAt.toISOString(),
      }));
    const lastScanned = records.at(-1);
    return {
      items,
      cursor: lastScanned
        ? { createdAt: lastScanned.createdAt.toISOString(), id: lastScanned.id }
        : null,
    };
  }

  async createMessage(
    authorization: string | undefined,
    channelId: string,
    content: string,
    mentions: MessageMentionInput[],
    replyToMessageId: string | null,
  ): Promise<TextMessage> {
    const user = await this.authenticate(authorization);
    this.requireCompleteProfile(user);
    const channel = await this.requireTextChannel(channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireChannelPermission(server, channel, user, "SEND_MESSAGES");
    if (replyToMessageId !== null) {
      const replyTarget = await this.store.findTextMessage(replyToMessageId);
      if (!replyTarget || replyTarget.channelId !== channel.id)
        throw new AppError("MESSAGE_NOT_FOUND", 404);
    }
    const now = this.now();
    const message = {
      id: randomUUID(),
      channelId: channel.id,
      authorUserId: user.id,
      content,
      replyToMessageId,
      createdAt: now,
      editedAt: null,
    };
    const mentionRecords = await this.validateMessageMentions(
      server,
      channel,
      message.id,
      content,
      mentions,
    );
    await this.store.createTextMessage(message, mentionRecords);
    if (this.canonicalMessagingStore) {
      await this.canonicalMessagingStore.ensureServerChannelConversation(
        channel.id,
        server.id,
        server.ownerUserId,
        now,
      );
      const canonicalReply = replyToMessageId
        ? await this.canonicalMessagingStore.findMessageByLegacyId(
            replyToMessageId,
            user.id,
          )
        : null;
      await this.canonicalMessagingStore.createMessage({
        conversationId: channel.id,
        authorId: user.id,
        clientMessageId: message.id,
        content,
        replyToMessageId: canonicalReply?.id ?? null,
        attachmentIds: [],
        mentions: mentionRecords.map((mention) => ({
          type: "user",
          userId: mention.mentionedUserId,
          start: mention.start,
          length: mention.length,
        })),
        now,
      });
    }
    await this.recordUserActivity(
      user.id,
      "sent_message",
      `# ${channel.name}`,
      server.name,
      server.id,
      channel.id,
    );
    for (const mentionedUserId of new Set(
      mentionRecords.map((mention) => mention.mentionedUserId),
    )) {
      if (mentionedUserId !== user.id)
        await this.recordUserActivity(
          mentionedUserId,
          "mention_received",
          `# ${channel.name}`,
          user.displayName ?? "Участник",
          server.id,
          channel.id,
        );
    }
    return (
      await this.hydrateMessages(
        [
          {
            ...message,
            displayName: user.displayName,
            platformRole: user.platformRole,
          },
        ],
        user.id,
      )
    )[0]!;
  }

  async updateMessage(
    authorization: string | undefined,
    messageId: string,
    content: string,
    mentions: MessageMentionInput[],
  ): Promise<TextMessage> {
    const user = await this.authenticate(authorization);
    const message = await this.store.findTextMessage(messageId);
    if (!message) throw new AppError("MESSAGE_NOT_FOUND", 404);
    const channel = await this.requireTextChannel(message.channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireChannelPermission(
      server,
      channel,
      user,
      message.authorUserId === user.id
        ? "MANAGE_OWN_MESSAGES"
        : "MANAGE_MESSAGES",
    );
    const existingMentionUserIds = new Set(
      (await this.store.listMessageMentions([message.id])).map(
        (mention) => mention.mentionedUserId,
      ),
    );
    const mentionRecords = await this.validateMessageMentions(
      server,
      channel,
      message.id,
      content,
      mentions,
    );
    const updated = await this.store.updateTextMessage(
      message.id,
      content,
      this.now(),
      mentionRecords,
    );
    if (!updated) throw new AppError("MESSAGE_NOT_FOUND", 404);
    const author = await this.store.findUserById(updated.authorUserId);
    if (!author) throw new AppError("MESSAGE_NOT_FOUND", 404);
    if (this.canonicalMessagingStore) {
      const canonical =
        await this.canonicalMessagingStore.findMessageByLegacyId(
          message.id,
          user.id,
        );
      if (canonical)
        await this.canonicalMessagingStore.editMessage(
          canonical.id,
          user.id,
          content,
          mentionRecords.map((mention) => ({
            type: "user",
            userId: mention.mentionedUserId,
            start: mention.start,
            length: mention.length,
          })),
          this.now(),
          message.authorUserId !== user.id,
        );
    }
    for (const mentionedUserId of new Set(
      mentionRecords.map((mention) => mention.mentionedUserId),
    )) {
      if (
        mentionedUserId !== user.id &&
        !existingMentionUserIds.has(mentionedUserId)
      )
        await this.recordUserActivity(
          mentionedUserId,
          "mention_received",
          `# ${channel.name}`,
          author.displayName ?? "Участник",
          server.id,
          channel.id,
        );
    }
    return (
      await this.hydrateMessages(
        [
          {
            ...updated,
            displayName: author.displayName,
            platformRole: author.platformRole,
          },
        ],
        user.id,
      )
    )[0]!;
  }

  async setMessageReaction(
    authorization: string | undefined,
    messageId: string,
    emoji: string,
    active: boolean,
  ): Promise<TextMessage> {
    const user = await this.authenticate(authorization);
    const message = await this.store.findTextMessage(messageId);
    if (!message) throw new AppError("MESSAGE_NOT_FOUND", 404);
    const channel = await this.requireTextChannel(message.channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireChannelPermission(server, channel, user, "ADD_REACTIONS");
    if (active)
      await this.store.addMessageReaction({
        messageId: message.id,
        userId: user.id,
        emoji,
        createdAt: this.now(),
      });
    else await this.store.removeMessageReaction(message.id, user.id, emoji);
    if (this.canonicalMessagingStore) {
      const canonical =
        await this.canonicalMessagingStore.findMessageByLegacyId(
          message.id,
          user.id,
        );
      if (canonical)
        await this.canonicalMessagingStore.setReaction(
          canonical.id,
          user.id,
          emoji,
          active,
          this.now(),
        );
    }
    const [withAuthor] = await this.store.findTextMessagesWithAuthors([
      message.id,
    ]);
    if (!withAuthor) throw new AppError("MESSAGE_NOT_FOUND", 404);
    return (await this.hydrateMessages([withAuthor], user.id))[0]!;
  }

  async uploadMessageAttachment(
    authorization: string | undefined,
    messageId: string,
    input: { fileName: string; mimeType: string; content: Buffer },
  ): Promise<TextMessage> {
    const user = await this.authenticate(authorization);
    this.requireCompleteProfile(user);
    const message = await this.store.findTextMessage(messageId);
    if (!message) throw new AppError("MESSAGE_NOT_FOUND", 404);
    const channel = await this.requireTextChannel(message.channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireChannelPermission(
      server,
      channel,
      user,
      "SEND_ATTACHMENTS",
    );
    if (message.authorUserId !== user.id)
      throw new AppError("SERVER_PERMISSION_DENIED", 403);
    if (input.content.length === 0) throw new AppError("VALIDATION_ERROR", 400);
    if (input.content.length > MAX_ATTACHMENT_BYTES)
      throw new AppError("ATTACHMENT_TOO_LARGE", 413);
    const mimeType =
      input.mimeType.toLowerCase().split(";", 1)[0]?.trim() ?? "";
    if (!ALLOWED_ATTACHMENT_TYPES.has(mimeType))
      throw new AppError("ATTACHMENT_TYPE_NOT_ALLOWED", 400);
    const existing = await this.store.listMessageAttachments([message.id]);
    if (existing.length >= MAX_ATTACHMENTS_PER_MESSAGE)
      throw new AppError("VALIDATION_ERROR", 400, undefined, {
        field: "attachments",
        max: MAX_ATTACHMENTS_PER_MESSAGE,
      });
    const attachmentId = randomUUID();
    const storedContent = await this.prepareAttachmentContent(
      "channels",
      message.id,
      attachmentId,
      input.content,
      mimeType,
    );
    const attachment: MessageAttachmentRecord = {
      id: attachmentId,
      messageId: message.id,
      uploaderUserId: user.id,
      fileName: safeAttachmentName(input.fileName),
      mimeType,
      size: input.content.length,
      ...storedContent,
      createdAt: this.now(),
    };
    try {
      await this.store.createMessageAttachment(attachment);
    } catch (error) {
      await this.deleteStoredObjects([attachment.storageKey]);
      throw error;
    }
    const [withAuthor] = await this.store.findTextMessagesWithAuthors([
      message.id,
    ]);
    if (!withAuthor) throw new AppError("MESSAGE_NOT_FOUND", 404);
    return (await this.hydrateMessages([withAuthor], user.id))[0]!;
  }

  async getMessageAttachment(
    authorization: string | undefined,
    attachmentId: string,
  ): Promise<MessageAttachmentRecord> {
    const user = await this.authenticate(authorization);
    const attachment = await this.store.findMessageAttachment(attachmentId);
    if (!attachment) throw new AppError("ATTACHMENT_NOT_FOUND", 404);
    const message = await this.store.findTextMessage(attachment.messageId);
    if (!message) throw new AppError("ATTACHMENT_NOT_FOUND", 404);
    const channel = await this.requireTextChannel(message.channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireChannelPermission(server, channel, user, "VIEW_CHANNEL");
    await this.requireChannelPermission(
      server,
      channel,
      user,
      "READ_MESSAGE_HISTORY",
    );
    return {
      ...attachment,
      content: await this.resolveAttachmentContent(attachment),
    };
  }

  async deleteMessageAttachment(
    authorization: string | undefined,
    attachmentId: string,
  ): Promise<TextMessage> {
    const user = await this.authenticate(authorization);
    const attachment = await this.store.findMessageAttachment(attachmentId);
    if (!attachment) throw new AppError("ATTACHMENT_NOT_FOUND", 404);
    const message = await this.store.findTextMessage(attachment.messageId);
    if (!message) throw new AppError("ATTACHMENT_NOT_FOUND", 404);
    const channel = await this.requireTextChannel(message.channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireChannelPermission(
      server,
      channel,
      user,
      message.authorUserId === user.id || attachment.uploaderUserId === user.id
        ? "MANAGE_OWN_MESSAGES"
        : "MANAGE_MESSAGES",
    );
    await this.store.deleteMessageAttachment(attachment.id);
    await this.deleteStoredObjects([attachment.storageKey]);
    const [withAuthor] = await this.store.findTextMessagesWithAuthors([
      message.id,
    ]);
    if (!withAuthor) throw new AppError("MESSAGE_NOT_FOUND", 404);
    return (await this.hydrateMessages([withAuthor], user.id))[0]!;
  }

  async markChannelRead(
    authorization: string | undefined,
    channelId: string,
    messageId: string,
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    const channel = await this.requireTextChannel(channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireChannelPermission(server, channel, user, "VIEW_CHANNEL");
    const message = await this.store.findTextMessage(messageId);
    if (!message || message.channelId !== channel.id)
      throw new AppError("MESSAGE_NOT_FOUND", 404);
    await this.store.markChannelRead({
      channelId: channel.id,
      userId: user.id,
      readAt: message.createdAt,
    });
    if (this.canonicalMessagingStore) {
      const canonical =
        await this.canonicalMessagingStore.findMessageByLegacyId(
          message.id,
          user.id,
        );
      if (canonical)
        await this.canonicalMessagingStore.updateReadState(
          channel.id,
          user.id,
          canonical.id,
          canonical.id,
          this.now(),
        );
    }
  }

  async deleteMessage(
    authorization: string | undefined,
    messageId: string,
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    const message = await this.store.findTextMessage(messageId);
    if (!message) throw new AppError("MESSAGE_NOT_FOUND", 404);
    const channel = await this.requireTextChannel(message.channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireChannelPermission(
      server,
      channel,
      user,
      message.authorUserId === user.id
        ? "MANAGE_OWN_MESSAGES"
        : "MANAGE_MESSAGES",
    );
    const attachments = await this.store.listMessageAttachments([message.id]);
    await this.store.deleteTextMessage(message.id);
    if (this.canonicalMessagingStore) {
      const canonical =
        await this.canonicalMessagingStore.findMessageByLegacyId(
          message.id,
          user.id,
        );
      if (canonical)
        await this.canonicalMessagingStore.softDeleteMessage(
          canonical.id,
          user.id,
          message.authorUserId !== user.id,
          this.now(),
        );
    }
    await this.deleteStoredObjects(
      attachments.map((attachment) => attachment.storageKey),
    );
  }

  async listDirectMessageCandidates(
    authorization: string | undefined,
  ): Promise<DirectMessageCandidate[]> {
    const user = await this.authenticate(authorization);
    const candidates = new Map<string, DirectMessageCandidate>();
    for (const server of await this.store.listServersForUser(user.id)) {
      const permissions = await this.serverPermissionsFor(server, user);
      if (!permissions.has("VIEW_SERVER")) continue;
      for (const member of await this.store.listServerMembers(server.id)) {
        if (member.userId === user.id || !member.displayName) continue;
        const candidate = await this.store.findUserById(member.userId);
        if (
          candidate?.directMessagePrivacy === "nobody" ||
          (this.identitySettingsStore &&
            (await this.identitySettingsStore.areUsersBlocked(
              user.id,
              member.userId,
            )))
        )
          continue;
        const existing = candidates.get(member.userId);
        if (existing) existing.sharedServerNames.push(server.name);
        else
          candidates.set(member.userId, {
            userId: member.userId,
            displayName: member.displayName,
            platformRole: member.platformRole,
            avatarUrl: await this.publicMediaUrl(
              candidate?.avatarObjectKey ?? null,
            ),
            sharedServerNames: [server.name],
          });
      }
    }
    return [...candidates.values()]
      .map((candidate) => ({
        ...candidate,
        sharedServerNames: [...new Set(candidate.sharedServerNames)].sort(),
      }))
      .sort((left, right) =>
        left.displayName.localeCompare(right.displayName, "ru"),
      );
  }

  async listDirectConversations(
    authorization: string | undefined,
  ): Promise<DirectConversationSummary[]> {
    const user = await this.authenticate(authorization);
    return Promise.all(
      (await this.store.listDirectConversationOverviews(user.id)).map(
        async (overview) => {
          const result = publicDirectConversation(overview);
          result.participant.avatarUrl = await this.publicMediaUrl(
            overview.participant.avatarObjectKey,
          );
          return result;
        },
      ),
    );
  }

  async createDirectConversation(
    authorization: string | undefined,
    participantUserId: string,
  ): Promise<DirectConversationSummary> {
    const user = await this.authenticate(authorization);
    this.requireCompleteProfile(user);
    if (participantUserId === user.id)
      throw new AppError("DIRECT_MESSAGE_NOT_ALLOWED", 400);
    const participant = await this.store.findUserById(participantUserId);
    if (
      !participant?.displayName ||
      participant.directMessagePrivacy === "nobody" ||
      (this.identitySettingsStore &&
        (await this.identitySettingsStore.areUsersBlocked(
          user.id,
          participant.id,
        )))
    )
      throw new AppError("DIRECT_MESSAGE_NOT_ALLOWED", 403);
    let shareVisibleServer = false;
    for (const server of await this.store.listServersForUser(user.id)) {
      if (!(await this.store.findServerMember(server.id, participant.id)))
        continue;
      if ((await this.serverPermissionsFor(server, user)).has("VIEW_SERVER")) {
        shareVisibleServer = true;
        break;
      }
    }
    if (!shareVisibleServer)
      throw new AppError("DIRECT_MESSAGE_NOT_ALLOWED", 403);
    const conversation = await this.store.getOrCreateDirectConversation(
      user.id,
      participant.id,
      this.now(),
    );
    if (this.canonicalMessagingStore)
      await this.canonicalMessagingStore.ensureLegacyDirectConversation(
        conversation.id,
        conversation.userAId,
        conversation.userBId,
        conversation.createdAt,
      );
    const overview = (
      await this.store.listDirectConversationOverviews(user.id)
    ).find((candidate) => candidate.conversation.id === conversation.id);
    if (!overview) throw new AppError("DIRECT_CONVERSATION_NOT_FOUND", 404);
    const result = publicDirectConversation(overview);
    result.participant.avatarUrl = await this.publicMediaUrl(
      overview.participant.avatarObjectKey,
    );
    return result;
  }

  async listDirectMessages(
    authorization: string | undefined,
    conversationId: string,
    before: string | undefined,
    limit: number,
  ): Promise<DirectMessage[]> {
    const user = await this.authenticate(authorization);
    await this.requireDirectConversation(conversationId, user.id);
    return this.hydrateDirectMessages(
      await this.store.listDirectMessages(
        conversationId,
        before ? new Date(before) : null,
        limit,
      ),
      user.id,
    );
  }

  async createDirectMessage(
    authorization: string | undefined,
    conversationId: string,
    content: string,
    replyToMessageId: string | null,
  ): Promise<DirectMessage> {
    const user = await this.authenticate(authorization);
    this.requireCompleteProfile(user);
    const conversation = await this.requireDirectConversation(
      conversationId,
      user.id,
    );
    const recipientId =
      conversation.userAId === user.id
        ? conversation.userBId
        : conversation.userAId;
    const recipient = await this.store.findUserById(recipientId);
    if (
      !recipient ||
      recipient.directMessagePrivacy === "nobody" ||
      (this.identitySettingsStore &&
        (await this.identitySettingsStore.areUsersBlocked(
          user.id,
          recipient.id,
        )))
    )
      throw new AppError("DIRECT_MESSAGE_NOT_ALLOWED", 403);
    if (replyToMessageId !== null) {
      const reply = await this.store.findDirectMessage(replyToMessageId);
      if (!reply || reply.conversationId !== conversationId)
        throw new AppError("DIRECT_MESSAGE_NOT_FOUND", 404);
    }
    const createdAt = new Date(
      Math.max(this.now().getTime(), conversation.updatedAt.getTime() + 1),
    );
    const message = {
      id: randomUUID(),
      conversationId,
      authorUserId: user.id,
      content,
      replyToMessageId,
      createdAt,
      editedAt: null,
    };
    await this.store.createDirectMessage(message);
    if (this.canonicalMessagingStore) {
      const canonicalConversationId =
        await this.canonicalMessagingStore.ensureLegacyDirectConversation(
          conversation.id,
          conversation.userAId,
          conversation.userBId,
          conversation.createdAt,
        );
      const canonicalReply = replyToMessageId
        ? await this.canonicalMessagingStore.findMessageByLegacyId(
            replyToMessageId,
            user.id,
          )
        : null;
      await this.canonicalMessagingStore.createMessage({
        conversationId: canonicalConversationId,
        authorId: user.id,
        clientMessageId: message.id,
        content,
        replyToMessageId: canonicalReply?.id ?? null,
        attachmentIds: [],
        mentions: [],
        now: createdAt,
      });
    }
    return (
      await this.hydrateDirectMessages(
        [
          {
            ...message,
            displayName: user.displayName,
            platformRole: user.platformRole,
          },
        ],
        user.id,
      )
    )[0]!;
  }

  async updateDirectMessage(
    authorization: string | undefined,
    messageId: string,
    content: string,
  ): Promise<DirectMessage> {
    const user = await this.authenticate(authorization);
    const message = await this.store.findDirectMessage(messageId);
    if (!message || message.authorUserId !== user.id)
      throw new AppError("DIRECT_MESSAGE_NOT_FOUND", 404);
    await this.requireDirectConversation(message.conversationId, user.id);
    const updated = await this.store.updateDirectMessage(
      message.id,
      content,
      this.now(),
    );
    if (!updated) throw new AppError("DIRECT_MESSAGE_NOT_FOUND", 404);
    if (this.canonicalMessagingStore) {
      const canonical =
        await this.canonicalMessagingStore.findMessageByLegacyId(
          message.id,
          user.id,
        );
      if (canonical)
        await this.canonicalMessagingStore.editMessage(
          canonical.id,
          user.id,
          content,
          [],
          this.now(),
        );
    }
    return (
      await this.hydrateDirectMessages(
        [
          {
            ...updated,
            displayName: user.displayName,
            platformRole: user.platformRole,
          },
        ],
        user.id,
      )
    )[0]!;
  }

  async deleteDirectMessage(
    authorization: string | undefined,
    messageId: string,
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    const message = await this.store.findDirectMessage(messageId);
    if (!message || message.authorUserId !== user.id)
      throw new AppError("DIRECT_MESSAGE_NOT_FOUND", 404);
    await this.requireDirectConversation(message.conversationId, user.id);
    const attachments = await this.store.listDirectMessageAttachments([
      message.id,
    ]);
    await this.store.deleteDirectMessage(message.id);
    if (this.canonicalMessagingStore) {
      const canonical =
        await this.canonicalMessagingStore.findMessageByLegacyId(
          message.id,
          user.id,
        );
      if (canonical)
        await this.canonicalMessagingStore.softDeleteMessage(
          canonical.id,
          user.id,
          false,
          this.now(),
        );
    }
    await this.deleteStoredObjects(
      attachments.map((attachment) => attachment.storageKey),
    );
  }

  async setDirectMessageReaction(
    authorization: string | undefined,
    messageId: string,
    emoji: string,
    active: boolean,
  ): Promise<DirectMessage> {
    const user = await this.authenticate(authorization);
    const message = await this.store.findDirectMessage(messageId);
    if (!message) throw new AppError("DIRECT_MESSAGE_NOT_FOUND", 404);
    await this.requireDirectConversation(message.conversationId, user.id);
    if (active)
      await this.store.addDirectMessageReaction({
        messageId,
        userId: user.id,
        emoji,
        createdAt: this.now(),
      });
    else
      await this.store.removeDirectMessageReaction(messageId, user.id, emoji);
    if (this.canonicalMessagingStore) {
      const canonical =
        await this.canonicalMessagingStore.findMessageByLegacyId(
          message.id,
          user.id,
        );
      if (canonical)
        await this.canonicalMessagingStore.setReaction(
          canonical.id,
          user.id,
          emoji,
          active,
          this.now(),
        );
    }
    const [withAuthor] = await this.store.findDirectMessagesWithAuthors([
      message.id,
    ]);
    if (!withAuthor) throw new AppError("DIRECT_MESSAGE_NOT_FOUND", 404);
    return (await this.hydrateDirectMessages([withAuthor], user.id))[0]!;
  }

  async markDirectConversationRead(
    authorization: string | undefined,
    conversationId: string,
    messageId: string,
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    const conversation = await this.requireDirectConversation(
      conversationId,
      user.id,
    );
    const message = await this.store.findDirectMessage(messageId);
    if (!message || message.conversationId !== conversationId)
      throw new AppError("DIRECT_MESSAGE_NOT_FOUND", 404);
    await this.store.markDirectConversationRead(
      conversationId,
      user.id,
      message.createdAt,
      message.id,
    );
    if (this.canonicalMessagingStore) {
      const canonical =
        await this.canonicalMessagingStore.findMessageByLegacyId(
          message.id,
          user.id,
        );
      const canonicalConversationId =
        await this.canonicalMessagingStore.ensureLegacyDirectConversation(
          conversationId,
          conversation.userAId,
          conversation.userBId,
          conversation.createdAt,
        );
      if (canonical)
        await this.canonicalMessagingStore.updateReadState(
          canonicalConversationId,
          user.id,
          canonical.id,
          canonical.id,
          this.now(),
        );
    }
  }

  async uploadDirectMessageAttachment(
    authorization: string | undefined,
    messageId: string,
    input: { fileName: string; mimeType: string; content: Buffer },
  ): Promise<DirectMessage> {
    const user = await this.authenticate(authorization);
    const message = await this.store.findDirectMessage(messageId);
    if (!message || message.authorUserId !== user.id)
      throw new AppError("DIRECT_MESSAGE_NOT_FOUND", 404);
    await this.requireDirectConversation(message.conversationId, user.id);
    if (input.content.length === 0) throw new AppError("VALIDATION_ERROR", 400);
    if (input.content.length > MAX_ATTACHMENT_BYTES)
      throw new AppError("ATTACHMENT_TOO_LARGE", 413);
    const mimeType =
      input.mimeType.toLowerCase().split(";", 1)[0]?.trim() ?? "";
    if (!ALLOWED_ATTACHMENT_TYPES.has(mimeType))
      throw new AppError("ATTACHMENT_TYPE_NOT_ALLOWED", 400);
    if (
      (await this.store.listDirectMessageAttachments([message.id])).length >=
      MAX_ATTACHMENTS_PER_MESSAGE
    )
      throw new AppError("VALIDATION_ERROR", 400, undefined, {
        field: "attachments",
        max: MAX_ATTACHMENTS_PER_MESSAGE,
      });
    const attachmentId = randomUUID();
    const storedContent = await this.prepareAttachmentContent(
      "direct",
      message.id,
      attachmentId,
      input.content,
      mimeType,
    );
    const attachment: DirectMessageAttachmentRecord = {
      id: attachmentId,
      messageId,
      uploaderUserId: user.id,
      fileName: safeAttachmentName(input.fileName),
      mimeType,
      size: input.content.length,
      ...storedContent,
      createdAt: this.now(),
    };
    try {
      await this.store.createDirectMessageAttachment(attachment);
    } catch (error) {
      await this.deleteStoredObjects([attachment.storageKey]);
      throw error;
    }
    const [withAuthor] = await this.store.findDirectMessagesWithAuthors([
      message.id,
    ]);
    if (!withAuthor) throw new AppError("DIRECT_MESSAGE_NOT_FOUND", 404);
    return (await this.hydrateDirectMessages([withAuthor], user.id))[0]!;
  }

  async getDirectMessageAttachment(
    authorization: string | undefined,
    attachmentId: string,
  ): Promise<DirectMessageAttachmentRecord> {
    const user = await this.authenticate(authorization);
    const attachment =
      await this.store.findDirectMessageAttachment(attachmentId);
    if (!attachment) throw new AppError("ATTACHMENT_NOT_FOUND", 404);
    const message = await this.store.findDirectMessage(attachment.messageId);
    if (!message) throw new AppError("ATTACHMENT_NOT_FOUND", 404);
    await this.requireDirectConversation(message.conversationId, user.id);
    return {
      ...attachment,
      content: await this.resolveAttachmentContent(attachment),
    };
  }

  async deleteDirectMessageAttachment(
    authorization: string | undefined,
    attachmentId: string,
  ): Promise<DirectMessage> {
    const user = await this.authenticate(authorization);
    const attachment =
      await this.store.findDirectMessageAttachment(attachmentId);
    if (!attachment || attachment.uploaderUserId !== user.id)
      throw new AppError("ATTACHMENT_NOT_FOUND", 404);
    const message = await this.store.findDirectMessage(attachment.messageId);
    if (!message) throw new AppError("ATTACHMENT_NOT_FOUND", 404);
    await this.requireDirectConversation(message.conversationId, user.id);
    await this.store.deleteDirectMessageAttachment(attachment.id);
    await this.deleteStoredObjects([attachment.storageKey]);
    const [withAuthor] = await this.store.findDirectMessagesWithAuthors([
      message.id,
    ]);
    if (!withAuthor) throw new AppError("DIRECT_MESSAGE_NOT_FOUND", 404);
    return (await this.hydrateDirectMessages([withAuthor], user.id))[0]!;
  }

  private async hydrateDirectMessages(
    messages: DirectMessageWithAuthor[],
    currentUserId: string,
  ): Promise<DirectMessage[]> {
    const replyIds = [
      ...new Set(
        messages
          .map((message) => message.replyToMessageId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const replies = new Map(
      (await this.store.findDirectMessagesWithAuthors(replyIds)).map(
        (message) => [message.id, message],
      ),
    );
    const messageIds = messages.map((message) => message.id);
    const [reactions, attachments] = await Promise.all([
      this.store.listDirectMessageReactionSummaries(messageIds, currentUserId),
      this.store.listDirectMessageAttachments(messageIds),
    ]);
    const reactionsByMessage = new Map<string, MessageReactionSummary[]>();
    for (const reaction of reactions)
      reactionsByMessage.set(reaction.messageId, [
        ...(reactionsByMessage.get(reaction.messageId) ?? []),
        reaction,
      ]);
    const attachmentsByMessage = new Map<
      string,
      DirectMessageAttachmentMetadata[]
    >();
    for (const attachment of attachments)
      attachmentsByMessage.set(attachment.messageId, [
        ...(attachmentsByMessage.get(attachment.messageId) ?? []),
        attachment,
      ]);
    return Promise.all(
      messages.map(async (message) => {
        const result = publicDirectMessage(
        message,
        message.replyToMessageId === null
          ? null
          : (replies.get(message.replyToMessageId) ?? null),
        reactionsByMessage.get(message.id) ?? [],
          attachmentsByMessage.get(message.id) ?? [],
        );
        result.authorAvatarUrl = await this.publicMediaUrl(
          message.avatarObjectKey,
        );
        return result;
      }),
    );
  }

  private async hydrateMessages(
    messages: TextMessageWithAuthor[],
    currentUserId: string,
  ): Promise<TextMessage[]> {
    const replyIds = [
      ...new Set(
        messages
          .map((message) => message.replyToMessageId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const replies = new Map(
      (await this.store.findTextMessagesWithAuthors(replyIds)).map(
        (message) => [message.id, message],
      ),
    );
    const messageIds = messages.map((message) => message.id);
    const [reactions, attachments, mentions] = await Promise.all([
      this.store.listMessageReactionSummaries(messageIds, currentUserId),
      this.store.listMessageAttachments(messageIds),
      this.store.listMessageMentions(messageIds),
    ]);
    const byMessage = new Map<string, MessageReactionSummary[]>();
    for (const reaction of reactions)
      byMessage.set(reaction.messageId, [
        ...(byMessage.get(reaction.messageId) ?? []),
        reaction,
      ]);
    const attachmentsByMessage = new Map<string, MessageAttachmentMetadata[]>();
    for (const attachment of attachments)
      attachmentsByMessage.set(attachment.messageId, [
        ...(attachmentsByMessage.get(attachment.messageId) ?? []),
        attachment,
      ]);
    const mentionsByMessage = new Map<string, MessageMentionWithUser[]>();
    for (const mention of mentions)
      mentionsByMessage.set(mention.messageId, [
        ...(mentionsByMessage.get(mention.messageId) ?? []),
        mention,
      ]);
    return Promise.all(
      messages.map(async (message) => {
        const result = publicTextMessage(
        message,
        message.replyToMessageId === null
          ? null
          : (replies.get(message.replyToMessageId) ?? null),
        byMessage.get(message.id) ?? [],
        attachmentsByMessage.get(message.id) ?? [],
          mentionsByMessage.get(message.id) ?? [],
        );
        result.authorAvatarUrl = await this.publicMediaUrl(
          message.avatarObjectKey,
        );
        return result;
      }),
    );
  }

  async connectVoiceChannel(
    authorization: string | undefined,
    channelId: string,
  ): Promise<RoomConnection> {
    const user = await this.authenticate(authorization);
    this.requireCompleteProfile(user);
    const channel = await this.requireVoiceChannel(channelId);
    const server = await this.requireServer(channel.serverId);
    const serverMember = await this.store.findServerMember(server.id, user.id);
    const participantDisplayName = serverMember?.nickname ?? user.displayName;
    const permissions = await this.requireChannelPermission(
      server,
      channel,
      user,
      "CONNECT_VOICE",
    );
    if (!channel.livekitRoomName) throw new AppError("CHANNEL_NOT_FOUND", 404);
    try {
      await this.media.createRoom({
        id: channel.id,
        ownerUserId: server.ownerUserId,
        name: channel.livekitRoomName,
        maxParticipants: 25,
      });
      const identity = `user_${user.id}_${randomOpaqueToken(6)}`;
      const voiceSessionId = randomUUID();
      const token = await this.media.issueToken({
        roomName: channel.livekitRoomName,
        identity,
        displayName: participantDisplayName,
        metadata: {
          serverId: server.id,
          channelId: channel.id,
          userId: user.id,
          voiceSessionId,
          kind: "user",
          platformRole: user.platformRole,
        },
        canPublishMicrophone: permissions.has("SPEAK"),
        canPublishCamera: permissions.has("STREAM_VIDEO"),
        canPublishScreen: permissions.has("STREAM_SCREEN"),
        canPublishScreenAudio: permissions.has("STREAM_APPLICATION_AUDIO"),
      });
      await this.recordUserActivity(
        user.id,
        "joined_voice",
        channel.name,
        server.name,
        server.id,
        channel.id,
      );
      return {
        roomId: channel.id,
        ownerUserId: server.ownerUserId,
        livekitUrl: this.config.LIVEKIT_URL,
        livekitToken: token,
        participantIdentity: identity,
        voiceSessionId,
        participantDisplayName,
        isOwner: permissions.has("MUTE_MEMBERS"),
        contextType: "channel",
        serverId: server.id,
        channelId: channel.id,
        serverName: server.name,
        channelName: channel.name,
        canSpeak: permissions.has("SPEAK"),
        canStreamVideo: permissions.has("STREAM_VIDEO"),
        canStream: permissions.has("STREAM_SCREEN"),
        canStreamApplicationAudio: permissions.has("STREAM_APPLICATION_AUDIO"),
        canMoveMembers: permissions.has("MOVE_MEMBERS"),
      };
    } catch {
      throw new AppError("LIVEKIT_UNAVAILABLE", 503);
    }
  }

  async getServerVoiceState(
    authorization: string | undefined,
    serverId: string,
  ): Promise<ServerVoiceStateDto> {
    const actor = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    if (!(await this.store.findServerMember(server.id, actor.id)))
      throw new AppError("SERVER_NOT_FOUND", 404);
    const channels = await this.store.listServerChannels(server.id);
    const visibleVoiceChannels = new Set<string>();
    for (const channel of channels) {
      if (channel.type !== "voice") continue;
      const permissions = await this.channelPermissionsFor(server, channel, actor);
      if (permissions.has("VIEW_CHANNEL")) visibleVoiceChannels.add(channel.id);
    }
    const snapshot = await this.voicePresenceStore.snapshot(server.id);
    return {
      serverId: server.id,
      version: snapshot.version,
      generatedAt: snapshot.generatedAt,
      channels: [...visibleVoiceChannels].map((channelId) => ({
        channelId,
        members: snapshot.sessions
          .filter((session) => session.channelId === channelId)
          .map((session) => ({
            userId: session.userId,
            sessionId: session.sessionId,
            muted: session.muted,
            deafened: session.deafened,
            speaking: session.speaking,
            screenSharing: session.screenSharing,
            connectionQuality: session.connectionQuality,
          })),
      })),
    };
  }

  async updateOwnVoiceState(
    authorization: string | undefined,
    channelId: string,
    input: UpdateOwnVoiceStateRequest,
  ): Promise<void> {
    const actor = await this.authenticate(authorization);
    const channel = await this.requireVoiceChannel(channelId);
    const server = await this.requireServer(channel.serverId);
    if (!(await this.store.findServerMember(server.id, actor.id)))
      throw new AppError("SERVER_NOT_FOUND", 404);
    const current = await this.voicePresenceStore.getSession(actor.id);
    if (
      !current ||
      current.serverId !== server.id ||
      current.channelId !== channel.id ||
      current.sessionId !== input.sessionId
    ) {
      technicalMetrics.increment("voice_state_updates_total", 1, {
        result: "stale_session",
      });
      throw new AppError("VOICE_SOURCE_CHANGED", 409);
    }
    const updated = await this.voicePresenceStore.updateSessionState(
      actor.id,
      input.sessionId,
      {
        muted: input.muted,
        deafened: input.deafened,
        speaking: input.speaking,
        connectionQuality: input.connectionQuality,
      },
    );
    if (!updated) {
      technicalMetrics.increment("voice_state_updates_total", 1, {
        result: "conflict",
      });
      throw new AppError("VOICE_SOURCE_CHANGED", 409);
    }
    technicalMetrics.increment("voice_state_updates_total", 1, {
      result: "updated",
    });
    await this.publishVoiceUpdate(
      server.id,
      [channel.id],
      "voice.member.state.updated",
      {
        channelId: channel.id,
        userId: actor.id,
        sessionId: updated.sessionId,
        patch: {
          muted: updated.muted,
          deafened: updated.deafened,
          speaking: updated.speaking,
          connectionQuality: updated.connectionQuality,
        },
      },
    );
  }

  async reconcileVoicePresence(serverId?: string): Promise<number> {
    const serverIds = serverId
      ? [serverId]
      : await this.voicePresenceStore.activeServerIds();
    let totalDiff = 0;
    for (const candidateServerId of serverIds) {
      let serverDiff = 0;
      const server = await this.store.findServerById(candidateServerId);
      if (!server) continue;
      const channels = (await this.store.listServerChannels(server.id)).filter(
        (channel) => channel.type === "voice" && channel.livekitRoomName,
      );
      const actualByChannel = new Map<string, Set<string>>();
      for (const channel of channels) {
        const actual = new Set(
          (
            await this.voiceTransport.listParticipants(channel.livekitRoomName!)
          ).map((participant) => participant.identity),
        );
        actualByChannel.set(channel.id, actual);
        for (const identity of actual) {
          const userId = this.voiceUserIdFromIdentity(identity);
          if (!userId || !(await this.store.findServerMember(server.id, userId)))
            continue;
          const current = await this.voicePresenceStore.getSession(userId);
          if (
            current?.channelId === channel.id &&
            current.participantIdentity === identity
          )
            continue;
          const now = this.now().toISOString();
          await this.voicePresenceStore.upsertSession({
            sessionId: current?.participantIdentity === identity
              ? current.sessionId
              : identity,
            userId,
            serverId: server.id,
            channelId: channel.id,
            livekitRoomName: channel.livekitRoomName!,
            participantIdentity: identity,
            participantSid: current?.participantIdentity === identity
              ? current.participantSid
              : null,
            muted: current?.muted ?? false,
            deafened: current?.deafened ?? false,
            speaking: false,
            screenSharing: current?.screenSharing ?? false,
            connectionQuality: current?.connectionQuality ?? "unknown",
            joinedAt: current?.joinedAt ?? now,
            updatedAt: now,
          });
          totalDiff += 1;
          serverDiff += 1;
        }
      }
      const projected = await this.voicePresenceStore.snapshot(server.id);
      for (const session of projected.sessions) {
        if (
          actualByChannel
            .get(session.channelId)
            ?.has(session.participantIdentity)
        )
          continue;
        const mutation = await this.voicePresenceStore.removeSession(
          session.userId,
          session.sessionId,
          session.channelId,
        );
        if (mutation.changed) {
          totalDiff += 1;
          serverDiff += 1;
        }
      }
      if (serverDiff > 0) {
        const reconciled = await this.voicePresenceStore.snapshot(server.id);
        await this.broadcastServerUpdate(
          server.id,
          "voice.server.snapshot.required",
          { version: reconciled.version },
        );
      }
    }
    if (totalDiff > 0)
      technicalMetrics.increment(
        "voice_presence_reconciliation_diff_total",
        totalDiff,
      );
    return totalDiff;
  }

  async requestServerVoiceMove(
    authorization: string | undefined,
    serverId: string,
    input: MoveVoiceMemberRequest,
  ): Promise<MoveVoiceMemberAccepted> {
    const startedAt = performance.now();
    const actor = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    const channel = await this.requireVoiceChannel(input.targetChannelId);
    if (channel.serverId !== server.id)
      throw new AppError("CHANNEL_NOT_FOUND", 404);
    if (!this.config.VOICE_DND_ENABLED)
      throw new AppError("SERVER_PERMISSION_DENIED", 403);
    const [subjectMember, subjectUser] = await Promise.all([
      this.store.findServerMember(server.id, input.subjectUserId),
      this.store.findUserById(input.subjectUserId),
    ]);
    if (!subjectMember || !subjectUser?.displayName)
      throw new AppError("SERVER_NOT_FOUND", 404);
    const targetPermissions = await this.channelPermissionsFor(
      server,
      channel,
      subjectUser,
    );
    if (!targetPermissions.has("VIEW_CHANNEL") || !targetPermissions.has("CONNECT_VOICE"))
      throw new AppError("SERVER_PERMISSION_DENIED", 403);

    let source = await this.voicePresenceStore.getSession(input.subjectUserId);
    if (!source || source.serverId !== server.id) {
      source = await this.discoverVoiceSession(server, input.subjectUserId);
      if (source) await this.voicePresenceStore.upsertSession(source);
    }
    if (!source) throw new AppError("PARTICIPANT_NOT_IN_VOICE", 409);
    if (source.channelId === channel.id)
      throw new AppError("VOICE_MOVE_CONFLICT", 409);
    if (
      input.expectedSourceChannelId &&
      input.expectedSourceChannelId !== source.channelId
    )
      throw new AppError("VOICE_SOURCE_CHANGED", 409);
    if (
      input.expectedVoiceSessionId &&
      input.expectedVoiceSessionId !== source.sessionId
    )
      throw new AppError("VOICE_SOURCE_CHANGED", 409);

    if (actor.id !== input.subjectUserId) {
      if (!this.config.VOICE_MODERATOR_MOVE_ENABLED)
        throw new AppError("SERVER_PERMISSION_DENIED", 403);
      const sourceChannel = await this.requireVoiceChannel(source.channelId);
      await this.requireChannelPermission(server, sourceChannel, actor, "MOVE_MEMBERS");
      await this.requireChannelPermission(server, channel, actor, "MOVE_MEMBERS");
      if (input.subjectUserId === server.ownerUserId)
        throw new AppError("SERVER_PERMISSION_DENIED", 403);
      const roles = await this.store.listServerRoles(server.id);
      const actorTopPosition = await this.serverRolePositionFor(server, actor, roles);
      const subjectRoleIds = new Set(
        await this.store.listMemberRoleIds(server.id, input.subjectUserId),
      );
      const subjectTopPosition = Math.max(
        0,
        ...roles
          .filter((role) => subjectRoleIds.has(role.id))
          .map((role) => role.position),
      );
      if (subjectTopPosition >= actorTopPosition)
        throw new AppError("SERVER_PERMISSION_DENIED", 403);
    }
    if (!channel.livekitRoomName) throw new AppError("CHANNEL_NOT_FOUND", 404);
    try {
      await this.media.createRoom({
        id: channel.id,
        ownerUserId: server.ownerUserId,
        name: channel.livekitRoomName,
        maxParticipants: 25,
      });
    } catch {
      throw new AppError("LIVEKIT_UNAVAILABLE", 503);
    }
    if ((await this.media.participantCount(channel.livekitRoomName)) >= 25)
      throw new AppError("VOICE_TARGET_FULL", 409);

    const createdAt = this.now();
    const move: PendingVoiceMove = {
      movementId: randomUUID(),
      clientRequestId: input.clientRequestId,
      actorUserId: actor.id,
      subjectUserId: input.subjectUserId,
      serverId: server.id,
      fromChannelId: source.channelId,
      toChannelId: channel.id,
      voiceSessionId: source.sessionId,
      status: "authorized",
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(
        createdAt.getTime() + this.config.VOICE_MOVE_TIMEOUT_SECONDS * 1_000,
      ).toISOString(),
      failureCode: null,
    };
    const result = await this.voicePresenceStore.createMove(
      move,
      this.config.VOICE_MOVE_TIMEOUT_SECONDS,
    );
    if (result.status === "conflict")
      throw new AppError("VOICE_MOVE_CONFLICT", 409);
    const acceptedMove = result.move;
    if (result.status === "created") {
      technicalMetrics.increment("voice_move_requests_total", 1, {
        strategy: this.config.VOICE_MOVE_STRATEGY,
      });
      await this.voicePresenceStore.updateMove(
        acceptedMove.movementId,
        "dispatching",
      );
      if (this.config.VOICE_MOVE_STRATEGY === "livekit-cloud") {
        try {
          await this.voiceTransport.moveParticipant({
            sourceRoomName: source.livekitRoomName,
            participantIdentity: source.participantIdentity,
            destinationRoomName: channel.livekitRoomName,
            permissions: {
              canPublishMicrophone: targetPermissions.has("SPEAK"),
              canPublishCamera: targetPermissions.has("STREAM_VIDEO"),
              canPublishScreen: targetPermissions.has("STREAM_SCREEN"),
              canPublishScreenAudio: targetPermissions.has(
                "STREAM_APPLICATION_AUDIO",
              ),
            },
          });
        } catch (error) {
          await this.failVoiceMove(acceptedMove, "TRANSPORT_ERROR");
          throw new AppError("LIVEKIT_UNAVAILABLE", 503, undefined, {
            operation: "move_participant",
            reason: error instanceof Error ? error.message : "unknown",
          });
        }
      }
      await this.voicePresenceStore.updateMove(
        acceptedMove.movementId,
        "waiting_for_target_join",
      );
      if (
        this.config.VOICE_MOVE_STRATEGY === "controlled-reconnect" &&
        this.realtimeBus
      )
        await this.realtimeBus.publish({
            id: randomUUID(),
            type: "voice.member.move.required",
            occurredAt: this.now().toISOString(),
            conversationId: null,
            targetUserIds: [acceptedMove.subjectUserId],
            payload: {
              movementId: acceptedMove.movementId,
              serverId: acceptedMove.serverId,
              fromChannelId: acceptedMove.fromChannelId,
              toChannelId: acceptedMove.toChannelId,
              expiresAt: acceptedMove.expiresAt,
              connectionEndpoint: "/api/v1/voice/move-request",
            },
        });
      await this.publishVoiceUpdate(server.id, [
        acceptedMove.fromChannelId,
        acceptedMove.toChannelId,
      ], "voice.member.move.pending", {
          movementId: acceptedMove.movementId,
          subjectUserId: acceptedMove.subjectUserId,
          fromChannelId: acceptedMove.fromChannelId,
          toChannelId: acceptedMove.toChannelId,
          expiresAt: acceptedMove.expiresAt,
      });
      this.scheduleVoiceMoveTimeout(acceptedMove);
      if (actor.id !== input.subjectUserId)
        await this.recordServerAudit(
          server.id,
          actor,
          "MEMBER_VOICE_MOVED",
          "MEMBER",
          input.subjectUserId,
          null,
          { channelId: channel.id, channelName: channel.name },
        );
    }
    technicalMetrics.observeHistogram(
      "voice_move_duration_ms",
      performance.now() - startedAt,
      [10, 25, 50, 100, 250, 500, 1_000, 2_500],
      { status: "accepted" },
    );
    technicalMetrics.observeHistogram(
      "voice_move_duration_seconds",
      Math.max(0, performance.now() - startedAt) / 1_000,
      [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      { status: "accepted" },
    );
    return {
      movementId: acceptedMove.movementId,
      status: "pending",
      expiresAt: acceptedMove.expiresAt,
    };
  }

  async requestVoiceMemberMove(
    authorization: string | undefined,
    channelId: string,
    memberUserId: string,
  ): Promise<void> {
    const channel = await this.requireVoiceChannel(channelId);
    await this.requestServerVoiceMove(authorization, channel.serverId, {
      clientRequestId: randomUUID(),
      subjectUserId: memberUserId,
      targetChannelId: channelId,
    });
  }

  async pollVoiceMemberMove(
    authorization: string | undefined,
  ): Promise<RoomConnection | null> {
    const user = await this.authenticate(authorization);
    const pending = await this.voicePresenceStore.getMoveForUser(user.id);
    if (!pending) return null;
    if (new Date(pending.expiresAt).getTime() <= this.now().getTime()) {
      await this.failVoiceMove(pending, "TIMEOUT");
      return null;
    }
    if (pending.status !== "waiting_for_target_join") return null;
    const connection = await this.connectVoiceChannel(
      authorization,
      pending.toChannelId,
    );
    const currentSession = await this.voicePresenceStore.getSession(user.id);
    return {
      ...connection,
      ...(this.config.VOICE_MOVE_STRATEGY === "livekit-cloud" && currentSession
        ? {
            participantIdentity: currentSession.participantIdentity,
            voiceSessionId: currentSession.sessionId,
          }
        : {}),
      seamlesslyMoved: this.config.VOICE_MOVE_STRATEGY === "livekit-cloud",
    };
  }

  private async discoverVoiceSession(
    server: ServerRecord,
    userId: string,
  ): Promise<VoiceSession | null> {
    for (const channel of await this.store.listServerChannels(server.id)) {
      if (channel.type !== "voice" || !channel.livekitRoomName) continue;
      const identity = (
        await this.voiceTransport.listParticipants(channel.livekitRoomName)
      ).find((candidate) => candidate.identity.startsWith(`user_${userId}_`))
        ?.identity;
      if (!identity) continue;
      const now = this.now().toISOString();
      return {
        sessionId: identity,
        userId,
        serverId: server.id,
        channelId: channel.id,
        livekitRoomName: channel.livekitRoomName,
        participantIdentity: identity,
        participantSid: null,
        muted: false,
        deafened: false,
        speaking: false,
        screenSharing: false,
        connectionQuality: "unknown",
        joinedAt: now,
        updatedAt: now,
      };
    }
    return null;
  }

  private scheduleVoiceMoveTimeout(move: PendingVoiceMove): void {
    const existing = this.voiceMoveTimeouts.get(move.movementId);
    if (existing) clearTimeout(existing);
    const delay = Math.max(
      0,
      new Date(move.expiresAt).getTime() - this.now().getTime(),
    );
    const timer = setTimeout(() => {
      this.voiceMoveTimeouts.delete(move.movementId);
      void this.voicePresenceStore.getMove(move.movementId).then((current) => {
        if (
          current &&
          current.status !== "confirmed" &&
          current.status !== "failed" &&
          current.status !== "timed_out" &&
          current.status !== "cancelled"
        )
          return this.failVoiceMove(current, "TIMEOUT");
        return undefined;
      });
    }, delay);
    timer.unref();
    this.voiceMoveTimeouts.set(move.movementId, timer);
  }

  private async failVoiceMove(
    move: PendingVoiceMove,
    failureCode: string,
  ): Promise<void> {
    const timeout = this.voiceMoveTimeouts.get(move.movementId);
    if (timeout) clearTimeout(timeout);
    this.voiceMoveTimeouts.delete(move.movementId);
    await this.voicePresenceStore.updateMove(
      move.movementId,
      failureCode === "TIMEOUT" ? "timed_out" : "failed",
      failureCode,
    );
    await this.voicePresenceStore.finishMove(move.movementId);
    const removal =
      failureCode === "TIMEOUT"
        ? await this.voicePresenceStore.removeSession(
            move.subjectUserId,
            move.voiceSessionId,
            move.fromChannelId,
          )
        : {
            changed: false,
            version: 0,
            previousChannelId: null,
            previousSessionId: null,
          };
    technicalMetrics.increment(
      failureCode === "TIMEOUT"
        ? "voice_move_timeout_total"
        : "voice_move_failure_total",
      1,
      { failureCode },
    );
    if (removal.changed)
      await this.publishVoiceUpdate(move.serverId, [move.fromChannelId], "voice.member.left", {
        channelId: removal.previousChannelId,
        userId: move.subjectUserId,
        sessionId: removal.previousSessionId,
        version: removal.version,
      });
    await this.publishVoiceUpdate(move.serverId, [
      move.fromChannelId,
      move.toChannelId,
    ], "voice.member.move.failed", {
      movementId: move.movementId,
      subjectUserId: move.subjectUserId,
      code: failureCode,
      message:
        failureCode === "TIMEOUT"
          ? "Перемещение заняло слишком много времени."
          : "Не удалось подключить участника к новому каналу.",
    });
  }

  private voiceUserIdFromIdentity(identity: string | undefined): string | null {
    if (!identity) return null;
    return /^user_([0-9a-f-]{36})_/iu.exec(identity)?.[1] ?? null;
  }

  async kickChannelParticipant(
    authorization: string | undefined,
    channelId: string,
    participantIdentity: string,
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    const channel = await this.requireVoiceChannel(channelId);
    const server = await this.requireServer(channel.serverId);
    await this.requireChannelPermission(server, channel, user, "MUTE_MEMBERS");
    if (participantIdentity.startsWith(`user_${user.id}_`))
      throw new AppError("SERVER_PERMISSION_DENIED", 403);
    try {
      if (
        !channel.livekitRoomName ||
        !(await this.media.participantExists(
          channel.livekitRoomName,
          participantIdentity,
        ))
      )
        throw new AppError("PARTICIPANT_NOT_FOUND", 404);
      await this.media.removeParticipant(
        channel.livekitRoomName,
        participantIdentity,
      );
      await this.store.releaseChannelLeaseByParticipant(participantIdentity);
      await this.updateScreenShareActiveMetric();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("LIVEKIT_UNAVAILABLE", 503);
    }
  }

  async claimChannelScreenShare(
    authorization: string | undefined,
    channelId: string,
    participantIdentity: string,
  ): Promise<{ expiresAt: string }> {
    const { channel, displayName } = await this.validateChannelMediaParticipant(
      authorization,
      channelId,
      participantIdentity,
      "STREAM_SCREEN",
    );
    try {
      const result = await this.store.claimChannelLease(
        channel.id,
        participantIdentity,
        displayName,
        this.now(),
        this.config.SCREEN_SHARE_LEASE_SECONDS,
      );
      if (result.status === "busy")
        throw new AppError("SCREEN_SHARE_BUSY", 409, undefined, {
          participantDisplayName: result.lease.participantDisplayName,
        });
      technicalMetrics.increment("screen_share_lease_events_total", 1, {
        event: "acquire",
        result: "success",
      });
      await this.updateScreenShareActiveMetric();
      return { expiresAt: result.lease.expiresAt.toISOString() };
    } catch (error) {
      technicalMetrics.increment("screen_share_lease_events_total", 1, {
        event: "acquire",
        result: error instanceof AppError && error.statusCode === 409 ? "busy" : "error",
      });
      throw error;
    }
  }

  async heartbeatChannelScreenShare(
    authorization: string | undefined,
    channelId: string,
    participantIdentity: string,
  ): Promise<{ expiresAt: string }> {
    try {
      // The claim verifies LiveKit presence. Heartbeats only renew that exact
      // owner; participant_left/track_unpublished webhooks release the lease.
      // Avoid coupling every renewal to a transient RoomService HTTP call.
      await this.validateChannelMediaParticipant(
        authorization,
        channelId,
        participantIdentity,
        "STREAM_SCREEN",
        false,
      );
      const lease = await this.store.heartbeatChannelLease(
        channelId,
        participantIdentity,
        this.now(),
        this.config.SCREEN_SHARE_LEASE_SECONDS,
      );
      if (!lease)
        throw new AppError(
          "SCREEN_SHARE_BUSY",
          409,
          "Право на демонстрацию экрана утрачено",
        );
      technicalMetrics.increment("screen_share_lease_heartbeat_total", 1, {
        result: "renewed",
      });
      technicalMetrics.increment("screen_share_lease_events_total", 1, { event: "renew", result: "success" });
      return { expiresAt: lease.expiresAt.toISOString() };
    } catch (error) {
      technicalMetrics.increment("screen_share_lease_heartbeat_total", 1, {
        result:
          error instanceof AppError && error.statusCode === 409
            ? "ownership_lost"
            : error instanceof AppError && error.statusCode < 500
              ? "rejected"
              : "dependency_error",
      });
      technicalMetrics.increment("screen_share_lease_events_total", 1, {
        event: "renew",
        result: error instanceof AppError && error.statusCode === 409
          ? "ownership_lost"
          : error instanceof AppError && error.statusCode < 500
            ? "rejected"
            : "error",
      });
      throw error;
    }
  }

  async releaseChannelScreenShare(
    authorization: string | undefined,
    channelId: string,
    participantIdentity: string,
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    const channel = await this.requireVoiceChannel(channelId);
    await this.requireChannelPermission(
      await this.requireServer(channel.serverId),
      channel,
      user,
      "STREAM_SCREEN",
    );
    if (!participantIdentity.startsWith(`user_${user.id}_`))
      throw new AppError("UNAUTHORIZED", 401);
    const released = await this.store.releaseChannelLease(channelId, participantIdentity);
    technicalMetrics.increment("screen_share_lease_events_total", 1, {
      event: "release",
      result: released ? "success" : "not_found",
    });
    await this.updateScreenShareActiveMetric();
  }

  async handleWebhookEvent(event: {
    id?: string;
    event?: string;
    participant?: {
      identity?: string;
      metadata?: string;
      sid?: string;
    };
    room?: { metadata?: string; name?: string };
    track?: { source?: TrackSource; muted?: boolean };
  }): Promise<void> {
    if (event.id && !(await this.voicePresenceStore.acceptWebhook(event.id))) {
      technicalMetrics.increment("voice_webhook_duplicate_total");
      technicalMetrics.increment("livekit_webhook_events_total", 1, {
        event: liveKitMetricEvent(event.event),
        result: "duplicate",
      });
      return;
    }
    technicalMetrics.increment("livekit_webhook_events_total", 1, {
      event: liveKitMetricEvent(event.event),
      result: "accepted",
    });
    const identity = event.participant?.identity;
    if (
      (event.event === "participant_left" ||
        (event.event === "track_unpublished" &&
          event.track?.source === TrackSource.SCREEN_SHARE)) &&
      identity
    ) {
      await this.store.releaseChannelLeaseByParticipant(identity);
      await this.updateScreenShareActiveMetric();
    }
    if (event.event === "room_finished" && event.room?.metadata) {
      try {
        const metadata = JSON.parse(event.room.metadata) as {
          appChannelId?: string;
        };
        if (metadata.appChannelId) {
          await this.store.releaseChannelLeaseByChannel(metadata.appChannelId);
          await this.updateScreenShareActiveMetric();
          const finishedChannel = await this.store.findServerChannel(
            metadata.appChannelId,
          );
          if (finishedChannel) {
            const snapshot = await this.voicePresenceStore.snapshot(
              finishedChannel.serverId,
            );
            let changed = false;
            for (const session of snapshot.sessions.filter(
              (candidate) => candidate.channelId === finishedChannel.id,
            )) {
              const mutation = await this.voicePresenceStore.removeSession(
                session.userId,
                session.sessionId,
                session.channelId,
              );
              changed ||= mutation.changed;
            }
            if (changed) {
              const next = await this.voicePresenceStore.snapshot(
                finishedChannel.serverId,
              );
              await this.broadcastServerUpdate(
                finishedChannel.serverId,
                "voice.server.snapshot.required",
                { version: next.version },
              );
            }
          }
        }
      } catch {
        // LiveKit metadata is treated as untrusted input.
      }
    }
    let metadata: {
      serverId?: unknown;
      channelId?: unknown;
      userId?: unknown;
      voiceSessionId?: unknown;
    } = {};
    try {
      if (event.participant?.metadata)
        metadata = JSON.parse(event.participant.metadata) as typeof metadata;
    } catch {
      // Participant metadata is untrusted and is validated against PostgreSQL below.
    }
    const serverId =
      typeof metadata.serverId === "string" ? metadata.serverId : null;
    const userId =
      typeof metadata.userId === "string"
        ? metadata.userId
        : this.voiceUserIdFromIdentity(identity);
    if (!serverId || !userId || !identity) return;
    const server = await this.store.findServerById(serverId);
    if (!server || !(await this.store.findServerMember(server.id, userId))) return;
    const channels = await this.store.listServerChannels(server.id);
    const roomChannel = event.room?.name
      ? channels.find((candidate) => candidate.livekitRoomName === event.room?.name)
      : undefined;
    const channel =
      roomChannel ??
      (typeof metadata.channelId === "string"
        ? channels.find((candidate) => candidate.id === metadata.channelId)
        : undefined);
    if (!channel || channel.type !== "voice" || !channel.livekitRoomName) return;
    const sessionId =
      typeof metadata.voiceSessionId === "string"
        ? metadata.voiceSessionId
        : (event.participant?.sid ?? identity);

    if (event.event === "participant_joined") {
      const now = this.now().toISOString();
      const pending = await this.voicePresenceStore.getMoveForUser(userId);
      const mutation = await this.voicePresenceStore.upsertSession({
        sessionId,
        userId,
        serverId: server.id,
        channelId: channel.id,
        livekitRoomName: channel.livekitRoomName,
        participantIdentity: identity,
        participantSid: event.participant?.sid ?? null,
        muted: false,
        deafened: false,
        speaking: false,
        screenSharing: false,
        connectionQuality: "unknown",
        joinedAt: now,
        updatedAt: now,
      });
      if (pending && pending.toChannelId === channel.id) {
        const timeout = this.voiceMoveTimeouts.get(pending.movementId);
        if (timeout) clearTimeout(timeout);
        this.voiceMoveTimeouts.delete(pending.movementId);
        await this.voicePresenceStore.updateMove(
          pending.movementId,
          "confirmed",
        );
        await this.voicePresenceStore.finishMove(pending.movementId);
        technicalMetrics.increment("voice_move_success_total", 1, {
          strategy: this.config.VOICE_MOVE_STRATEGY,
        });
        await this.publishVoiceMoved(
          server.id,
          pending.fromChannelId,
          channel.id,
          {
          movementId: pending.movementId,
          userId,
          sessionId,
          channelName: channel.name,
          version: mutation.version,
          },
        );
      } else if (mutation.changed) {
        await this.publishVoiceUpdate(server.id, [channel.id], "voice.member.joined", {
          channelId: channel.id,
          userId,
          sessionId,
          version: mutation.version,
        });
      }
      technicalMetrics.set("voice_active_sessions", await this.voicePresenceStore.activeSessionCount());
      return;
    }

    if (
      event.event === "participant_left" ||
      event.event === "participant_connection_aborted"
    ) {
      const pending = await this.voicePresenceStore.getMoveForUser(userId);
      const current = await this.voicePresenceStore.getSession(userId);
      if (
        pending &&
        pending.fromChannelId === channel.id &&
        current?.sessionId === sessionId &&
        pending.voiceSessionId === sessionId
      )
        return;
      const mutation = await this.voicePresenceStore.removeSession(
        userId,
        sessionId,
        channel.id,
      );
      if (
        mutation.changed &&
        !(
          pending &&
          pending.fromChannelId === mutation.previousChannelId &&
          pending.voiceSessionId === mutation.previousSessionId
        )
      )
        await this.publishVoiceUpdate(server.id, [channel.id], "voice.member.left", {
          channelId: mutation.previousChannelId,
          userId,
          sessionId: mutation.previousSessionId,
          version: mutation.version,
        });
      technicalMetrics.set("voice_active_sessions", await this.voicePresenceStore.activeSessionCount());
      return;
    }

    if (
      event.event === "track_published" ||
      event.event === "track_unpublished"
    ) {
      const screenSharing = event.track?.source === TrackSource.SCREEN_SHARE;
      if (!screenSharing) return;
      const updated = await this.voicePresenceStore.updateSessionState(
        userId,
        sessionId,
        { screenSharing: event.event === "track_published" },
      );
      if (updated)
        await this.publishVoiceUpdate(server.id, [channel.id], "voice.member.state.updated", {
          channelId: updated.channelId,
          userId,
          sessionId: updated.sessionId,
          patch: { screenSharing: updated.screenSharing },
        });
    }
  }

  async refreshOperationalMetrics(): Promise<void> {
    const [voiceSessions, screenShareSessions] = await Promise.all([
      this.voicePresenceStore.activeSessionCount(),
      this.store.countChannelLeases(this.now()),
    ]);
    technicalMetrics.set("voice_active_sessions", voiceSessions);
    technicalMetrics.set("screen_share_active_sessions", screenShareSessions);
  }

  private async updateScreenShareActiveMetric(): Promise<void> {
    technicalMetrics.set("screen_share_active_sessions", await this.store.countChannelLeases(this.now()));
  }

  private async issueEmailCode(
    email: string,
    purpose: AuthCodeRecord["purpose"],
    credentialHash: string | null = null,
  ): Promise<{ status: "CODE_SENT"; retryAfterSeconds: number }> {
    const now = this.now();
    const latest = await this.store.findLatestAuthCodeForPurpose(
      email,
      purpose,
    );
    if (latest) {
      const retryAt =
        latest.createdAt.getTime() + this.config.OTP_RESEND_SECONDS * 1000;
      if (retryAt > now.getTime()) {
        throw new AppError("RATE_LIMITED", 429, undefined, {
          retryAfterSeconds: Math.ceil((retryAt - now.getTime()) / 1000),
        });
      }
    }
    const code =
      this.config.DEV_FIXED_OTP && this.config.NODE_ENV !== "production"
        ? this.config.DEV_FIXED_OTP
        : randomOtp();
    const authCodeId = randomUUID();
    await this.store.replaceAuthCode({
      id: authCodeId,
      email,
      codeHash: hashOtp(email, code, this.config.OTP_PEPPER),
      purpose,
      credentialHash,
      attempts: 0,
      expiresAt: expiresAt(now, this.config.OTP_TTL_SECONDS),
      consumedAt: null,
      createdAt: now,
    });
    const expiresInMinutes = Math.ceil(this.config.OTP_TTL_SECONDS / 60);
    if (this.canonicalMessagingStore) {
      await this.canonicalMessagingStore.enqueueEmailEvent({
        id: authCodeId,
        eventType: "email.otp",
        payload: {
          email,
          encryptedCode: encryptCredential(
            code,
            this.config.CREDENTIAL_ENCRYPTION_KEY,
          ),
          expiresInMinutes,
          purpose,
        },
        now,
      });
    } else {
      try {
        await this.mailer.sendOtp(email, code, expiresInMinutes, purpose);
      } catch {
        throw new AppError("EMAIL_DELIVERY_FAILED", 502);
      }
    }
    return {
      status: "CODE_SENT",
      retryAfterSeconds: this.config.OTP_RESEND_SECONDS,
    };
  }

  private async consumeEmailCode(
    email: string,
    code: string,
    purpose: AuthCodeRecord["purpose"],
    invalidCode: Extract<ApiErrorCode, "INVALID_OTP" | "INVALID_SECOND_FACTOR">,
  ): Promise<AuthCodeRecord> {
    const now = this.now();
    const authCode = await this.store.findLatestAuthCodeForPurpose(
      email,
      purpose,
    );
    if (!authCode || authCode.consumedAt) throw new AppError(invalidCode, 401);
    if (isExpired(authCode.expiresAt, now))
      throw new AppError("OTP_EXPIRED", 401);
    if (authCode.attempts >= 5)
      throw new AppError("OTP_ATTEMPTS_EXCEEDED", 429);
    const actualHash = hashOtp(email, code, this.config.OTP_PEPPER);
    if (!safeHashEqual(authCode.codeHash, actualHash)) {
      const attempts = await this.store.incrementAuthCodeAttempts(authCode.id);
      if (attempts >= 5) throw new AppError("OTP_ATTEMPTS_EXCEEDED", 429);
      throw new AppError(invalidCode, 401);
    }
    if (!(await this.store.consumeAuthCode(authCode.id, now)))
      throw new AppError(invalidCode, 401);
    return authCode;
  }

  private async requireValidPassword(
    email: string,
    password: string,
  ): Promise<UserRecord> {
    const user = await this.store.findUserByEmail(email);
    if (!user?.passwordHash) {
      await hashPassword(password);
      throw new AppError("INVALID_CREDENTIALS", 401);
    }
    if (!(await verifyPassword(password, user.passwordHash)))
      throw new AppError("INVALID_CREDENTIALS", 401);
    return user;
  }

  async listCanonicalConversations(
    authorization: string | undefined,
  ): Promise<ConversationSummary[]> {
    const user = await this.authenticate(authorization);
    this.requireCompleteProfile(user);
    const summaries = await this.messaging().listConversations(user.id);
    const visible = await Promise.all(
      summaries.map(async (summary) => {
        try {
          await this.requireCanonicalConversation(
            summary.id,
            user,
            "READ_MESSAGE_HISTORY",
          );
          return summary;
        } catch {
          return null;
        }
      }),
    );
    return visible.filter(
      (summary): summary is ConversationSummary => summary !== null,
    );
  }

  async getServerOverviewSettings(
    authorization: string | undefined,
    serverId: string,
  ): Promise<ServerOverviewSettings> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, "VIEW_SERVER");
    const settings = await this.settings().getOverview(serverId);
    if (!settings) throw new AppError("SERVER_NOT_FOUND", 404);
    return settings;
  }

  async updateServerOverviewSettings(
    authorization: string | undefined,
    serverId: string,
    input: ServerOverviewUpdate,
  ): Promise<ServerOverviewSettings> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, "MANAGE_SERVER");
    const updated = await this.settings().updateOverview(
      serverId,
      input,
      this.now(),
    );
    if (!updated)
      throw new AppError("VALIDATION_ERROR", 409, undefined, {
        field: "version",
        message: "Настройки изменились в другой сессии",
      });
    await this.recordServerAudit(
      serverId,
      user,
      "SERVER_OVERVIEW_UPDATED",
      "SERVER",
      serverId,
      { name: server.name },
      input,
    );
    await this.broadcastServerUpdate(serverId, "server.updated", {
      action: "overview",
      version: updated.version,
    });
    return updated;
  }

  async getServerAppearanceSettings(
    authorization: string | undefined,
    serverId: string,
  ): Promise<ServerAppearanceSettings> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, "VIEW_SERVER");
    const settings = await this.settings().getAppearance(
      serverId,
      async (key) => (await this.publicMediaUrl(key)) ?? "",
    );
    if (!settings) throw new AppError("SERVER_NOT_FOUND", 404);
    return settings;
  }

  async createServerAppearanceUploadIntent(
    authorization: string | undefined,
    serverId: string,
    input: { kind: "icon" | "banner"; mimeType: string; sizeBytes: number },
  ): Promise<{
    objectKey: string;
    uploadUrl: string;
    headers: Record<string, string>;
    expiresAt: string;
  }> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, "MANAGE_SERVER");
    if (!this.objectStorage)
      throw new AppError("MEDIA_STORAGE_UNAVAILABLE", 503);
    if (!["image/jpeg", "image/png", "image/webp"].includes(input.mimeType))
      throw new AppError("ATTACHMENT_TYPE_NOT_ALLOWED", 415);
    const maxSize = input.kind === "icon" ? 5 * 1024 * 1024 : 12 * 1024 * 1024;
    if (input.sizeBytes > maxSize)
      throw new AppError("ATTACHMENT_TOO_LARGE", 413);
    const objectKey = `servers/${serverId}/${input.kind}/${randomUUID()}`;
    const expiresAtValue = expiresAt(this.now(), 900);
    return {
      objectKey,
      uploadUrl: await this.objectStorage.createPutUrl(
        objectKey,
        input.mimeType,
        input.sizeBytes,
        900,
      ),
      headers: { "Content-Type": input.mimeType },
      expiresAt: expiresAtValue.toISOString(),
    };
  }

  async updateServerAppearanceSettings(
    authorization: string | undefined,
    serverId: string,
    input: {
      iconObjectKey?: string | null | undefined;
      bannerObjectKey?: string | null | undefined;
      accentColor: string | null;
      version: number;
    },
  ): Promise<ServerAppearanceSettings> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, "MANAGE_SERVER");
    const previous = await this.settings().getAppearanceObjectKeys(serverId);
    for (const key of [input.iconObjectKey, input.bannerObjectKey]) {
      if (
        key &&
        (!key.startsWith(`servers/${serverId}/`) || !this.objectStorage)
      )
        throw new AppError("VALIDATION_ERROR", 400);
      if (key && this.objectStorage)
        await this.objectStorage.headObject(key).catch(() => {
          throw new AppError("ATTACHMENT_NOT_FOUND", 404);
        });
    }
    if (!(await this.settings().updateAppearance(serverId, input, this.now())))
      throw new AppError("VALIDATION_ERROR", 409, undefined, {
        field: "version",
        message: "Настройки изменились в другой сессии",
      });
    if (input.iconObjectKey !== undefined)
      await this.enqueueReplacedMediaCleanup(
        previous?.iconObjectKey ?? null,
        input.iconObjectKey ?? null,
        "replaced_server_icon",
      );
    if (input.bannerObjectKey !== undefined)
      await this.enqueueReplacedMediaCleanup(
        previous?.bannerObjectKey ?? null,
        input.bannerObjectKey ?? null,
        "replaced_server_banner",
      );
    await this.recordServerAudit(
      serverId,
      user,
      "SERVER_APPEARANCE_UPDATED",
      "SERVER",
      serverId,
      null,
      input,
    );
    return this.getServerAppearanceSettings(authorization, serverId);
  }

  private async enqueueReplacedMediaCleanup(
    previousObjectKey: string | null,
    nextObjectKey: string | null,
    reason: string,
  ): Promise<void> {
    if (!previousObjectKey || previousObjectKey === nextObjectKey) return;
    if (this.canonicalMessagingStore) {
      await this.canonicalMessagingStore.enqueueObjectDeletion(
        previousObjectKey,
        reason,
        this.now(),
      );
      return;
    }
    if (this.objectStorage)
      await this.objectStorage.deleteObject(previousObjectKey).catch(() => {
        /* Cleanup retries require the production deletion queue. */
      });
  }

  async listServerSettingsMembers(
    authorization: string | undefined,
    serverId: string,
    search?: string,
  ): Promise<ServerSettingsMember[]> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, "VIEW_SERVER");
    return this.settings().listMembers(
      serverId,
      search?.trim() || null,
      user.id,
    );
  }

  async updateOwnServerDisplayName(
    authorization: string | undefined,
    serverId: string,
    displayName: string | null,
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    if (!(await this.store.findServerMember(server.id, user.id)))
      throw new AppError("SERVER_PERMISSION_DENIED", 403);
    if (
      !(await this.store.updateOwnServerDisplayName(
        server.id,
        user.id,
        displayName,
      ))
    )
      throw new AppError("SERVER_NOT_FOUND", 404);
  }

  async updatePrivateServerMemberAlias(
    authorization: string | undefined,
    serverId: string,
    memberUserId: string,
    alias: string | null,
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    const [viewer, target] = await Promise.all([
      this.store.findServerMember(server.id, user.id),
      this.store.findServerMember(server.id, memberUserId),
    ]);
    if (!viewer || !target) throw new AppError("SERVER_PERMISSION_DENIED", 403);
    if (memberUserId === user.id)
      throw new AppError("VALIDATION_ERROR", 400, undefined, {
        field: "alias",
        message: "Для себя используйте отображаемое имя сервера",
      });
    await this.store.setServerMemberAlias(
      server.id,
      user.id,
      memberUserId,
      alias,
      this.now(),
    );
  }

  async updateServerSettingsMember(
    authorization: string | undefined,
    serverId: string,
    memberUserId: string,
    input: {
      mutedUntil?: string | null | undefined;
      deafened?: boolean | undefined;
    },
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, "MUTE_MEMBERS");
    if (memberUserId === server.ownerUserId && memberUserId !== user.id)
      throw new AppError("SERVER_PERMISSION_DENIED", 403);
    const memberUpdate: { mutedUntil?: Date | null; deafened?: boolean } = {};
    if (input.mutedUntil !== undefined)
      memberUpdate.mutedUntil = input.mutedUntil
        ? new Date(input.mutedUntil)
        : null;
    if (input.deafened !== undefined) memberUpdate.deafened = input.deafened;
    const changed = await this.settings().updateMember(
      serverId,
      memberUserId,
      memberUpdate,
    );
    if (!changed) throw new AppError("SERVER_NOT_FOUND", 404);
    await this.recordServerAudit(
      serverId,
      user,
      "MEMBER_UPDATED",
      "MEMBER",
      memberUserId,
      null,
      input,
    );
  }

  async listServerChannelSettings(
    authorization: string | undefined,
    serverId: string,
  ): Promise<{
    categories: ServerChannelCategory[];
    channels: ServerChannelSettings[];
  }> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, "VIEW_SERVER");
    const [categories, channels] = await Promise.all([
      this.settings().listCategories(serverId),
      this.settings().listChannels(serverId),
    ]);
    return { categories, channels };
  }

  async createServerCategory(
    authorization: string | undefined,
    serverId: string,
    name: string,
    position?: number,
  ): Promise<ServerChannelCategory> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, "MANAGE_CHANNELS");
    const categories = await this.settings().listCategories(serverId);
    const created = await this.settings().createCategory(
      randomUUID(),
      serverId,
      name,
      position ?? Math.max(-1, ...categories.map((item) => item.position)) + 1,
      this.now(),
    );
    await this.recordServerAudit(
      serverId,
      user,
      "CHANNEL_CATEGORY_CREATED",
      "CATEGORY",
      created.id,
      null,
      created,
    );
    return created;
  }

  async updateServerCategory(
    authorization: string | undefined,
    serverId: string,
    categoryId: string,
    input: { name?: string | undefined; position?: number | undefined },
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, "MANAGE_CHANNELS");
    if (
      !(await this.settings().updateCategory(
        serverId,
        categoryId,
        input,
        this.now(),
      ))
    )
      throw new AppError("CHANNEL_NOT_FOUND", 404);
    await this.recordServerAudit(
      serverId,
      user,
      "CHANNEL_CATEGORY_UPDATED",
      "CATEGORY",
      categoryId,
      null,
      input,
    );
  }

  async deleteServerCategory(
    authorization: string | undefined,
    serverId: string,
    categoryId: string,
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, "MANAGE_CHANNELS");
    if (!(await this.settings().deleteCategory(serverId, categoryId)))
      throw new AppError("CHANNEL_NOT_FOUND", 404);
    await this.recordServerAudit(
      serverId,
      user,
      "CHANNEL_CATEGORY_DELETED",
      "CATEGORY",
      categoryId,
      null,
      null,
    );
  }

  async updateServerChannelSettings(
    authorization: string | undefined,
    serverId: string,
    channelId: string,
    input: {
      name?: string | undefined;
      position?: number | undefined;
      categoryId?: string | null | undefined;
      slowModeSeconds?: number | undefined;
      maxParticipants?: number | null | undefined;
      bitrate?: number | null | undefined;
      archived?: boolean | undefined;
      version: number;
    },
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, "MANAGE_CHANNELS");
    const before = (await this.settings().listChannels(serverId)).find(
      (channel) => channel.id === channelId,
    );
    if (!before) throw new AppError("CHANNEL_NOT_FOUND", 404);
    if (
      !(await this.settings().updateChannel(
        serverId,
        channelId,
        input,
        this.now(),
      ))
    )
      throw new AppError("VALIDATION_ERROR", 409, undefined, {
        field: "version",
        message: "Канал изменился в другой сессии",
      });
    const after =
      (await this.settings().listChannels(serverId)).find(
        (channel) => channel.id === channelId,
      ) ?? input;
    await this.recordServerAudit(
      serverId,
      user,
      input.name === undefined ? "CHANNEL_SETTINGS_UPDATED" : "CHANNEL_RENAMED",
      "CHANNEL",
      channelId,
      before,
      after,
    );
    await this.broadcastServerUpdate(serverId, "server.channel.updated", {
      action: "updated",
      channelId,
      version: "version" in after ? after.version : input.version + 1,
    });
  }

  async listServerInvites(
    authorization: string | undefined,
    serverId: string,
  ): Promise<ServerInviteSettings[]> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, "MANAGE_INVITES");
    return this.settings().listInvites(serverId);
  }

  async createServerInvite(
    authorization: string | undefined,
    serverId: string,
    input: {
      destinationChannelId: string | null;
      expiresInSeconds: number | null;
      maxUses: number | null;
    },
  ): Promise<CreatedServerInvite> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, "MANAGE_INVITES");
    const token = randomOpaqueToken(18);
    const created = await this.settings().createInvite({
      id: randomUUID(),
      serverId,
      actorUserId: user.id,
      destinationChannelId: input.destinationChannelId,
      tokenHash: hashOpaqueToken(token),
      tokenPreview: `…${token.slice(-6)}`,
      expiresAt:
        input.expiresInSeconds === null
          ? null
          : expiresAt(this.now(), input.expiresInSeconds),
      maxUses: input.maxUses,
      now: this.now(),
    });
    await this.recordServerAudit(
      serverId,
      user,
      "INVITE_CREATED",
      "INVITE",
      created.id,
      null,
      {
        destinationChannelId: created.destinationChannelId,
        expiresAt: created.expiresAt,
        maxUses: created.maxUses,
      },
    );
    return {
      ...created,
      createdByDisplayName: user.displayName ?? user.email,
      inviteUrl: this.inviteUrl(token),
    };
  }

  async revokeServerInvite(
    authorization: string | undefined,
    serverId: string,
    inviteId: string,
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, "MANAGE_INVITES");
    if (!(await this.settings().revokeInvite(serverId, inviteId, this.now())))
      throw new AppError("SERVER_NOT_FOUND", 404);
    await this.recordServerAudit(
      serverId,
      user,
      "INVITE_REVOKED",
      "INVITE",
      inviteId,
      null,
      null,
    );
  }

  async getServerModerationSettings(
    authorization: string | undefined,
    serverId: string,
  ): Promise<ServerModerationSettings> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, "VIEW_SERVER");
    const settings = await this.settings().getModeration(serverId);
    if (!settings) throw new AppError("SERVER_NOT_FOUND", 404);
    return settings;
  }

  async updateServerModerationSettings(
    authorization: string | undefined,
    serverId: string,
    input: ServerModerationUpdate,
  ): Promise<ServerModerationSettings> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, "MANAGE_SERVER_SECURITY");
    if (!(await this.settings().updateModeration(serverId, input, this.now())))
      throw new AppError("VALIDATION_ERROR", 409, undefined, {
        field: "version",
        message: "Настройки изменились в другой сессии",
      });
    await this.recordServerAudit(
      serverId,
      user,
      "MODERATION_SETTINGS_UPDATED",
      "SERVER",
      serverId,
      null,
      input,
    );
    return this.getServerModerationSettings(authorization, serverId);
  }

  async listServerBans(
    authorization: string | undefined,
    serverId: string,
  ): Promise<ServerBanSettings[]> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, "BAN_MEMBERS");
    return this.settings().listBans(serverId);
  }

  async banServerMember(
    authorization: string | undefined,
    serverId: string,
    memberUserId: string,
    reason: string,
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, "BAN_MEMBERS");
    if (memberUserId === server.ownerUserId || memberUserId === user.id)
      throw new AppError("SERVER_PERMISSION_DENIED", 403);
    const roles = await this.store.listServerRoles(server.id);
    const actorTopPosition = await this.serverRolePositionFor(
      server,
      user,
      roles,
    );
    const targetRoleIds = new Set(
      await this.store.listMemberRoleIds(server.id, memberUserId),
    );
    if (
      Math.max(
        0,
        ...roles
          .filter((role) => targetRoleIds.has(role.id))
          .map((role) => role.position),
      ) >= actorTopPosition
    )
      throw new AppError("SERVER_PERMISSION_DENIED", 403);
    if (
      !(await this.settings().banMember(
        serverId,
        memberUserId,
        user.id,
        reason,
        this.now(),
      ))
    )
      throw new AppError("SERVER_NOT_FOUND", 404);
    await this.recordServerAudit(
      serverId,
      user,
      "MEMBER_BANNED",
      "MEMBER",
      memberUserId,
      null,
      { reason },
    );
  }

  async unbanServerMember(
    authorization: string | undefined,
    serverId: string,
    memberUserId: string,
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, "BAN_MEMBERS");
    if (
      !(await this.settings().unbanMember(
        serverId,
        memberUserId,
        user.id,
        this.now(),
      ))
    )
      throw new AppError("SERVER_NOT_FOUND", 404);
    await this.recordServerAudit(
      serverId,
      user,
      "MEMBER_UNBANNED",
      "MEMBER",
      memberUserId,
      null,
      null,
    );
  }

  async listServerSettingsAudit(
    authorization: string | undefined,
    serverId: string,
    input: {
      before?: string | undefined;
      action?: string | undefined;
      actorUserId?: string | undefined;
      limit: number;
    },
  ): Promise<ServerAuditLogPage> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    await this.requireServerPermission(server, user, "VIEW_AUDIT_LOG");
    return this.settings().listAudit(serverId, {
      before: input.before ? new Date(input.before) : null,
      action: input.action ?? null,
      actorUserId: input.actorUserId ?? null,
      limit: input.limit,
    });
  }

  async revokeAllServerInvites(
    authorization: string | undefined,
    serverId: string,
    reauthentication: { password: string; totpCode: string | null },
  ): Promise<{ revoked: number }> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    if (server.ownerUserId !== user.id)
      throw new AppError("SERVER_PERMISSION_DENIED", 403);
    await this.requireDangerReauthentication(user, reauthentication);
    const revoked = await this.settings().revokeAllInvites(
      serverId,
      this.now(),
    );
    await this.recordServerAudit(
      serverId,
      user,
      "ALL_INVITES_REVOKED",
      "SERVER",
      serverId,
      null,
      { revoked },
    );
    return { revoked };
  }

  async archiveServer(
    authorization: string | undefined,
    serverId: string,
    archived: boolean,
    reauthentication: { password: string; totpCode: string | null },
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    if (server.ownerUserId !== user.id)
      throw new AppError("SERVER_PERMISSION_DENIED", 403);
    await this.requireDangerReauthentication(user, reauthentication);
    if (
      !(await this.settings().setArchived(
        serverId,
        user.id,
        archived,
        this.now(),
      ))
    )
      throw new AppError("SERVER_PERMISSION_DENIED", 403);
    await this.recordServerAudit(
      serverId,
      user,
      archived ? "SERVER_ARCHIVED" : "SERVER_RESTORED",
      "SERVER",
      serverId,
      null,
      null,
    );
  }

  async transferServerOwnership(
    authorization: string | undefined,
    serverId: string,
    memberUserId: string,
    reauthentication: { password: string; totpCode: string | null },
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    if (server.ownerUserId !== user.id || memberUserId === user.id)
      throw new AppError("SERVER_PERMISSION_DENIED", 403);
    await this.requireDangerReauthentication(user, reauthentication);
    if (
      !(await this.settings().transferOwnership(
        serverId,
        user.id,
        memberUserId,
        this.now(),
      ))
    )
      throw new AppError("SERVER_PERMISSION_DENIED", 403);
    await this.recordServerAudit(
      serverId,
      user,
      "OWNERSHIP_TRANSFERRED",
      "MEMBER",
      memberUserId,
      { ownerUserId: user.id },
      { ownerUserId: memberUserId },
    );
  }

  async deleteServerPermanently(
    authorization: string | undefined,
    serverId: string,
    confirmation: string,
    reauthentication: { password: string; totpCode: string | null },
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    const server = await this.requireServer(serverId);
    if (server.ownerUserId !== user.id || confirmation !== server.name)
      throw new AppError("SERVER_PERMISSION_DENIED", 403);
    await this.requireDangerReauthentication(user, reauthentication);
    if (!(await this.settings().deleteServer(serverId, user.id)))
      throw new AppError("SERVER_NOT_FOUND", 404);
  }

  async createCanonicalDirectConversation(
    authorization: string | undefined,
    otherUserId: string,
  ): Promise<ConversationSummary> {
    const user = await this.authenticate(authorization);
    this.requireCompleteProfile(user);
    if (
      otherUserId === user.id ||
      !(await this.store.findUserById(otherUserId))
    )
      throw new AppError("DIRECT_MESSAGE_NOT_ALLOWED", 403);
    const result = await this.messaging().getOrCreateDirectConversation(
      user.id,
      otherUserId,
      this.now(),
    );
    if (result.blocked || !result.allowed)
      throw new AppError("DIRECT_MESSAGE_NOT_ALLOWED", 403);
    const summary = (await this.messaging().listConversations(user.id)).find(
      (candidate) => candidate.id === result.conversation.id,
    );
    if (!summary) throw new AppError("INTERNAL_ERROR", 500);
    return summary;
  }

  async getCanonicalConversation(
    authorization: string | undefined,
    conversationId: string,
  ): Promise<ConversationSummary> {
    const user = await this.authenticate(authorization);
    await this.requireCanonicalConversation(
      conversationId,
      user,
      "READ_MESSAGE_HISTORY",
    );
    const summary = (await this.messaging().listConversations(user.id)).find(
      (candidate) => candidate.id === conversationId,
    );
    if (!summary) throw new AppError("DIRECT_CONVERSATION_NOT_FOUND", 404);
    return summary;
  }

  async listCanonicalMessages(
    authorization: string | undefined,
    conversationId: string,
    before: string | undefined,
    after: string | undefined,
    limit: number,
  ): Promise<ConversationMessagePage> {
    const user = await this.authenticate(authorization);
    await this.requireCanonicalConversation(
      conversationId,
      user,
      "READ_MESSAGE_HISTORY",
    );
    const page = await this.messaging().listMessages(
      conversationId,
      user.id,
      before ?? null,
      after ?? null,
      limit,
    );
    return {
      ...page,
      items: await Promise.all(
        page.items.map((message) => this.resolveConversationMessage(message)),
      ),
    };
  }

  async createCanonicalMessage(
    authorization: string | undefined,
    conversationId: string,
    input: {
      clientMessageId: string;
      content: string;
      replyToMessageId?: string | null | undefined;
      attachmentIds: string[];
      mentions: CanonicalMentionInput[];
    },
  ): Promise<{ message: ConversationMessage; created: boolean }> {
    const user = await this.authenticate(authorization);
    this.requireCompleteProfile(user);
    const access = await this.requireCanonicalConversation(
      conversationId,
      user,
      "SEND_MESSAGES",
    );
    if (
      access.conversation.type !== "server_channel" &&
      (await this.messaging().isDirectConversationBlocked(
        conversationId,
        user.id,
      ))
    )
      throw new AppError("DIRECT_MESSAGE_NOT_ALLOWED", 403);
    if (
      input.attachmentIds.length > this.config.MEDIA_MAX_ATTACHMENTS_PER_MESSAGE
    )
      throw new AppError("VALIDATION_ERROR", 400, undefined, {
        field: "attachmentIds",
      });
    const attachments = await Promise.all(
      input.attachmentIds.map((id) => this.messaging().findAttachment(id)),
    );
    if (
      attachments.reduce(
        (total, attachment) => total + Number(attachment?.sizeBytes ?? 0),
        0,
      ) > this.config.MEDIA_MAX_MESSAGE_TOTAL_BYTES
    )
      throw new AppError("ATTACHMENT_TOO_LARGE", 413, undefined, {
        limit: this.config.MEDIA_MAX_MESSAGE_TOTAL_BYTES,
      });
    if (input.attachmentIds.length > 0 && access.channel)
      await this.requireChannelPermission(
        access.server!,
        access.channel,
        user,
        "SEND_ATTACHMENTS",
      );
    await this.validateCanonicalMentions(access, user, input.mentions);
    try {
      const result = await this.messaging().createMessage({
        conversationId,
        authorId: user.id,
        clientMessageId: input.clientMessageId,
        content: input.content,
        replyToMessageId: input.replyToMessageId ?? null,
        attachmentIds: input.attachmentIds,
        mentions: input.mentions,
        now: this.now(),
      });
      return {
        ...result,
        message: await this.resolveConversationMessage(result.message),
      };
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === "INVALID_REPLY" ||
          error.message === "INVALID_ATTACHMENTS")
      )
        throw new AppError("VALIDATION_ERROR", 400);
      throw error;
    }
  }

  async updateCanonicalMessage(
    authorization: string | undefined,
    messageId: string,
    content: string,
    mentions: CanonicalMentionInput[],
  ): Promise<ConversationMessage> {
    const user = await this.authenticate(authorization);
    const current = await this.messaging().findMessage(messageId, user.id);
    if (!current) throw new AppError("MESSAGE_NOT_FOUND", 404);
    const access = await this.requireCanonicalConversation(
      current.conversationId,
      user,
      "READ_MESSAGE_HISTORY",
    );
    await this.validateCanonicalMentions(access, user, mentions);
    const updated = await this.messaging().editMessage(
      messageId,
      user.id,
      content,
      mentions,
      this.now(),
    );
    if (!updated) throw new AppError("MESSAGE_NOT_FOUND", 404);
    return this.resolveConversationMessage(updated);
  }

  async deleteCanonicalMessage(
    authorization: string | undefined,
    messageId: string,
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    const current = await this.messaging().findMessage(messageId, user.id);
    if (!current) throw new AppError("MESSAGE_NOT_FOUND", 404);
    const access = await this.requireCanonicalConversation(
      current.conversationId,
      user,
      "READ_MESSAGE_HISTORY",
    );
    let canManage = false;
    if (access.channel)
      canManage = (
        await this.channelPermissionsFor(access.server!, access.channel, user)
      ).has("MANAGE_MESSAGES");
    if (current.deletedAt !== null) return;
    // A realtime delivery may race the initiating request. Deletion is
    // intentionally idempotent so that race never creates a false 404 toast.
    const deleted = await this.messaging().softDeleteMessage(
      messageId,
      user.id,
      canManage,
      this.now(),
    );
    if (!deleted) throw new AppError("MESSAGE_NOT_FOUND", 404);
  }

  async setCanonicalReaction(
    authorization: string | undefined,
    messageId: string,
    emoji: string,
    active: boolean,
  ): Promise<ConversationMessage> {
    const user = await this.authenticate(authorization);
    const current = await this.messaging().findMessage(messageId, user.id);
    if (!current) throw new AppError("MESSAGE_NOT_FOUND", 404);
    await this.requireCanonicalConversation(
      current.conversationId,
      user,
      "ADD_REACTIONS",
    );
    const updated = await this.messaging().setReaction(
      messageId,
      user.id,
      emoji,
      active,
      this.now(),
    );
    if (!updated) throw new AppError("MESSAGE_NOT_FOUND", 404);
    return this.resolveConversationMessage(updated);
  }

  async updateCanonicalReadState(
    authorization: string | undefined,
    conversationId: string,
    deliveredId: string | undefined,
    readId: string | undefined,
  ): Promise<ConversationReadState> {
    const user = await this.authenticate(authorization);
    await this.requireCanonicalConversation(
      conversationId,
      user,
      "READ_MESSAGE_HISTORY",
    );
    const state = await this.messaging().updateReadState(
      conversationId,
      user.id,
      deliveredId ?? null,
      readId ?? null,
      this.now(),
    );
    if (!state) throw new AppError("VALIDATION_ERROR", 400);
    return state;
  }

  async listCanonicalReadStates(
    authorization: string | undefined,
    conversationId: string,
  ): Promise<ConversationMemberReadState[]> {
    const user = await this.authenticate(authorization);
    const access = await this.requireCanonicalConversation(
      conversationId,
      user,
      "READ_MESSAGE_HISTORY",
    );
    if (access.conversation.type === "server_channel")
      throw new AppError("DIRECT_CONVERSATION_NOT_FOUND", 404);
    return this.messaging().listReadStates(conversationId);
  }

  async getCanonicalUnreadSummary(
    authorization: string | undefined,
  ): Promise<UserUnreadSummary> {
    const user = await this.authenticate(authorization);
    return this.messaging().unreadSummary(user.id);
  }

  async getNotificationPreferences(
    authorization: string | undefined,
  ): Promise<UserNotificationPreferences> {
    const user = await this.authenticate(authorization);
    return this.messaging().getNotificationPreferences(user.id, this.now());
  }

  async updateNotificationPreferences(
    authorization: string | undefined,
    input: Omit<UserNotificationPreferences, "updatedAt">,
  ): Promise<UserNotificationPreferences> {
    const user = await this.authenticate(authorization);
    return this.messaging().updateNotificationPreferences(
      user.id,
      input,
      this.now(),
    );
  }

  async getServerNotificationPreferences(
    authorization: string | undefined,
    serverId: string,
  ): Promise<ServerNotificationPreferences> {
    const user = await this.authenticate(authorization);
    await this.requireServerPermission(
      await this.requireServer(serverId),
      user,
      "VIEW_SERVER",
    );
    const preferences = await this.messaging().getServerNotificationPreferences(
      serverId,
      user.id,
      this.now(),
    );
    if (!preferences) throw new AppError("SERVER_NOT_FOUND", 404);
    return preferences;
  }

  async updateServerNotificationPreferences(
    authorization: string | undefined,
    serverId: string,
    input: Omit<ServerNotificationPreferences, "serverId" | "updatedAt">,
  ): Promise<ServerNotificationPreferences> {
    const user = await this.authenticate(authorization);
    await this.requireServerPermission(
      await this.requireServer(serverId),
      user,
      "VIEW_SERVER",
    );
    const preferences =
      await this.messaging().updateServerNotificationPreferences(
        serverId,
        user.id,
        input,
        this.now(),
      );
    if (!preferences) throw new AppError("SERVER_NOT_FOUND", 404);
    return preferences;
  }

  async getConversationNotificationPreferences(
    authorization: string | undefined,
    conversationId: string,
  ): Promise<ConversationNotificationPreferences> {
    const user = await this.authenticate(authorization);
    await this.requireCanonicalConversation(
      conversationId,
      user,
      "READ_MESSAGE_HISTORY",
    );
    const preferences =
      await this.messaging().getConversationNotificationPreferences(
        conversationId,
        user.id,
        this.now(),
      );
    if (!preferences) throw new AppError("DIRECT_CONVERSATION_NOT_FOUND", 404);
    return preferences;
  }

  async updateConversationNotificationPreferences(
    authorization: string | undefined,
    conversationId: string,
    input: Omit<
      ConversationNotificationPreferences,
      "conversationId" | "updatedAt"
    >,
  ): Promise<ConversationNotificationPreferences> {
    const user = await this.authenticate(authorization);
    await this.requireCanonicalConversation(
      conversationId,
      user,
      "READ_MESSAGE_HISTORY",
    );
    const preferences =
      await this.messaging().updateConversationNotificationPreferences(
        conversationId,
        user.id,
        input,
        this.now(),
      );
    if (!preferences) throw new AppError("DIRECT_CONVERSATION_NOT_FOUND", 404);
    return preferences;
  }

  async listCanonicalNotifications(
    authorization: string | undefined,
    before: string | undefined,
    limit: number,
    unreadOnly: boolean,
  ): Promise<InternalNotification[]> {
    const user = await this.authenticate(authorization);
    const notifications = await this.messaging().listNotifications(
      user.id,
      before ? new Date(before) : null,
      limit,
      unreadOnly,
    );
    return Promise.all(
      notifications.map(async (notification) => ({
        ...notification,
        actorAvatarUrl: await this.resolveMediaUrl(
          notification.actorAvatarUrl,
        ),
      })),
    );
  }

  async markCanonicalNotificationRead(
    authorization: string | undefined,
    notificationId: string,
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    if (
      !(await this.messaging().markNotificationRead(
        user.id,
        notificationId,
        this.now(),
      ))
    )
      throw new AppError("MESSAGE_NOT_FOUND", 404);
  }

  async dismissCanonicalNotification(
    authorization: string | undefined,
    notificationId: string,
  ): Promise<void> {
    const user = await this.authenticate(authorization);
    if (
      !(await this.messaging().dismissNotification(
        user.id,
        notificationId,
        this.now(),
      ))
    )
      throw new AppError("MESSAGE_NOT_FOUND", 404);
  }

  async markAllCanonicalNotificationsRead(
    authorization: string | undefined,
  ): Promise<{ updated: number }> {
    const user = await this.authenticate(authorization);
    return {
      updated: await this.messaging().markAllNotificationsRead(
        user.id,
        this.now(),
      ),
    };
  }

  async createCanonicalAttachmentIntent(
    authorization: string | undefined,
    input: {
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      width?: number | undefined;
      height?: number | undefined;
      durationMs?: number | undefined;
    },
  ): Promise<{
    attachmentId: string;
    uploadUrl: string;
    headers: Record<string, string>;
    expiresAt: string;
  }> {
    const user = await this.authenticate(authorization);
    if (!this.objectStorage)
      throw new AppError("MEDIA_STORAGE_UNAVAILABLE", 503);
    const allowed = new Set(
      this.config.MEDIA_ALLOWED_MIME_TYPES.split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    );
    const limit = input.mimeType.startsWith("image/")
      ? this.config.MEDIA_MAX_IMAGE_BYTES
      : input.mimeType.startsWith("video/")
        ? this.config.MEDIA_MAX_VIDEO_BYTES
        : this.config.MEDIA_MAX_FILE_BYTES;
    if (!allowed.has(input.mimeType))
      throw new AppError("ATTACHMENT_TYPE_NOT_ALLOWED", 400);
    if (input.sizeBytes > limit)
      throw new AppError("ATTACHMENT_TOO_LARGE", 413, undefined, { limit });
    const id = randomUUID();
    const objectKey = `${this.config.S3_KEY_PREFIX}/messages/${user.id}/${id}`;
    const expiresInSeconds = 15 * 60;
    let uploadUrl: string;
    try {
      uploadUrl = await this.objectStorage.createPutUrl(
        objectKey,
        input.mimeType,
        input.sizeBytes,
        expiresInSeconds,
      );
    } catch {
      throw new AppError("MEDIA_STORAGE_UNAVAILABLE", 503);
    }
    const now = this.now();
    await this.messaging().createAttachmentIntent({
      id,
      uploaderUserId: user.id,
      objectKey,
      originalName: safeAttachmentName(input.fileName),
      mimeType: input.mimeType,
      sizeBytes: String(input.sizeBytes),
      width: input.width ?? null,
      height: input.height ?? null,
      durationMs: input.durationMs ?? null,
      createdAt: now,
    });
    return {
      attachmentId: id,
      uploadUrl,
      headers: {
        "Content-Type": input.mimeType,
        "Content-Length": String(input.sizeBytes),
      },
      expiresAt: new Date(
        now.getTime() + expiresInSeconds * 1_000,
      ).toISOString(),
    };
  }

  async finalizeCanonicalAttachment(
    authorization: string | undefined,
    attachmentId: string,
  ): Promise<{ attachmentId: string; finalized: true }> {
    const user = await this.authenticate(authorization);
    if (!this.objectStorage)
      throw new AppError("MEDIA_STORAGE_UNAVAILABLE", 503);
    const attachment = await this.messaging().findAttachment(attachmentId);
    if (
      !attachment ||
      attachment.uploaderUserId !== user.id ||
      attachment.messageId
    )
      throw new AppError("ATTACHMENT_NOT_FOUND", 404);
    if (attachment.finalizedAt) return { attachmentId, finalized: true };
    try {
      const object = await this.objectStorage.headObject(attachment.objectKey);
      if (
        object.size !== Number(attachment.sizeBytes) ||
        object.mimeType !== attachment.mimeType
      ) {
        throw new AppError("VALIDATION_ERROR", 400, undefined, {
          field: "file",
        });
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("MEDIA_STORAGE_UNAVAILABLE", 503);
    }
    if (
      !(await this.messaging().finalizeAttachment(
        attachmentId,
        user.id,
        this.now(),
      ))
    )
      throw new AppError("ATTACHMENT_NOT_FOUND", 404);
    return { attachmentId, finalized: true };
  }

  async getCanonicalAttachmentUrl(
    authorization: string | undefined,
    attachmentId: string,
  ): Promise<{ url: string; expiresAt: string }> {
    const user = await this.authenticate(authorization);
    if (!this.objectStorage)
      throw new AppError("MEDIA_STORAGE_UNAVAILABLE", 503);
    const attachment = await this.messaging().findAttachment(attachmentId);
    if (!attachment?.finalizedAt)
      throw new AppError("ATTACHMENT_NOT_FOUND", 404);
    if (attachment.messageId) {
      const message = await this.messaging().findMessage(
        attachment.messageId,
        user.id,
      );
      if (!message) throw new AppError("ATTACHMENT_NOT_FOUND", 404);
      await this.requireCanonicalConversation(
        message.conversationId,
        user,
        "READ_MESSAGE_HISTORY",
      );
    } else if (attachment.uploaderUserId !== user.id)
      throw new AppError("ATTACHMENT_NOT_FOUND", 404);
    const expiresInSeconds = 5 * 60;
    try {
      return {
        url: await this.objectStorage.createGetUrl(
          attachment.objectKey,
          expiresInSeconds,
        ),
        expiresAt: new Date(
          this.now().getTime() + expiresInSeconds * 1_000,
        ).toISOString(),
      };
    } catch {
      throw new AppError("MEDIA_STORAGE_UNAVAILABLE", 503);
    }
  }

  async deleteCanonicalAttachment(
    authorization: string | undefined,
    attachmentId: string,
  ): Promise<ConversationMessage> {
    const user = await this.authenticate(authorization);
    const attachment = await this.messaging().findAttachment(attachmentId);
    if (!attachment?.messageId) throw new AppError("ATTACHMENT_NOT_FOUND", 404);
    const message = await this.messaging().findMessage(
      attachment.messageId,
      user.id,
    );
    if (!message) throw new AppError("ATTACHMENT_NOT_FOUND", 404);
    const access = await this.requireCanonicalConversation(
      message.conversationId,
      user,
      "READ_MESSAGE_HISTORY",
    );
    let canManage = false;
    if (access.channel)
      canManage = (
        await this.channelPermissionsFor(access.server!, access.channel, user)
      ).has("MANAGE_MESSAGES");
    const deleted = await this.messaging().deleteAttachment(
      attachmentId,
      user.id,
      canManage,
      this.now(),
    );
    if (!deleted) throw new AppError("ATTACHMENT_NOT_FOUND", 404);
    const updated = await this.messaging().findMessage(
      deleted.messageId,
      user.id,
    );
    if (!updated) throw new AppError("MESSAGE_NOT_FOUND", 404);
    return this.resolveConversationMessage(updated);
  }

  private messaging(): CanonicalMessagingStore {
    if (!this.canonicalMessagingStore)
      throw new AppError("INTERNAL_ERROR", 500);
    return this.canonicalMessagingStore;
  }

  private async requireCanonicalConversation(
    conversationId: string,
    user: UserRecord,
    permission: ServerPermission,
  ): Promise<{
    conversation: Awaited<
      ReturnType<CanonicalMessagingStore["findConversation"]>
    > & {};
    server: ServerRecord | null;
    channel: ServerChannelRecord | null;
  }> {
    const conversation =
      await this.messaging().findConversation(conversationId);
    if (!conversation) throw new AppError("DIRECT_CONVERSATION_NOT_FOUND", 404);
    if (conversation.type === "server_channel") {
      if (!conversation.serverId || !conversation.channelId)
        throw new AppError("CHANNEL_NOT_FOUND", 404);
      const [server, channel] = await Promise.all([
        this.requireServer(conversation.serverId),
        this.requireTextChannel(conversation.channelId),
      ]);
      await this.requireChannelPermission(server, channel, user, permission);
      return { conversation, server, channel };
    }
    if (!(await this.messaging().isDirectMember(conversationId, user.id)))
      throw new AppError("DIRECT_CONVERSATION_NOT_FOUND", 404);
    return { conversation, server: null, channel: null };
  }

  private async validateCanonicalMentions(
    access: {
      conversation: {
        id: string;
        type: "server_channel" | "direct" | "group_direct";
      };
      server: ServerRecord | null;
      channel: ServerChannelRecord | null;
    },
    author: UserRecord,
    mentions: CanonicalMentionInput[],
  ): Promise<void> {
    for (const mention of mentions) {
      if ((mention.start === undefined) !== (mention.length === undefined))
        throw new AppError("VALIDATION_ERROR", 400, undefined, {
          field: "mentions",
        });
    }
    if (access.conversation.type !== "server_channel") {
      for (const mention of mentions)
        if (
          mention.type !== "user" ||
          !mention.userId ||
          !(await this.messaging().isDirectMember(
            access.conversation.id,
            mention.userId,
          ))
        )
          throw new AppError("VALIDATION_ERROR", 400, undefined, {
            field: "mentions",
          });
      return;
    }
    const server = access.server!;
    const channel = access.channel!;
    const roles = await this.store.listServerRoles(server.id);
    const moderation = this.serverSettingsStore
      ? await this.serverSettingsStore.getModeration(server.id)
      : null;
    if (moderation && mentions.length > moderation.mentionLimitPerMessage)
      throw new AppError("VALIDATION_ERROR", 400, undefined, {
        field: "mentions",
        message: `Не больше ${moderation.mentionLimitPerMessage} упоминаний в сообщении`,
      });
    for (const mention of mentions) {
      if (mention.type === "everyone") {
        await this.requireChannelPermission(
          server,
          channel,
          author,
          "MENTION_EVERYONE",
        );
      } else if (mention.type === "role") {
        if (
          !mention.roleId ||
          !roles.some((role) => role.id === mention.roleId)
        )
          throw new AppError("VALIDATION_ERROR", 400, undefined, {
            field: "mentions",
          });
        await this.requireChannelPermission(
          server,
          channel,
          author,
          "MENTION_EVERYONE",
        );
      } else {
        const mentioned = mention.userId
          ? await this.store.findUserById(mention.userId)
          : null;
        if (
          !mention.userId ||
          !mentioned ||
          !(await this.store.findServerMember(server.id, mention.userId))
        )
          throw new AppError("VALIDATION_ERROR", 400, undefined, {
            field: "mentions",
          });
        const permissions = await this.channelPermissionsFor(
          server,
          channel,
          mentioned,
        );
        if (!permissions.has("VIEW_CHANNEL"))
          throw new AppError("VALIDATION_ERROR", 400, undefined, {
            field: "mentions",
          });
      }
    }
  }

  private async promotePlatformOwner(
    user: UserRecord,
    now: Date,
  ): Promise<UserRecord> {
    if (
      user.email !== this.config.PLATFORM_OWNER_EMAIL ||
      user.platformRole === "owner"
    )
      return user;
    return (
      (await this.store.setPlatformRoleByEmail(user.email, "owner", now)) ??
      user
    );
  }

  private async createSessionTokens(
    user: UserRecord,
    deviceName: string,
    now: Date,
  ): Promise<Omit<AuthResponse, "user" | "isNewUser">> {
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
    await this.recordSecurityEvent(
      user,
      "SESSION_CREATED",
      deviceName,
      "Новый вход в аккаунт",
      `Выполнен вход с устройства «${deviceName}».`,
    );
    return {
      accessToken: await issueAccessToken(
        { userId: user.id, sessionId: session.id },
        this.config,
      ),
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
    deferNotice = false,
  ): Promise<void> {
    const event: SecurityEventRecord = {
      id: randomUUID(),
      userId: user.id,
      type,
      deviceName,
      createdAt: this.now(),
    };
    await this.store.createSecurityEvent(event);
    if (this.canonicalMessagingStore) {
      await this.canonicalMessagingStore.enqueueEmailEvent({
        id: event.id,
        eventType: "email.security_notice",
        payload: { email: user.email, title, message },
        now: event.createdAt,
      });
      return;
    }
    if (deferNotice) {
      // Username changes remain visible in the in-app audit immediately; a slow
      // SMTP provider must not hold the profile form open.
      void this.mailer
        .sendSecurityNotice(user.email, title, message)
        .catch(() => undefined);
      return;
    }
    try {
      await this.mailer.sendSecurityNotice(user.email, title, message);
    } catch {
      // The in-app audit event is authoritative; SMTP outages must not break security actions.
    }
  }

  private async requireServer(id: string): Promise<ServerRecord> {
    const server = await this.store.findServerById(id);
    if (!server) throw new AppError("SERVER_NOT_FOUND", 404);
    return server;
  }

  private async requireServerChannel(id: string): Promise<ServerChannelRecord> {
    const channel = await this.store.findServerChannel(id);
    if (!channel) throw new AppError("CHANNEL_NOT_FOUND", 404);
    return channel;
  }

  private async requireTextChannel(id: string): Promise<ServerChannelRecord> {
    const channel = await this.requireServerChannel(id);
    if (channel.type !== "text") throw new AppError("CHANNEL_NOT_FOUND", 404);
    return channel;
  }

  private async requireDirectConversation(
    id: string,
    userId: string,
  ): Promise<DirectConversationRecord> {
    const conversation = await this.store.findDirectConversation(id);
    if (
      !conversation ||
      (conversation.userAId !== userId && conversation.userBId !== userId)
    )
      throw new AppError("DIRECT_CONVERSATION_NOT_FOUND", 404);
    return conversation;
  }

  private async requireVoiceChannel(id: string): Promise<ServerChannelRecord> {
    const channel = await this.requireServerChannel(id);
    if (channel.type !== "voice") throw new AppError("CHANNEL_NOT_FOUND", 404);
    return channel;
  }

  private async serverPermissionsFor(
    server: ServerRecord,
    user: UserRecord,
  ): Promise<Set<ServerPermission>> {
    if (server.ownerUserId === user.id) return new Set(serverPermissions);
    if (!(await this.store.findServerMember(server.id, user.id)))
      return new Set();
    const [roles, roleIds] = await Promise.all([
      this.store.listServerRoles(server.id),
      this.store.listMemberRoleIds(server.id, user.id),
    ]);
    return resolveServerPermissions({
      isOwner: false,
      userId: user.id,
      roles,
      assignedRoleIds: roleIds,
    });
  }

  private async channelPermissionsFor(
    server: ServerRecord,
    channel: ServerChannelRecord,
    user: UserRecord,
  ): Promise<Set<ServerPermission>> {
    if (!(await this.store.findServerMember(server.id, user.id)))
      return new Set();
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
      overwrites: overwrites.map((overwrite) => ({
        channelId: overwrite.channelId,
        targetType: overwrite.targetType,
        targetId: overwrite.targetId,
        allow: overwrite.allow,
        deny: overwrite.deny,
      })),
    });
  }

  private async serverRolePositionFor(
    server: ServerRecord,
    user: UserRecord,
    roles: ServerRoleRecord[],
  ): Promise<number> {
    const assigned = new Set(
      await this.store.listMemberRoleIds(server.id, user.id),
    );
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
      await this.store.createUserActivity({
        id: randomUUID(),
        userId,
        type,
        title,
        context,
        serverId,
        channelId,
        createdAt: this.now(),
      });
    } catch {
      // Activity is a secondary dashboard signal and must never block calls or messages.
    }
  }

  private async requireServerPermission(
    server: ServerRecord,
    user: UserRecord,
    permission: ServerPermission,
  ): Promise<Set<ServerPermission>> {
    const permissions = await this.serverPermissionsFor(server, user);
    if (!permissions.has(permission))
      throw new AppError("SERVER_PERMISSION_DENIED", 403);
    return permissions;
  }

  private async requireChannelPermission(
    server: ServerRecord,
    channel: ServerChannelRecord,
    user: UserRecord,
    permission: ServerPermission,
  ): Promise<Set<ServerPermission>> {
    const permissions = await this.channelPermissionsFor(server, channel, user);
    if (!permissions.has(permission))
      throw new AppError("SERVER_PERMISSION_DENIED", 403);
    return permissions;
  }

  private async validateMessageMentions(
    server: ServerRecord,
    channel: ServerChannelRecord,
    messageId: string,
    content: string,
    input: MessageMentionInput[],
  ): Promise<MessageMentionRecord[]> {
    const invalid = (): never => {
      throw new AppError("VALIDATION_ERROR", 400, undefined, {
        field: "mentions",
      });
    };
    if (new Set(input.map((mention) => mention.userId)).size > 10) invalid();
    const contentLength = codePointLength(content);
    const sorted = [...input].sort(
      (left, right) => left.start - right.start || left.length - right.length,
    );
    let previousEnd = 0;
    const records: MessageMentionRecord[] = [];
    for (const mention of sorted) {
      const end = mention.start + mention.length;
      if (mention.start < previousEnd || end > contentLength) invalid();
      const [member, mentionedUser] = await Promise.all([
        this.store.findServerMember(server.id, mention.userId),
        this.store.findUserById(mention.userId),
      ]);
      if (!member || !mentionedUser || !mentionedUser.displayName)
        throw new AppError("VALIDATION_ERROR", 400, undefined, {
          field: "mentions",
        });
      const permissions = await this.channelPermissionsFor(
        server,
        channel,
        mentionedUser,
      );
      if (
        !permissions.has("VIEW_CHANNEL") ||
        codePointSlice(content, mention.start, mention.length) !==
          `@${mentionedUser.displayName}`
      )
        invalid();
      records.push({
        messageId,
        mentionedUserId: mention.userId,
        start: mention.start,
        length: mention.length,
      });
      previousEnd = end;
    }
    return records;
  }

  private async getServerDetailForUser(
    server: ServerRecord,
    user: UserRecord,
  ): Promise<ServerDetail> {
    const permissions = await this.requireServerPermission(
      server,
      user,
      "VIEW_SERVER",
    );
    const [channels, roles, members, assignments] = await Promise.all([
      this.store.listServerChannels(server.id),
      this.store.listServerRoles(server.id),
      this.store.listServerMembers(server.id),
      this.store.listAllMemberRoles(server.id),
    ]);
    const publicRoles = roles.map(publicServerRole);
    const membership = members.find((member) => member.userId === user.id);
    if (!membership) throw new AppError("SERVER_PERMISSION_DENIED", 403);
    const overwrites = await this.store.listChannelPermissionOverwrites(
      channels.map((channel) => channel.id),
    );
    const currentRoleIds = assignments
      .filter((assignment) => assignment.userId === user.id)
      .map((assignment) => assignment.roleId);
    const effectiveByChannel = new Map(
      channels.map((channel) => [
        channel.id,
        resolveChannelPermissions({
          isOwner: server.ownerUserId === user.id,
          userId: user.id,
          roles,
          assignedRoleIds: currentRoleIds,
          overwrites: overwrites
            .filter((overwrite) => overwrite.channelId === channel.id)
            .map((overwrite) => ({
              channelId: overwrite.channelId,
              targetType: overwrite.targetType,
              targetId: overwrite.targetId,
              allow: overwrite.allow,
              deny: overwrite.deny,
            })),
        }),
      ]),
    );
    const visibleChannels = channels.filter(
      (channel) =>
        effectiveByChannel.get(channel.id)?.has("VIEW_CHANNEL") === true,
    );
    const textChannelIds = visibleChannels
      .filter((channel) => channel.type === "text")
      .map((channel) => channel.id);
    const [unreadEntries, mentionEntries] = await Promise.all([
      this.store.listChannelUnreadCounts(
        textChannelIds,
        user.id,
        membership.joinedAt,
      ),
      this.store.listChannelMentionCounts(
        textChannelIds,
        user.id,
        membership.joinedAt,
      ),
    ]);
    const unreadCounts = new Map(
      unreadEntries.map((entry) => [entry.channelId, entry.count]),
    );
    const mentionCounts = new Map(
      mentionEntries.map((entry) => [entry.channelId, entry.count]),
    );
    const roleById = new Map(publicRoles.map((role) => [role.id, role]));
    const defaultRoles = publicRoles.filter((role) => role.isDefault);
    const privateAliases = new Map(
      (await this.store.listServerMemberAliases(server.id, user.id)).map(
        (entry) => [entry.targetUserId, entry.alias],
      ),
    );
    const publicMembers: ServerMember[] = await Promise.all(
      members.map(async (member) => {
        let presence: ServerMember["presence"] = "offline";
        let customStatusText: string | null = null;
        if (
          member.userId === user.id ||
          member.presenceVisibility === "shared_servers"
        ) {
          let ephemeral: "online" | "idle" | "offline" = "offline";
          try {
            ephemeral = await this.presenceStore.status(
              member.userId,
              this.now(),
            );
          } catch {
            /* fail closed */
          }
          presence =
            ephemeral === "offline" || member.presencePreference === "invisible"
              ? "offline"
              : member.presencePreference === "do_not_disturb"
                ? "dnd"
                : member.presencePreference === "idle" || ephemeral === "idle"
                  ? "idle"
                  : "online";
          customStatusText =
            member.customStatusExpiresAt === null ||
            member.customStatusExpiresAt > this.now()
              ? member.customStatusText
              : null;
        }
        return {
          userId: member.userId,
          displayName:
            privateAliases.get(member.userId) ??
            member.nickname ??
            member.displayName ??
            "Участник",
          serverDisplayName: member.nickname ?? null,
          privateAlias: privateAliases.get(member.userId) ?? null,
          platformRole: member.platformRole,
          avatarUrl: await this.publicMediaUrl(member.avatarObjectKey),
          joinedAt: member.joinedAt.toISOString(),
          roles: [
            ...defaultRoles,
            ...assignments
              .filter((assignment) => assignment.userId === member.userId)
              .map((assignment) => roleById.get(assignment.roleId))
              .filter((role): role is ServerRole => Boolean(role)),
          ],
          presence,
          customStatusText,
        };
      }),
    );
    const voiceParticipantsByChannel = new Map<
      string,
      VoiceChannelParticipant[]
    >();
    const voiceProjection = await this.voicePresenceStore
      .snapshot(server.id)
      .catch(() => null);
    for (const channel of visibleChannels.filter(
      (candidate) => candidate.type === "voice",
    )) {
      const participants: VoiceChannelParticipant[] = [];
      for (const session of voiceProjection?.sessions ?? []) {
        if (session.channelId !== channel.id) continue;
        const member = publicMembers.find(
          (candidate) => candidate.userId === session.userId,
        );
        if (!member) continue;
        participants.push({
          identity: session.participantIdentity,
          userId: member.userId,
          displayName: member.displayName,
          platformRole: member.platformRole,
          avatarUrl: member.avatarUrl ?? null,
          muted: session.muted,
          deafened: session.deafened,
          speaking: session.speaking,
          screenSharing: session.screenSharing,
          connectionQuality: session.connectionQuality,
          ...(member.presence ? { presence: member.presence } : {}),
        });
      }
      voiceParticipantsByChannel.set(channel.id, participants);
    }
    return {
      id: server.id,
      name: server.name,
      description: server.description ?? null,
      inviteUrl: this.inviteUrl(server.inviteToken),
      ownerUserId: server.ownerUserId,
      memberCount: members.length,
      createdAt: server.createdAt.toISOString(),
      iconUrl: await this.publicMediaUrl(server.iconObjectKey),
      bannerUrl: await this.publicMediaUrl(server.bannerObjectKey),
      accentColor: server.accentColor ?? null,
      visibility: server.visibility ?? "private",
      channels: visibleChannels.map((channel) =>
        publicServerChannel(
          channel,
          unreadCounts.get(channel.id) ?? 0,
          mentionCounts.get(channel.id) ?? 0,
          [...(effectiveByChannel.get(channel.id) ?? [])],
          permissions.has("MANAGE_ROLES")
            ? overwrites
                .filter((overwrite) => overwrite.channelId === channel.id)
                .map((overwrite) => ({
                  channelId: overwrite.channelId,
                  targetType: overwrite.targetType,
                  targetId: overwrite.targetId,
                  allow: overwrite.allow,
                  deny: overwrite.deny,
                }))
            : undefined,
          channel.type === "voice"
            ? (voiceParticipantsByChannel.get(channel.id) ?? [])
            : undefined,
        ),
      ),
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
    verifyLiveKitPresence = true,
  ): Promise<{
    channel: ServerChannelRecord;
    displayName: string;
    user: UserRecord;
  }> {
    const user = await this.authenticate(authorization);
    this.requireCompleteProfile(user);
    const channel = await this.requireVoiceChannel(channelId);
    await this.requireChannelPermission(
      await this.requireServer(channel.serverId),
      channel,
      user,
      permission,
    );
    if (!participantIdentity.startsWith(`user_${user.id}_`))
      throw new AppError("UNAUTHORIZED", 401);
    if (!verifyLiveKitPresence)
      return { channel, displayName: user.displayName, user };
    try {
      if (
        !channel.livekitRoomName ||
        !(await this.media.participantExists(
          channel.livekitRoomName,
          participantIdentity,
        ))
      )
        throw new AppError("PARTICIPANT_NOT_FOUND", 404);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("LIVEKIT_UNAVAILABLE", 503, undefined, null, error);
    }
    return { channel, displayName: user.displayName, user };
  }

  private async recordServerAudit(
    serverId: string,
    actor: UserRecord,
    action: string,
    targetType: string,
    targetId: string | null,
    before: unknown,
    after: unknown,
  ): Promise<void> {
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

  private settings(): ServerSettingsStore {
    if (!this.serverSettingsStore) throw new AppError("INTERNAL_ERROR", 500);
    return this.serverSettingsStore;
  }

  private identity(): IdentitySettingsStore {
    if (!this.identitySettingsStore) throw new AppError("INTERNAL_ERROR", 500);
    return this.identitySettingsStore;
  }

  private async requireDangerReauthentication(
    user: UserRecord,
    input: { password: string; totpCode: string | null },
  ): Promise<void> {
    if (
      !user.passwordHash ||
      !(await verifyPassword(input.password, user.passwordHash))
    )
      throw new AppError("INVALID_CREDENTIALS", 401);
    if (!user.twoFactorEnabled) return;
    if (!user.totpSecretEncrypted || !input.totpCode)
      throw new AppError("INVALID_SECOND_FACTOR", 401);
    let secret: string;
    try {
      secret = decryptCredential(
        user.totpSecretEncrypted,
        this.config.CREDENTIAL_ENCRYPTION_KEY,
      );
    } catch {
      throw new AppError("INTERNAL_ERROR", 500);
    }
    if (!verifyTotp(secret, input.totpCode, this.now().getTime()))
      throw new AppError("INVALID_SECOND_FACTOR", 401);
  }

  private requireCompleteProfile(
    user: UserRecord,
  ): asserts user is UserRecord & { displayName: string } {
    if (!user.displayName) throw new AppError("PROFILE_INCOMPLETE", 409);
  }
}
