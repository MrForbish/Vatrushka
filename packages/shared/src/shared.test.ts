import { describe, expect, it } from 'vitest';

import {
  createApiError,
  decideScreenShareLease,
  displayNameSchema,
  expiresAt,
  generateRoomCode,
  isExpired,
  normalizeEmail,
  roomCodeSchema,
} from './index.js';

describe('shared domain helpers', () => {
  it('normalizes an email', () => expect(normalizeEmail('  USER@Example.COM ')).toBe('user@example.com'));

  it('validates multilingual display names', () => {
    expect(displayNameSchema.parse('  Анна-Мария  ')).toBe('Анна-Мария');
    expect(displayNameSchema.safeParse('a').success).toBe(false);
    expect(displayNameSchema.safeParse('Name\u0000').success).toBe(false);
  });

  it('normalizes and validates room codes', () => {
    expect(roomCodeSchema.parse(' abc234 ')).toBe('ABC234');
    expect(roomCodeSchema.safeParse('ABO120').success).toBe(false);
  });

  it('generates a code from the safe alphabet', () => {
    const code = generateRoomCode(6, () => 0);
    expect(code).toBe('AAAAAA');
    expect(roomCodeSchema.parse(code)).toBe(code);
  });

  it('formats API errors consistently', () => {
    expect(createApiError('ROOM_FULL', 'req-1')).toEqual({
      code: 'ROOM_FULL',
      message: 'В комнате уже находится максимальное количество участников',
      details: null,
      requestId: 'req-1',
    });
  });

  it('calculates expiration boundaries', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const expiration = expiresAt(now, 10);
    expect(isExpired(expiration, new Date('2026-01-01T00:00:09.999Z'))).toBe(false);
    expect(isExpired(expiration, new Date('2026-01-01T00:00:10.000Z'))).toBe(true);
  });

  it('allows one live screen-share lease and replaces expired leases', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const first = decideScreenShareLease(null, 'user_1_a', 'Anna', now, 30);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('Expected lease');
    expect(decideScreenShareLease(first.lease, 'user_2_b', 'Bob', new Date(now.getTime() + 1_000), 30).ok).toBe(false);
    expect(decideScreenShareLease(first.lease, 'user_2_b', 'Bob', new Date(now.getTime() + 31_000), 30).ok).toBe(true);
  });
});
