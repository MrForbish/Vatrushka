import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from './constants.js';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase();
}

export function generateRoomCode(
  length = ROOM_CODE_LENGTH,
  randomIndex: (upperBound: number) => number = secureRandomIndex,
): string {
  if (length < 6 || length > 8) {
    throw new RangeError('Room code length must be between 6 and 8');
  }
  return Array.from({ length }, () => ROOM_CODE_ALPHABET[randomIndex(ROOM_CODE_ALPHABET.length)]).join('');
}

function secureRandomIndex(upperBound: number): number {
  const limit = Math.floor(0x1_0000_0000 / upperBound) * upperBound;
  const buffer = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0] ?? 0;
  } while (value >= limit);
  return value % upperBound;
}

export function expiresAt(now: Date, seconds: number): Date {
  return new Date(now.getTime() + seconds * 1000);
}

export function isExpired(value: Date, now = new Date()): boolean {
  return value.getTime() <= now.getTime();
}

export interface ScreenShareLeaseState {
  participantIdentity: string;
  participantDisplayName: string;
  acquiredAt: Date;
  expiresAt: Date;
}

export type LeaseDecision =
  | { ok: true; lease: ScreenShareLeaseState }
  | { ok: false; current: ScreenShareLeaseState };

export function decideScreenShareLease(
  current: ScreenShareLeaseState | null,
  participantIdentity: string,
  participantDisplayName: string,
  now: Date,
  leaseSeconds: number,
): LeaseDecision {
  if (current && !isExpired(current.expiresAt, now) && current.participantIdentity !== participantIdentity) {
    return { ok: false, current };
  }
  return {
    ok: true,
    lease: {
      participantIdentity,
      participantDisplayName,
      acquiredAt: current?.participantIdentity === participantIdentity ? current.acquiredAt : now,
      expiresAt: expiresAt(now, leaseSeconds),
    },
  };
}

export function initials(displayName: string): string {
  return displayName
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function colorForIdentity(identity: string): string {
  let hash = 0;
  for (const character of identity) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(hash) % 360} 68% 55%)`;
}
