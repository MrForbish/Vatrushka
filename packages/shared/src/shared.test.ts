import { describe, expect, it } from 'vitest';

import type { ChannelPermissionOverwrite } from './contracts.js';

import {
  createApiError,
  decideScreenShareLease,
  displayNameSchema,
  expiresAt,
  generateRoomCode,
  isExpired,
  normalizeEmail,
  resolveChannelPermissions,
  resolveServerPermissions,
  roomCodeSchema,
  serverPermissions,
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

  it('resolves default and assigned server permissions without platform privileges', () => {
    const roles = [
      { id: 'everyone', isDefault: true, position: 0, permissions: ['VIEW_SERVER', 'VIEW_CHANNEL'] as const },
      { id: 'writer', isDefault: false, position: 10, permissions: ['SEND_MESSAGES'] as const },
    ];
    expect([...resolveServerPermissions({ isOwner: false, userId: 'member', roles, assignedRoleIds: ['writer'] })]).toEqual(['VIEW_SERVER', 'VIEW_CHANNEL', 'SEND_MESSAGES']);
  });

  it('applies channel overwrites in everyone, roles, then member order', () => {
    const roles = [
      { id: 'everyone', isDefault: true, position: 0, permissions: ['VIEW_SERVER', 'VIEW_CHANNEL', 'SEND_MESSAGES'] as const },
      { id: 'muted', isDefault: false, position: 10, permissions: [] },
      { id: 'speaker', isDefault: false, position: 20, permissions: [] },
    ];
    const permissions = resolveChannelPermissions({
      isOwner: false,
      userId: 'member',
      roles,
      assignedRoleIds: ['muted', 'speaker'],
      overwrites: [
        { channelId: 'channel', targetType: 'ROLE', targetId: 'everyone', allow: [], deny: ['SEND_MESSAGES'] },
        { channelId: 'channel', targetType: 'ROLE', targetId: 'muted', allow: [], deny: ['VIEW_CHANNEL'] },
        { channelId: 'channel', targetType: 'ROLE', targetId: 'speaker', allow: ['VIEW_CHANNEL', 'SEND_MESSAGES'], deny: [] },
        { channelId: 'channel', targetType: 'MEMBER', targetId: 'member', allow: [], deny: ['SEND_MESSAGES'] },
      ],
    });
    expect(permissions.has('VIEW_CHANNEL')).toBe(true);
    expect(permissions.has('SEND_MESSAGES')).toBe(false);
  });

  it('lets Administrator bypass channel overwrites while owner always has every permission', () => {
    const adminRole = { id: 'admin', isDefault: false, position: 50, permissions: ['ADMINISTRATOR'] as const };
    const overwrite = { channelId: 'channel', targetType: 'ROLE', targetId: 'admin', allow: [], deny: ['VIEW_CHANNEL'] } satisfies ChannelPermissionOverwrite;
    expect(resolveChannelPermissions({ isOwner: false, userId: 'admin-user', roles: [adminRole], assignedRoleIds: ['admin'], overwrites: [overwrite] }).has('VIEW_CHANNEL')).toBe(true);
    expect(resolveServerPermissions({ isOwner: true, userId: 'owner', roles: [], assignedRoleIds: [] }).size).toBe(serverPermissions.length);
  });
});
