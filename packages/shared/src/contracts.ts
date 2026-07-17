import type { LocalSettings } from './schemas.js';

export type PlatformRole = 'member' | 'admin' | 'owner';

export const serverPermissions = [
  'ADMINISTRATOR',
  'VIEW_SERVER',
  'MANAGE_SERVER',
  'MANAGE_CHANNELS',
  'MANAGE_ROLES',
  'MANAGE_INVITES',
  'MANAGE_INTEGRATIONS',
  'VIEW_AUDIT_LOG',
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
  inviteCode: string;
  ownerUserId: string;
  memberCount: number;
  createdAt: string;
}

export interface ServerChannel {
  id: string;
  serverId: string;
  name: string;
  type: ServerChannelType;
  position: number;
  unreadCount: number;
  permissions?: ServerPermission[];
  permissionOverwrites?: ChannelPermissionOverwrite[];
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

export interface DesktopMessageNotification {
  id: string;
  title: string;
  body: string;
  serverId: string;
  channelId: string;
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
  code: string;
  livekitUrl: string;
  livekitToken: string;
  participantIdentity: string;
  participantDisplayName: string;
  isOwner: boolean;
  contextType: 'channel';
  serverId: string;
  channelId: string;
  canSpeak?: boolean;
  canStream?: boolean;
  canStreamApplicationAudio?: boolean;
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
  onDeepLink(callback: (serverInviteCode: string) => void): () => void;
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
