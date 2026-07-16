import type { LocalSettings } from './schemas.js';

export type PlatformRole = 'member' | 'admin' | 'owner';

export const serverPermissions = [
  'VIEW_SERVER',
  'MANAGE_SERVER',
  'MANAGE_CHANNELS',
  'MANAGE_ROLES',
  'CREATE_INVITES',
  'KICK_MEMBERS',
  'VIEW_CHANNEL',
  'SEND_MESSAGES',
  'MANAGE_MESSAGES',
  'CONNECT_VOICE',
  'SPEAK',
  'STREAM',
  'MUTE_MEMBERS',
] as const;

export type ServerPermission = (typeof serverPermissions)[number];
export type ServerChannelType = 'text' | 'voice';

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
}

export interface ServerRole {
  id: string;
  serverId: string;
  name: string;
  color: string;
  position: number;
  isDefault: boolean;
  permissions: ServerPermission[];
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
  createdAt: string;
  editedAt: string | null;
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
  factor: 'email' | 'totp';
  retryAfterSeconds: number;
}

export interface TwoFactorSetup {
  secret: string;
  otpauthUri: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: PublicUser;
  isNewUser: boolean;
}

export interface PublicRoom {
  id?: string;
  code: string;
  status: 'active' | 'closed' | 'expired';
  isLocked: boolean;
  currentParticipantCount: number;
  maxParticipants: number;
  ownerDisplayName: string;
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
  contextType?: 'room' | 'channel';
  serverId?: string;
  channelId?: string;
  canSpeak?: boolean;
  canStream?: boolean;
  guestSessionToken?: string;
}

export interface DesktopSourceInfo {
  id: string;
  name: string;
  thumbnailDataUrl: string;
  appIconDataUrl?: string;
  type: 'screen' | 'window';
}

export interface DesktopBridge {
  getAppVersion(): Promise<string>;
  getStoredRefreshToken(): Promise<string | null>;
  storeRefreshToken(token: string): Promise<void>;
  clearRefreshToken(): Promise<void>;
  listDesktopSources(): Promise<DesktopSourceInfo[]>;
  selectDesktopSource(sourceId: string, includeAudio: boolean): Promise<void>;
  clearSelectedDesktopSource(): Promise<void>;
  copyToClipboard(text: string): Promise<void>;
  onDeepLink(callback: (roomCode: string) => void): () => void;
  getPlatform(): Promise<string>;
  getLocalSettings(): Promise<LocalSettings>;
  updateLocalSettings(settings: LocalSettings): Promise<void>;
}
