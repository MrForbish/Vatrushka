export interface UserRecord {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthCodeRecord {
  id: string;
  email: string;
  codeHash: string;
  purpose: 'login';
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

export type RefreshRotation =
  | { status: 'ok'; oldSession: SessionRecord; newSession: SessionRecord }
  | { status: 'not_found' }
  | { status: 'expired'; session: SessionRecord }
  | { status: 'reused'; session: SessionRecord };

export type LeaseClaim = { status: 'ok'; lease: LeaseRecord } | { status: 'busy'; lease: LeaseRecord };
