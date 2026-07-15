import type {
  AuthCodeRecord,
  GuestSessionRecord,
  LeaseClaim,
  LeaseRecord,
  RefreshRotation,
  RoomRecord,
  SessionRecord,
  UserRecord,
} from './domain.js';

export interface DataStore {
  healthCheck(): Promise<void>;
  replaceAuthCode(code: AuthCodeRecord): Promise<void>;
  findLatestAuthCode(email: string): Promise<AuthCodeRecord | null>;
  incrementAuthCodeAttempts(id: string): Promise<number>;
  consumeAuthCode(id: string, at: Date): Promise<boolean>;
  getOrCreateUser(email: string, now: Date): Promise<{ user: UserRecord; isNewUser: boolean }>;
  findUserById(id: string): Promise<UserRecord | null>;
  updateDisplayName(id: string, displayName: string, now: Date): Promise<UserRecord | null>;
  createSession(session: SessionRecord): Promise<void>;
  rotateSession(tokenHash: string, replacement: SessionRecord, now: Date): Promise<RefreshRotation>;
  revokeSessionByHash(tokenHash: string, now: Date): Promise<void>;
  revokeSessionFamily(familyId: string, now: Date): Promise<void>;
  createRoom(room: RoomRecord): Promise<boolean>;
  findRoomById(id: string): Promise<RoomRecord | null>;
  findRoomByCode(code: string): Promise<RoomRecord | null>;
  setRoomLocked(id: string, isLocked: boolean, now: Date): Promise<RoomRecord | null>;
  closeRoom(id: string, now: Date): Promise<RoomRecord | null>;
  expireRoom(id: string, now: Date): Promise<RoomRecord | null>;
  createGuestSession(session: GuestSessionRecord): Promise<void>;
  findGuestSessionByTokenHash(tokenHash: string): Promise<GuestSessionRecord | null>;
  revokeGuestSessionsForRoom(roomId: string, now: Date): Promise<void>;
  revokeGuestSessionById(id: string, now: Date): Promise<void>;
  claimLease(
    roomId: string,
    participantIdentity: string,
    participantDisplayName: string,
    now: Date,
    leaseSeconds: number,
  ): Promise<LeaseClaim>;
  heartbeatLease(roomId: string, participantIdentity: string, now: Date, leaseSeconds: number): Promise<LeaseRecord | null>;
  releaseLease(roomId: string, participantIdentity: string): Promise<boolean>;
  releaseLeaseByParticipant(participantIdentity: string): Promise<void>;
  releaseLeaseByRoom(roomId: string): Promise<void>;
}

export interface Mailer {
  sendOtp(email: string, code: string, expiresInMinutes: number): Promise<void>;
}

export interface MediaRoomOptions {
  id: string;
  ownerUserId: string;
  name: string;
  maxParticipants: number;
}

export interface MediaTokenOptions {
  roomName: string;
  identity: string;
  displayName: string;
  metadata: Record<string, string>;
}

export interface MediaService {
  createRoom(options: MediaRoomOptions): Promise<void>;
  deleteRoom(roomName: string): Promise<void>;
  participantCount(roomName: string): Promise<number>;
  participantExists(roomName: string, identity: string): Promise<boolean>;
  removeParticipant(roomName: string, identity: string): Promise<void>;
  issueToken(options: MediaTokenOptions): Promise<string>;
  healthCheck(): Promise<void>;
}
