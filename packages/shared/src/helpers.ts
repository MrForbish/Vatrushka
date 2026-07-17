export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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

export function codePointLength(value: string): number {
  return [...value].length;
}

export function codePointSlice(value: string, start: number, length: number): string {
  return [...value].slice(start, start + length).join('');
}

export function codePointIndexToUtf16(value: string, index: number): number {
  return [...value].slice(0, index).join('').length;
}

export function materializeMentionLabels(
  content: string,
  mentions: Array<{ userId: string; start: number; length: number; displayName: string }>,
): { content: string; mentions: Array<{ userId: string; start: number; length: number }> } {
  const source = [...content];
  const parts: string[] = [];
  const materialized: Array<{ userId: string; start: number; length: number }> = [];
  let sourceCursor = 0;
  let outputLength = 0;
  for (const mention of [...mentions].sort((left, right) => left.start - right.start)) {
    if (mention.start < sourceCursor || mention.start + mention.length > source.length) continue;
    const prefix = source.slice(sourceCursor, mention.start).join('');
    const label = `@${mention.displayName}`;
    parts.push(prefix, label);
    outputLength += codePointLength(prefix);
    materialized.push({ userId: mention.userId, start: outputLength, length: codePointLength(label) });
    outputLength += codePointLength(label);
    sourceCursor = mention.start + mention.length;
  }
  parts.push(source.slice(sourceCursor).join(''));
  return { content: parts.join(''), mentions: materialized };
}
