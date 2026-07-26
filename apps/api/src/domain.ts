import type {
  DirectMessagePrivacy,
  HomeActivityType,
  PermissionOverwriteTargetType,
  PlatformRole,
  PresencePreference,
  PresenceVisibility,
  SecurityEventType,
  ServerChannelType,
  ServerPermission,
  ServerRoleKind,
} from "@vatrushka/shared";

export interface UserRecord {
  id: string;
  email: string;
  username?: string | null;
  displayName: string | null;
  avatarObjectKey?: string | null;
  platformRole: PlatformRole;
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
  totpSecretEncrypted: string | null;
  twoFactorEnabled: boolean;
  presencePreference: PresencePreference;
  customStatusText: string | null;
  customStatusExpiresAt: Date | null;
  directMessagePrivacy: DirectMessagePrivacy;
  presenceVisibility: PresenceVisibility;
  activityVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthCodeRecord {
  id: string;
  email: string;
  codeHash: string;
  purpose:
    | "login"
    | "registration"
    | "password_login"
    | "password_setup"
    | "password_reset";
  credentialHash: string | null;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  tokenFamilyId: string;
  deviceName: string;
  trustedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBySessionId: string | null;
  createdAt: Date;
  lastUsedAt: Date;
}

export interface RecoveryCodeRecord {
  id: string;
  userId: string;
  codeHash: string;
  createdAt: Date;
  usedAt: Date | null;
}

export interface SecurityEventRecord {
  id: string;
  userId: string;
  type: SecurityEventType;
  deviceName: string | null;
  createdAt: Date;
}

export interface UserActivityRecord {
  id: string;
  userId: string;
  type: HomeActivityType;
  title: string;
  context: string;
  serverId: string | null;
  channelId: string | null;
  createdAt: Date;
}

export interface ServerRecord {
  id: string;
  name: string;
  description?: string | null;
  iconObjectKey?: string | null;
  bannerObjectKey?: string | null;
  accentColor?: string | null;
  visibility?: "private" | "public";
  inviteToken: string;
  ownerUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServerMemberRecord {
  serverId: string;
  userId: string;
  joinedAt: Date;
  nickname?: string | null;
}

export interface ServerRoleRecord {
  id: string;
  serverId: string;
  name: string;
  color: string;
  position: number;
  isDefault: boolean;
  kind: ServerRoleKind;
  permissions: ServerPermission[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChannelPermissionOverwriteRecord {
  channelId: string;
  targetType: PermissionOverwriteTargetType;
  targetId: string;
  allow: ServerPermission[];
  deny: ServerPermission[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ServerAuditLogRecord {
  id: string;
  serverId: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  before: unknown;
  after: unknown;
  createdAt: Date;
}

export interface ServerChannelRecord {
  id: string;
  serverId: string;
  name: string;
  type: ServerChannelType;
  position: number;
  livekitRoomName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TextMessageRecord {
  id: string;
  channelId: string;
  authorUserId: string;
  content: string;
  replyToMessageId: string | null;
  createdAt: Date;
  editedAt: Date | null;
}

export interface MessageMentionRecord {
  messageId: string;
  mentionedUserId: string;
  start: number;
  length: number;
}

export interface MessageMentionWithUser extends MessageMentionRecord {
  displayName: string | null;
}

export interface MessageReactionRecord {
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: Date;
}

export interface MessageReactionSummary {
  messageId: string;
  emoji: string;
  count: number;
  reactedByCurrentUser: boolean;
}

export interface ChannelReadStateRecord {
  channelId: string;
  userId: string;
  readAt: Date;
}

export interface ChannelUnreadCount {
  channelId: string;
  count: number;
}

export interface ChannelMentionCount {
  channelId: string;
  count: number;
}

export interface MessageAttachmentRecord {
  id: string;
  messageId: string;
  uploaderUserId: string;
  fileName: string;
  mimeType: string;
  size: number;
  content: Buffer;
  storageKey: string | null;
  createdAt: Date;
}

export type MessageAttachmentMetadata = Omit<
  MessageAttachmentRecord,
  "content"
>;

export interface MessageNotificationRecord {
  id: string;
  serverId: string;
  serverName: string;
  channelId: string;
  channelName: string;
  authorUserId: string;
  authorDisplayName: string | null;
  content: string;
  mention: boolean;
  createdAt: Date;
}

export interface DirectConversationRecord {
  id: string;
  userAId: string;
  userBId: string;
  userAReadAt: Date;
  userBReadAt: Date;
  userAReadMessageId: string | null;
  userBReadMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DirectMessageRecord {
  id: string;
  conversationId: string;
  authorUserId: string;
  content: string;
  replyToMessageId: string | null;
  createdAt: Date;
  editedAt: Date | null;
}

export type DirectMessageWithAuthor = DirectMessageRecord &
  Pick<UserRecord, "displayName" | "platformRole" | "avatarObjectKey">;

export interface DirectConversationOverviewRecord {
  conversation: DirectConversationRecord;
  participant: Pick<
    UserRecord,
    "id" | "displayName" | "platformRole" | "avatarObjectKey"
  >;
  lastMessage: Pick<
    DirectMessageRecord,
    "authorUserId" | "content" | "createdAt"
  > | null;
  unreadCount: number;
}

export interface DirectMessageAttachmentRecord {
  id: string;
  messageId: string;
  uploaderUserId: string;
  fileName: string;
  mimeType: string;
  size: number;
  content: Buffer;
  storageKey: string | null;
  createdAt: Date;
}

export type DirectMessageAttachmentMetadata = Omit<
  DirectMessageAttachmentRecord,
  "content"
>;

export interface ChannelLeaseRecord {
  channelId: string;
  participantIdentity: string;
  participantDisplayName: string;
  acquiredAt: Date;
  expiresAt: Date;
}

export interface ServerGraph {
  server: ServerRecord;
  members: ServerMemberRecord[];
  roles: ServerRoleRecord[];
  memberRoles: Array<{ serverId: string; userId: string; roleId: string }>;
  channels: ServerChannelRecord[];
}

export type ServerWithMemberCount = ServerRecord & { memberCount: number };
export type ServerMemberProfile = ServerMemberRecord &
  Pick<
    UserRecord,
    | "displayName"
    | "avatarObjectKey"
    | "platformRole"
    | "presencePreference"
    | "customStatusText"
    | "customStatusExpiresAt"
    | "presenceVisibility"
    | "updatedAt"
  >;
export type TextMessageWithAuthor = TextMessageRecord &
  Pick<UserRecord, "displayName" | "platformRole" | "avatarObjectKey">;

export type RefreshRotation =
  | { status: "ok"; oldSession: SessionRecord; newSession: SessionRecord }
  | { status: "not_found" }
  | { status: "expired"; session: SessionRecord }
  | { status: "reused"; session: SessionRecord };
