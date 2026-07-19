import type { LocalSettings } from "./schemas.js";

export type PlatformRole = "member" | "admin" | "owner";

export const serverPermissions = [
  "ADMINISTRATOR",
  "VIEW_SERVER",
  "VIEW_SERVER_SETTINGS",
  "MANAGE_SERVER",
  "MANAGE_APPEARANCE",
  "MANAGE_MEMBERS",
  "MANAGE_CHANNELS",
  "MANAGE_ROLES",
  "MANAGE_INVITES",
  "MANAGE_INTEGRATIONS",
  "VIEW_AUDIT_LOG",
  "EXPORT_AUDIT_LOG",
  "MANAGE_MODERATION",
  "MANAGE_BACKUPS",
  "TRANSFER_OWNERSHIP",
  "DELETE_SERVER",
  "MANAGE_SERVER_SECURITY",
  "KICK_MEMBERS",
  "BAN_MEMBERS",
  "TIMEOUT_MEMBERS",
  "MANAGE_NICKNAMES",
  "VIEW_MODERATION_NOTES",
  "MANAGE_REPORTS",
  "VIEW_CHANNEL",
  "READ_MESSAGE_HISTORY",
  "SEND_MESSAGES",
  "SEND_ATTACHMENTS",
  "ADD_REACTIONS",
  "EMBED_LINKS",
  "MENTION_EVERYONE",
  "MANAGE_OWN_MESSAGES",
  "MANAGE_MESSAGES",
  "PIN_MESSAGES",
  "CREATE_THREADS",
  "CONNECT_VOICE",
  "SPEAK",
  "STREAM_SCREEN",
  "STREAM_APPLICATION_AUDIO",
  "USE_PRIORITY_VOICE",
  "MUTE_MEMBERS",
  "DEAFEN_MEMBERS",
  "MOVE_MEMBERS",
  "STOP_OTHERS_STREAM",
  "CREATE_TEMPORARY_VOICE",
  "MANAGE_2FA_POLICY",
  "MANAGE_SESSIONS",
  "VIEW_TECHNICAL_LOGS",
  "EXPORT_SERVER_DATA",
] as const;

export type ServerPermission = (typeof serverPermissions)[number];
export type ServerChannelType = "text" | "voice";
export type ServerRoleKind = "EVERYONE" | "OWNER" | "CUSTOM";

export type PermissionOverwriteTargetType = "ROLE" | "MEMBER";

export interface ChannelPermissionOverwrite {
  channelId: string;
  targetType: PermissionOverwriteTargetType;
  targetId: string;
  allow: ServerPermission[];
  deny: ServerPermission[];
}

export interface ServerSummary {
  id: string;
  name: string;
  inviteUrl: string;
  ownerUserId: string;
  memberCount: number;
  createdAt: string;
  description?: string | null;
  iconUrl?: string | null;
  bannerUrl?: string | null;
  accentColor?: string | null;
  visibility?: ServerVisibility;
}

export type ServerVisibility = "private" | "public";

export interface PublicServerSummary {
  id: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  bannerUrl: string | null;
  accentColor: string | null;
  memberCount: number;
  featured: boolean;
  joined: boolean;
}

export type HomePresence = "online" | "idle" | "dnd" | "offline";
export type PresencePreference =
  "online" | "idle" | "do_not_disturb" | "invisible";
export type EffectivePresenceStatus = "online" | "idle" | "dnd" | "offline";
export type DirectMessagePrivacy = "shared_servers" | "nobody";
export type PresenceVisibility = "shared_servers" | "nobody";

export interface UserPresence {
  preference: PresencePreference;
  effectiveStatus: EffectivePresenceStatus;
  customText: string | null;
  customTextExpiresAt: string | null;
  updatedAt: string;
}

export interface UserPrivacySettings {
  directMessages: DirectMessagePrivacy;
  presenceVisibility: PresenceVisibility;
  activityVisible: boolean;
  updatedAt: string;
}
export type HomeConnectionStatus = "healthy" | "degraded" | "offline";
export type HomeDestinationType = "server" | "text_channel" | "voice_channel";

export interface HomeDestination {
  type: HomeDestinationType;
  serverId: string;
  channelId?: string;
}

export interface HomeServerSummary extends ServerSummary {
  unreadCount: number;
  activeVoiceCount: number;
}

export interface HomeContinueItem {
  id: string;
  type: "active_call" | HomeDestinationType;
  title: string;
  subtitle: string;
  participantCount: number;
  active: boolean;
  lastActivityAt: string;
  destination: HomeDestination;
}

export interface HomeParticipantPreview {
  id: string;
  displayName: string;
}

export interface HomeActiveSpaceItem {
  id: string;
  type: "voice_channel" | "text_channel";
  title: string;
  subtitle: string;
  participants: HomeParticipantPreview[];
  participantCount: number;
  hasVoiceActivity: boolean;
  unreadCount: number;
  lastActivityAt: string;
  destination: HomeDestination;
}

export type GamingHomeConnectionQuality =
  | "excellent"
  | "good"
  | "poor"
  | "offline";

export interface GamingHomeVoiceStatus {
  microphone: {
    available: boolean;
    enabled: boolean;
    label: string | null;
  };
  output: {
    available: boolean;
    label: string | null;
  };
  pingMs: number | null;
  connectionQuality: GamingHomeConnectionQuality;
}

export interface GamingHomeVoiceSpace {
  channelId: string;
  serverId: string;
  serverName: string;
  serverIconUrl: string | null;
  channelName: string;
  gameName: string | null;
  coverUrl: string | null;
  participantCount: number;
  participantLimit: number | null;
  friendCount: number;
  participantAvatars: string[];
  hasScreenShare: boolean;
  hasFreeSlots: boolean;
  canJoin: boolean;
  lastActivityAt: string;
}

export interface GamingHomeQuickReturnItem extends GamingHomeVoiceSpace {
  returnReason:
    | "recently_left"
    | "friends_inside"
    | "screen_share"
    | "pinned";
}

export interface GamingHomeFriend {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  presence: "online" | "away" | "dnd";
  gameName: string | null;
  gameDetails: string | null;
  voiceChannel: {
    channelId: string;
    serverId: string;
    channelName: string;
    canJoin: boolean;
  } | null;
}

export type HomeActivityType =
  | "opened_channel"
  | "joined_voice"
  | "left_voice"
  | "sent_message"
  | "joined_server"
  | "mention_received";

export interface HomeRecentActivityItem {
  id: string;
  type: HomeActivityType;
  title: string;
  context: string;
  occurredAt: string;
  destination: HomeDestination | null;
}

export interface HomeOnboardingStep {
  id: "create_server" | "configure_channels" | "invite_members";
  title: string;
  description: string;
  complete: boolean;
  destination: HomeDestination | null;
}

export interface HomeDashboardResponse {
  user: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
    presence: HomePresence;
    platformBadge: "FOUNDER_DEVELOPER" | null;
  };
  readiness: {
    connection: HomeConnectionStatus;
    audioSetupRequired: boolean;
  };
  servers: HomeServerSummary[];
  continueItems: HomeContinueItem[];
  activeSpaces: HomeActiveSpaceItem[];
  recentActivity: HomeRecentActivityItem[];
  onboarding: {
    visible: boolean;
    steps: HomeOnboardingStep[];
  };
  gaming: {
    voiceStatus: GamingHomeVoiceStatus;
    quickReturn: GamingHomeQuickReturnItem[];
    activeSpaces: GamingHomeVoiceSpace[];
    friendsInGame: GamingHomeFriend[];
  };
}

export interface ServerChannel {
  id: string;
  serverId: string;
  name: string;
  type: ServerChannelType;
  position: number;
  unreadCount: number;
  mentionCount?: number;
  voiceParticipants?: VoiceChannelParticipant[];
  permissions?: ServerPermission[];
  permissionOverwrites?: ChannelPermissionOverwrite[];
}

export interface MessageMentionInput {
  userId: string;
  start: number;
  length: number;
}

export interface MessageMention extends MessageMentionInput {
  displayName: string;
}

export interface VoiceChannelParticipant {
  identity: string;
  userId: string;
  displayName: string;
  platformRole: PlatformRole;
  avatarUrl?: string | null;
}

export interface ServerRole {
  id: string;
  serverId: string;
  name: string;
  color: string;
  position: number;
  isDefault: boolean;
  kind?: ServerRoleKind;
  permissions: ServerPermission[];
}

export interface ServerAuditLogEntry {
  id: string;
  serverId: string;
  actorUserId: string | null;
  actorDisplayName: string;
  action: string;
  targetType: string;
  targetId: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface ServerMember {
  userId: string;
  displayName: string;
  serverDisplayName: string | null;
  privateAlias: string | null;
  platformRole: PlatformRole;
  avatarUrl?: string | null;
  joinedAt: string;
  roles: ServerRole[];
  presence?: EffectivePresenceStatus;
  customStatusText?: string | null;
}

export interface ServerDetail extends ServerSummary {
  description: string | null;
  channels: ServerChannel[];
  roles: ServerRole[];
  members: ServerMember[];
  permissions: ServerPermission[];
}

export type ServerNotificationLevel = "all" | "mentions" | "none";
export type ServerVerificationLevel = "none" | "email_verified" | "account_age";

export interface ServerOverviewSettings {
  id: string;
  name: string;
  description: string | null;
  language: string;
  timezone: string;
  systemChannelId: string | null;
  welcomeChannelId: string | null;
  defaultNotificationLevel: ServerNotificationLevel;
  defaultVoiceInactivitySeconds: number;
  visibility: ServerVisibility;
  ownerUserId: string;
  ownerDisplayName: string;
  version: number;
  updatedAt: string;
}

export interface ServerAppearanceSettings {
  iconUrl: string | null;
  bannerUrl: string | null;
  accentColor: string | null;
  version: number;
}

export interface ServerSettingsMember {
  userId: string;
  displayName: string;
  username: string | null;
  serverDisplayName: string | null;
  privateAlias: string | null;
  platformRole: PlatformRole;
  joinedAt: string;
  lastActiveAt: string | null;
  mutedUntil: string | null;
  deafened: boolean;
  roleIds: string[];
}

export interface ServerChannelCategory {
  id: string;
  name: string;
  position: number;
}

export interface ServerChannelSettings {
  id: string;
  name: string;
  type: ServerChannelType;
  position: number;
  categoryId: string | null;
  slowModeSeconds: number;
  maxParticipants: number | null;
  bitrate: number | null;
  version: number;
  archivedAt: string | null;
}

export interface ServerInviteSettings {
  id: string;
  createdByUserId: string | null;
  createdByDisplayName: string;
  destinationChannelId: string | null;
  tokenPreview: string;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreatedServerInvite extends ServerInviteSettings {
  inviteUrl: string;
}

export interface ServerModerationSettings {
  verificationLevel: ServerVerificationLevel;
  newMemberRestrictionMinutes: number;
  messageRateLimitPerMinute: number;
  mentionLimitPerMessage: number;
  rules: string | null;
  version: number;
}

export interface ServerBanSettings {
  userId: string;
  displayName: string;
  actorUserId: string | null;
  actorDisplayName: string;
  reason: string;
  createdAt: string;
}

export interface ServerAuditLogPage {
  entries: ServerAuditLogEntry[];
  nextCursor: string | null;
}

export interface TextMessage {
  id: string;
  channelId: string;
  authorUserId: string;
  authorDisplayName: string;
  authorPlatformRole: PlatformRole;
  content: string;
  mentions?: MessageMention[];
  conversationMentions?: ConversationMentionDraft[];
  replyTo: {
    messageId: string;
    authorUserId: string;
    authorDisplayName: string;
    content: string;
  } | null;
  reactions: Array<{
    emoji: string;
    count: number;
    reactedByCurrentUser: boolean;
  }>;
  attachments: MessageAttachment[];
  createdAt: string;
  editedAt: string | null;
  deletedAt?: string | null;
  deliveryState?: MessageDeliveryState;
}

export interface MessageAttachment {
  id: string;
  messageId: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface MessageNotification {
  id: string;
  serverId: string;
  serverName: string;
  channelId: string;
  channelName: string;
  authorUserId: string;
  authorDisplayName: string;
  content: string;
  mention?: boolean;
  createdAt: string;
}

export interface MessageNotificationPage {
  items: MessageNotification[];
  cursor: { createdAt: string; id: string | null } | null;
}

export interface DirectMessageParticipant {
  userId: string;
  displayName: string;
  platformRole: PlatformRole;
}

export interface DirectConversationSummary {
  id: string;
  participant: DirectMessageParticipant;
  lastMessage: {
    authorUserId: string;
    content: string;
    createdAt: string;
  } | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DirectMessageCandidate extends DirectMessageParticipant {
  sharedServerNames: string[];
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  authorUserId: string;
  authorDisplayName: string;
  authorPlatformRole: PlatformRole;
  content: string;
  replyTo: {
    messageId: string;
    authorUserId: string;
    authorDisplayName: string;
    content: string;
  } | null;
  reactions: Array<{
    emoji: string;
    count: number;
    reactedByCurrentUser: boolean;
  }>;
  attachments: MessageAttachment[];
  createdAt: string;
  editedAt: string | null;
  deletedAt?: string | null;
  deliveryState?: MessageDeliveryState;
}

export type MessageDeliveryState =
  "sending" | "sent" | "delivered" | "read" | "failed";
export type ConversationType = "server_channel" | "direct" | "group_direct";
export type ConversationMentionType = "user" | "role" | "everyone";
export interface ConversationMentionDraft {
  type: ConversationMentionType;
  userId?: string | undefined;
  roleId?: string | undefined;
  start: number;
  length: number;
  displayName: string;
}
export type ConversationNotificationType =
  | "message"
  | "direct_message"
  | "mention"
  | "reply"
  | "server_invite"
  | "moderation"
  | "system";

export interface ConversationSummary {
  id: string;
  type: ConversationType;
  serverId: string | null;
  channelId: string | null;
  title: string;
  updatedAt: string;
  lastMessage: {
    id: string;
    authorId: string;
    content: string;
    createdAt: string;
  } | null;
  unreadCount: number;
  mentionCount: number;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  clientMessageId: string;
  author: {
    id: string;
    displayName: string;
    username: string | null;
    avatarUrl: string | null;
  };
  content: string;
  replyTo: {
    id: string;
    authorId: string;
    authorDisplayName: string;
    content: string;
  } | null;
  attachments: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: string;
    width: number | null;
    height: number | null;
    durationMs: number | null;
  }>;
  reactions: Array<{
    emoji: string;
    count: number;
    reactedByCurrentUser: boolean;
  }>;
  mentions: Array<{
    id: string;
    type: ConversationMentionType;
    userId: string | null;
    roleId: string | null;
    start: number | null;
    length: number | null;
  }>;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export interface ConversationMessagePage {
  items: ConversationMessage[];
  pageInfo: { before: string | null; after: string | null; hasMore: boolean };
}

export interface ConversationReadState {
  conversationId: string;
  lastDeliveredMessageId: string | null;
  lastReadMessageId: string | null;
  lastDeliveredAt: string | null;
  lastReadAt: string | null;
  mentionCount: number;
}

export interface ConversationMemberReadState extends ConversationReadState {
  userId: string;
}

export interface UserUnreadSummary {
  totalDirectUnread: number;
  totalMentionUnread: number;
  totalReplyUnread: number;
  conversations: Array<{
    conversationId: string;
    unreadCount: number;
    mentionCount: number;
    firstUnreadMessageId: string | null;
  }>;
}

export type NotificationPreviewMode = "full" | "sender_only" | "hidden";

export interface UserNotificationPreferences {
  desktopEnabled: boolean;
  soundEnabled: boolean;
  previewMode: NotificationPreviewMode;
  directMessagesEnabled: boolean;
  mentionsEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  quietHoursTimezone: string | null;
  updatedAt: string;
}

export type NotificationPreferenceLevel = "all" | "mentions" | "none";

export interface ServerNotificationPreferences {
  serverId: string;
  level: NotificationPreferenceLevel;
  mutedUntil: string | null;
  suppressEveryone: boolean;
  suppressRoles: boolean;
  updatedAt: string;
}

export interface ConversationNotificationPreferences {
  conversationId: string;
  level: NotificationPreferenceLevel;
  mutedUntil: string | null;
  updatedAt: string;
}

export interface InternalNotification {
  id: string;
  type: ConversationNotificationType;
  actorUserId: string | null;
  conversationId: string | null;
  messageId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
  dismissedAt: string | null;
  actorDisplayName?: string | null;
  conversationTitle?: string | null;
  serverId?: string | null;
  channelId?: string | null;
}

export type RealtimeEventType =
  | "message.created"
  | "message.updated"
  | "message.deleted"
  | "message.reaction.updated"
  | "conversation.read_state.updated"
  | "conversation.unread.updated"
  | "notification.created"
  | "typing.started"
  | "typing.stopped"
  | "presence.updated"
  | "server.updated"
  | "server.channel.updated"
  | "voice.presence.updated"
  | "voice.member.joined"
  | "voice.member.left"
  | "voice.member.moved"
  | "voice.member.move.pending"
  | "voice.member.move.required"
  | "voice.member.move.failed"
  | "voice.member.state.updated"
  | "voice.server.snapshot.required"
  | "session.revoked"
  | "feature_flags.updated";

export interface RealtimeEvent {
  id: string;
  type: RealtimeEventType;
  occurredAt: string;
  conversationId: string | null;
  targetUserIds: string[];
  payload: Record<string, unknown>;
}

export type RealtimeClientCommand =
  | { type: "auth"; token: string; deviceId: string }
  | { type: "subscribe"; conversationId: string }
  | { type: "unsubscribe"; conversationId: string }
  | { type: "typing.start"; conversationId: string }
  | { type: "typing.stop"; conversationId: string }
  | { type: "active_conversation.set"; conversationId: string | null }
  | { type: "delivery.ack"; conversationId: string; messageId: string }
  | { type: "conversation.read"; conversationId: string; messageId: string }
  | { type: "voice.server.subscribe"; serverId: string; knownVersion?: number }
  | { type: "voice.server.unsubscribe"; serverId: string }
  | { type: "ping" };

export type VoiceMoveFailureCode =
  | "NOT_IN_VOICE"
  | "SOURCE_CHANGED"
  | "TARGET_NOT_FOUND"
  | "TARGET_NOT_VOICE"
  | "TARGET_FULL"
  | "MISSING_CONNECT_PERMISSION"
  | "MISSING_MOVE_MEMBERS_PERMISSION"
  | "ROLE_HIERARCHY_DENIED"
  | "TARGET_CLIENT_OFFLINE"
  | "TRANSPORT_ERROR"
  | "JOIN_FAILED"
  | "TIMEOUT"
  | "CONFLICT";

export interface VoiceMemberStateDto {
  userId: string;
  sessionId: string;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
  screenSharing: boolean;
  connectionQuality?: "excellent" | "good" | "poor" | "unknown";
}

export interface ServerVoiceStateDto {
  serverId: string;
  version: number;
  generatedAt: string;
  channels: Array<{
    channelId: string;
    members: VoiceMemberStateDto[];
  }>;
}

export interface MoveVoiceMemberRequest {
  clientRequestId: string;
  subjectUserId: string;
  targetChannelId: string;
  expectedSourceChannelId?: string;
  expectedVoiceSessionId?: string;
}

export interface MoveVoiceMemberAccepted {
  movementId: string;
  status: "pending";
  expiresAt: string;
}

export interface DesktopMessageNotification {
  id: string;
  title: string;
  body: string;
  serverId?: string | undefined;
  channelId?: string | undefined;
  conversationId?: string | undefined;
  messageId?: string | undefined;
  silent?: boolean | undefined;
}

export type DesktopMessageNotificationTarget = Pick<
  DesktopMessageNotification,
  "serverId" | "channelId" | "conversationId" | "messageId"
>;

export type DesktopUpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "up-to-date"
  | "unsupported"
  | "error";

export interface DesktopUpdateState {
  status: DesktopUpdateStatus;
  currentVersion: string;
  version?: string;
  percent?: number;
  message?: string;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
  platformRole: PlatformRole;
  hasPassword: boolean;
  twoFactorEnabled: boolean;
  avatarUrl?: string | null;
}

export interface UserProfileSettings {
  id: string;
  email: string;
  displayName: string;
  username: string | null;
  bio: string | null;
  avatarUrl: string | null;
  coverUrl?: string | null;
  usernameChangedAt: string | null;
  updatedAt: string;
}

export interface BlockedUserSettings {
  userId: string;
  displayName: string;
  username: string | null;
  blockedAt: string;
}

export interface UserAccountSettings {
  email: string;
  emailVerified: boolean;
  pendingEmail: string | null;
  deactivationScheduledAt: string | null;
  deletionAt: string | null;
  ownsServers: boolean;
}

export interface PasswordLoginChallenge {
  status: "SECOND_FACTOR_REQUIRED";
  factor: "email" | "totp" | "recovery";
  retryAfterSeconds: number;
}

export interface TwoFactorSetup {
  secret: string;
  otpauthUri: string;
}

export interface TwoFactorEnableResult {
  user: PublicUser;
  recoveryCodes: string[];
}

export interface UserSession {
  id: string;
  deviceName: string;
  current: boolean;
  trusted: boolean;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
}

export type SecurityEventType =
  | "SESSION_CREATED"
  | "SESSION_REVOKED"
  | "PASSWORD_CHANGED"
  | "PASSWORD_RESET"
  | "TWO_FACTOR_ENABLED"
  | "TWO_FACTOR_DISABLED"
  | "RECOVERY_CODES_REGENERATED"
  | "REFRESH_TOKEN_REUSE_DETECTED"
  | "PROFILE_UPDATED"
  | "USERNAME_CHANGED"
  | "EMAIL_CHANGED"
  | "ACCOUNT_DEACTIVATION_SCHEDULED"
  | "ACCOUNT_DEACTIVATION_CANCELLED";

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  deviceName: string | null;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: PublicUser;
  isNewUser: boolean;
}

export interface RoomConnection {
  roomId: string;
  ownerUserId: string;
  livekitUrl: string;
  livekitToken: string;
  participantIdentity: string;
  voiceSessionId?: string;
  participantDisplayName: string;
  isOwner: boolean;
  contextType: "channel";
  serverId: string;
  channelId: string;
  serverName?: string;
  channelName?: string;
  canSpeak?: boolean;
  canStream?: boolean;
  canStreamApplicationAudio?: boolean;
  canMoveMembers?: boolean;
  seamlesslyMoved?: boolean;
}

export interface DesktopSourceInfo {
  id: string;
  name: string;
  thumbnailDataUrl: string;
  appIconDataUrl?: string;
  type: "screen" | "window";
  displayName?: string;
  width?: number;
  height?: number;
  audioAvailable: boolean;
}

export interface DesktopBridge {
  getAppVersion(): Promise<string>;
  getUpdateState(): Promise<DesktopUpdateState>;
  checkForUpdates(): Promise<void>;
  installUpdate(): Promise<void>;
  onUpdateState(callback: (state: DesktopUpdateState) => void): () => void;
  completeAuthSession(
    path: DesktopAuthCompletionPath,
    body: unknown,
    apiBaseUrl: string,
    rememberSession?: boolean,
  ): Promise<DesktopAuthCompletionResult>;
  refreshAuthSession(): Promise<DesktopAuthSession | null>;
  logoutAuthSession(): Promise<void>;
  clearAuthSession(): Promise<void>;
  listDesktopSources(): Promise<DesktopSourceInfo[]>;
  selectDesktopSource(sourceId: string, includeAudio: boolean): Promise<void>;
  clearSelectedDesktopSource(): Promise<void>;
  copyToClipboard(text: string): Promise<void>;
  openExternal(
    url: "https://t.me/MaksZJ" | "mailto:vatrushka-notify@yandex.ru",
  ): Promise<void>;
  setBadgeCount(count: number): Promise<void>;
  showMessageNotification(
    notification: DesktopMessageNotification,
  ): Promise<void>;
  onMessageNotificationClick(
    callback: (target: DesktopMessageNotificationTarget) => void,
  ): () => void;
  onDeepLink(callback: (inviteToken: string) => void): () => void;
  getPlatform(): Promise<string>;
  getLocalSettings(): Promise<LocalSettings>;
  updateLocalSettings(settings: LocalSettings): Promise<void>;
}

export interface DesktopAuthSession {
  accessToken: string;
  expiresIn: number;
  user: PublicUser;
}

export type DesktopAuthCompletionPath =
  "/auth/register/verify-code" | "/auth/password/complete";

export type DesktopAuthCompletionResult =
  | { ok: true; session: DesktopAuthSession & { isNewUser: boolean } }
  | {
      ok: false;
      status: number;
      error: { code: string; message: string; details: unknown } | null;
    };
