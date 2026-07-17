import { describe, expect, it } from 'vitest';

import { FakeObjectStorage } from '../testing/fakes.js';
import { MemoryStore } from '../testing/memory-store.js';
import { attachmentObjectKey, migrateLegacyAttachments } from './attachment-objects.js';

describe('attachment object migration', () => {
  it('moves legacy database bytes to deterministic object keys and is idempotent', async () => {
    const store = new MemoryStore();
    const objectStorage = new FakeObjectStorage();
    const createdAt = new Date('2026-07-17T12:00:00.000Z');
    await store.createMessageAttachment({ id: '11111111-1111-4111-8111-111111111111', messageId: '22222222-2222-4222-8222-222222222222', uploaderUserId: '33333333-3333-4333-8333-333333333333', fileName: 'channel.txt', mimeType: 'text/plain', size: 7, content: Buffer.from('channel'), storageKey: null, createdAt });
    await store.createDirectMessageAttachment({ id: '44444444-4444-4444-8444-444444444444', messageId: '55555555-5555-4555-8555-555555555555', uploaderUserId: '33333333-3333-4333-8333-333333333333', fileName: 'direct.txt', mimeType: 'text/plain', size: 6, content: Buffer.from('direct'), storageKey: null, createdAt });

    await expect(migrateLegacyAttachments(store, objectStorage, 'prod', 1)).resolves.toEqual({ channelAttachments: 1, directAttachments: 1 });
    const channelKey = attachmentObjectKey('prod', 'channels', '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111');
    const directKey = attachmentObjectKey('prod', 'direct', '55555555-5555-4555-8555-555555555555', '44444444-4444-4444-8444-444444444444');
    const channelRecord = await store.findMessageAttachment('11111111-1111-4111-8111-111111111111');
    const directRecord = await store.findDirectMessageAttachment('44444444-4444-4444-8444-444444444444');
    expect(channelRecord?.storageKey).toBe(channelKey);
    expect(directRecord?.storageKey).toBe(directKey);
    expect(Buffer.from(channelRecord?.content ?? [])).toEqual(Buffer.from('channel'));
    expect(Buffer.from(directRecord?.content ?? [])).toEqual(Buffer.from('direct'));
    expect(objectStorage.objects.get(channelKey)?.content.toString()).toBe('channel');
    expect(objectStorage.objects.get(directKey)?.content.toString()).toBe('direct');

    await expect(migrateLegacyAttachments(store, objectStorage, 'prod', 1)).resolves.toEqual({ channelAttachments: 0, directAttachments: 0 });
  });
});
