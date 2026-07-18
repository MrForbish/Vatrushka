import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { CanonicalMessagingStore } from './canonical-messaging.js';

describe('CanonicalMessagingStore.listMessages', () => {
  it('does not leave an untyped cursor parameter when the first page is loaded', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = new CanonicalMessagingStore({ query } as unknown as pg.Pool);

    await store.listMessages('conversation-1', 'user-1', null, null, 100);

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain('limit $3');
    expect(query.mock.calls[0]?.[0]).not.toContain('$4');
    expect(query.mock.calls[0]?.[1]).toEqual(['conversation-1', 'user-1', 101]);
  });

  it('binds before and after cursors using the correct comparison', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = new CanonicalMessagingStore({ query } as unknown as pg.Pool);

    await store.listMessages('conversation-1', 'user-1', '42', null, 25);
    expect(query.mock.calls[0]?.[0]).toContain('m.id < $3::bigint');
    expect(query.mock.calls[0]?.[1]).toEqual(['conversation-1', 'user-1', '42', 26]);

    await store.listMessages('conversation-1', 'user-1', null, '42', 25);
    expect(query.mock.calls[1]?.[0]).toContain('m.id > $3::bigint');
    expect(query.mock.calls[1]?.[1]).toEqual(['conversation-1', 'user-1', '42', 26]);
  });
});
