import type { LocalSettings } from './schemas.js';

export type PlatformRole = 'member' | 'admin' | 'owner';

export const serverPermissions = [
  'ADMINISTRATOR',
  'VIEW_SERVER',
  'VIEW_SERVER_SETTINGS',
  'MANAGE_SERVER',
  'MANAGE_APPEARANCE',
  'MANAGE_MEMBERS',
  'MANAGE_CHANNELS',
  'MANAGE_ROLES',
  'MANAGE_INVITES',
  'MANAGE_INTEGRATIONS',
  'VIEW_AUDIT_LOG',
  'EXPORT_AUDIT_LOG',
  'MANAGE_MODERATION',
  'MANAGE_BACKUPS',
  'TRANSFER_OWNERSHIP',
  'DELETE_SERVER',
  'MANAGE_SERVER_SECURITY',
  'KICK_MEMBERS',
  'BAN_MEMBERS',
  'TIMEOUT_MEMBERS',
  'MANAGE_NICKNAMES',
  'VIEW_MODERATION_NOTES',
  'MANAGE_REPORTS',
  'VIEW_CHANNEL',
  'READ_MESSAGE_HISTORY',
  'SEND_MESSAGES',
  'SEND_ATTACHMENTS',
  'ADD_REACTIONS',
  'EMBED_LINKS',
  'MENTION_EVERYONE',
  'MANAGE_OWN_MESSAGES',
  'MANAGE_MESSAGES',
  'PIN_MESSAGES',
  'CREATE_THREADS',
  'CONNECT_VOICE',
  'SPEAK',
  'STREAM_SCREEN',
  'STREAM_APPLICATION_AUDIO',
  'USE_PRIORITY_VOICE',
  'MUTE_MEMBERS',
  'DEAFEN_MEMBERS',
  'MOVE_MEMBERS',
  'STOP_OTHERS_STREAM',
  'CREATE_TEMPORARY_VOICE',
  'MANAGE_2FA_POLICY',
  'MANAGE_SESSIONS',
  'VIEW_TECHNICAL_LOGS',
  'EXPORT_SERVER_DATA',
] as const;

export type ServerPermission = (typeof serverPermissions)[number];
export type ServerChannelType = 'text' | 'voice';
export type ServerRoleKind = 'EVERYONE' | 'OWNER' | 'CUSTOM';

export type PermissionOverwriteTargetType = 'ROLE' | 'MEMBER';

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
}

export type HomePresence = 'online' | 'idle' | 'dnd' | 'offline';
export type PresencePreference = 'online' | 'idle' | 'do_not_disturb' | 'invisible';
export type EffectivePresenceStatus = 'online' | 'idle' | 'dnd' | 'offline';
export type DirectMessagePrivacy = 'shared_servers' | 'nobody';
export type PresenceVisibility = 'shared_servers' | 'nobody';

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
export type HomeConnectionStatus = 'healthy' | 'degraded' | 'offline';
export type HomeDestinationType = 'server' | 'text_channel' | 'voice_channel';

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
  type: 'active_call' | HomeDestinationType;
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
  type: 'voice_channel' | 'text_channel';
  title: string;
  subtitle: string;
  participants: HomeParticipantPreview[];
  participantCount: number;
  hasVoiceActivity: boolean;
  unreadCount: number;
  lastActivityAt: string;
  destination: HomeDestination;
}

export type HomeActivityType =
  | 'opened_channel'
  | 'joined_voice'
  | 'left_voice'
  | 'sent_message'
  | 'joined_server'
  | 'mention_received';

export interface HomeRecentActivityItem {
  id: string;
  type: HomeActivityType;
  title: string;
  context: string;
  occurredAt: string;
  destination: HomeDestination | null;
}

export interface HomeOnboardingStep {
  id: 'create_server' | 'configure_channels' | 'invite_members';
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
    platformBadge: 'FOUNDER_DEVELOPER' | null;
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
  platformRole: PlatformRole;
  joinedAt: string;
  roles: ServerRole[];
  presence?: EffectivePresenceStatus;
  customStatusText?: string | null;
}

export interface ServerDetail extends ServerSummary {
  channels: ServerChannel[];
  roles: ServerRole[];
  members: ServerMember[];
  permissions: ServerPermission[];
}

export interface TextMessage {
  id: string;
  channelId: string;
  authorUserId: string;
  authorDisplayName: string;
  authorPlatformRole: PlatformRole;
  content: string;
  mentions?: MessageMention[];
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
  lastMessage: { authorUserId: string; content: string; createdAt: string } | null;
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
  replyTo: { messageId: string; authorUserId: string; authorDisplayName: string; content: string } | null;
  reactions: Array<{ emoji: string; count: number; reactedByCurrentUser: boolean }>;
  attachments: MessageAttachment[];
  createdAt: string;
  editedAt: string | null;
}

export type ConversationType = 'server_channel' | 'direct' | 'group_direct';
export type ConversationMentionType = 'user' | 'role' | 'everyone';
export type ConversationNotificationType = 'direct_message' | 'mention' | 'reply' | 'server_invite' | 'moderation' | 'system';

export interface ConversationSummary {
  id: string;
  type: ConversationType;
  serverId: string | null;
  channelId: string | null;
  title: string;
  updatedAt: string;
  lastMessage: { id: string; authorId: string; content: string; createdAt: string } | null;
  unreadCount: number;
  mentionCount: number;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  clientMessageId: string;
  author: { id: string; displayName: string; username: string | null; avatarUrl: string | null };
  content: string;
  replyTo: { id: string; authorId: string; authorDisplayName: string; content: string } | null;
  attachments: Array<{ id: string; fileName: string; mimeType: string; sizeBytes: string; width: number | null; height: number | null; durationMs: number | null }>;
  reactions: Array<{ emoji: string; count: number; reactedByCurrentUser: boolean }>;
  mentions: Array<{ id: string; type: ConversationMentionType; userId: string | null; roleId: string | null; start: number | null; length: number | null }>;
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

export interface UserUnreadSummary {
  totalDirectUnread: number;
  totalMentionUnread: number;
  totalReplyUnread: number;
  conversations: Array<{ conversationId: string; unreadCount: number; mentionCount: number; firstUnreadMessageId: string | null }>;
}

export type NotificationPreviewMode = 'full' | 'sender_only' | 'hidden';

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
  | 'message.created'
  | 'message.updated'
  | 'message.deleted'
  | 'message.reaction.updated'
  | 'conversation.read_state.updated'
  | 'conversation.unread.updated'
  | 'notification.created'
  | 'typing.started'
  | 'typing.stopped'
  | 'presence.updated'
  | 'session.revoked'
  | 'feature_flags.updated';

export interface RealtimeEvent {
  id: string;
  type: RealtimeEventType;
  occurredAt: string;
  conversationId: string | null;
  targetUserIds: string[];
  payload: Record<string, unknown>;
}

export type RealtimeClientCommand =
  | { type: 'auth'; token: string; deviceId: string }
  | { type: 'subscribe'; conversationId: string }
  | { type: 'unsubscribe'; conversationId: string }
  | { type: 'typing.start'; conversationId: string }
  | { type: 'typing.stop'; conversationId: string }
  | { type: 'active_conversation.set'; conversationId: string | null }
  | { type: 'delivery.ack'; conversationId: string; messageId: string }
  | { type: 'conversation.read'; conversationId: string; messageId: string }
  | { type: 'ping' };

export interface DesktopMessageNotification {
  id: string;
  title: string;
  body: string;
  serverId: string;
  channelId: string;
  silent?: boolean | undefined;
}

export type DesktopUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'up-to-date'
  | 'unsupported'
  | 'error';

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
}

export interface PasswordLoginChallenge {
  status: 'SECOND_FACTOR_REQUIRED';
  factor: 'email' | 'totp' | 'recovery';
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
  | 'SESSION_CREATED'
  | 'SESSION_REVOKED'
  | 'PASSWORD_CHANGED'
  | 'TWO_FACTOR_ENABLED'
  | 'TWO_FACTOR_DISABLED'
  | 'RECOVERY_CODES_REGENERATED'
  | 'REFRESH_TOKEN_REUSE_DETECTED';

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
  participantDisplayName: string;
  isOwner: boolean;
  contextType: 'channel';
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
  type: 'screen' | 'window';
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
  completeAuthSession(path: DesktopAuthCompletionPath, body: unknown, apiBaseUrl: string): Promise<DesktopAuthCompletionResult>;
  refreshAuthSession(): Promise<DesktopAuthSession | null>;
  logoutAuthSession(): Promise<void>;
  clearAuthSession(): Promise<void>;
  listDesktopSources(): Promise<DesktopSourceInfo[]>;
  selectDesktopSource(sourceId: string, includeAudio: boolean): Promise<void>;
  clearSelectedDesktopSource(): Promise<void>;
  copyToClipboard(text: string): Promise<void>;
  showMessageNotification(notification: DesktopMessageNotification): Promise<void>;
  onMessageNotificationClick(callback: (target: Pick<DesktopMessageNotification, 'serverId' | 'channelId'>) => void): () => void;
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

export type DesktopAuthCompletionPath = '/auth/register/verify-code' | '/auth/password/complete';

export type DesktopAuthCompletionResult =
  | { ok: true; session: DesktopAuthSession & { isNewUser: boolean } }
  | { ok: false; status: number; error: { code: string; message: string; details: unknown } | null };
