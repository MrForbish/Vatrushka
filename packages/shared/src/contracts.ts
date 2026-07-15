import type { LocalSettings } from './schemas.js';

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
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
  guestSessionToken?: string;
}

export interface DesktopSourceInfo {
  id: string;
  name: string;
  thumbnailDataUrl: string;
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
