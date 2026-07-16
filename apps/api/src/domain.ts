import type { PlatformRole, ServerChannelType, ServerPermission } from '@vatrushka/shared';

export interface UserRecord {
  id: string;
  email: string;
  displayName: string | null;
  platformRole: PlatformRole;
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
  totpSecretEncrypted: string | null;
  twoFactorEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthCodeRecord {
  id: string;
  email: string;
  codeHash: string;
  purpose: 'login' | 'registration' | 'password_login' | 'password_setup';
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
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBySessionId: string | null;
  createdAt: Date;
  lastUsedAt: Date;
}

export type RoomStatus = 'active' | 'closed' | 'expired';

export interface RoomRecord {
  id: string;
  code: string;
  ownerUserId: string;
  livekitRoomName: string;
  status: RoomStatus;
  isLocked: boolean;
  maxParticipants: number;
  expiresAt: Date;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GuestSessionRecord {
  id: string;
  roomId: string;
  displayName: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface LeaseRecord {
  roomId: string;
  participantIdentity: string;
  participantDisplayName: string;
  acquiredAt: Date;
  expiresAt: Date;
}

export interface ServerRecord {
  id: string;
  name: string;
  inviteCode: string;
  ownerUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServerMemberRecord {
  serverId: string;
  userId: string;
  joinedAt: Date;
}

export interface ServerRoleRecord {
  id: string;
  serverId: string;
  name: string;
  color: string;
  position: number;
  isDefault: boolean;
  permissions: ServerPermission[];
  createdAt: Date;
  updatedAt: Date;
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
  createdAt: Date;
  editedAt: Date | null;
}

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
export type ServerMemberProfile = ServerMemberRecord & Pick<UserRecord, 'displayName' | 'platformRole'>;
export type TextMessageWithAuthor = TextMessageRecord & Pick<UserRecord, 'displayName' | 'platformRole'>;

export type RefreshRotation =
  | { status: 'ok'; oldSession: SessionRecord; newSession: SessionRecord }
  | { status: 'not_found' }
  | { status: 'expired'; session: SessionRecord }
  | { status: 'reused'; session: SessionRecord };

export type LeaseClaim = { status: 'ok'; lease: LeaseRecord } | { status: 'busy'; lease: LeaseRecord };
