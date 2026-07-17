import { describe, expect, it } from 'vitest';

import { MemoryPresenceStore } from './presence-store.js';

describe('MemoryPresenceStore', () => {
  it('aggregates active sessions and expires heartbeats by TTL', async () => {
    const store = new MemoryPresenceStore();
    const now = new Date('2026-07-17T10:00:00.000Z');
    await store.heartbeat('user-1', 'desktop', true, now, 75);
    await store.heartbeat('user-1', 'laptop', false, now, 75);
    expect(await store.status('user-1', now)).toBe('online');

    await store.removeSession('user-1', 'laptop');
    expect(await store.status('user-1', now)).toBe('idle');
    expect(await store.status('user-1', new Date(now.getTime() + 76_000))).toBe('offline');
  });
});
