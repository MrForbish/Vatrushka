import { describe, expect, it, vi } from 'vitest';

import { FakeObjectStorage } from '../testing/fakes.js';
import type { CanonicalMessagingStore } from './canonical-messaging.js';
import { MediaCleanupWorker } from './media-cleanup.js';

describe('MediaCleanupWorker', () => {
  it('deletes queued objects only after PostgreSQL scheduled the cleanup job', async () => {
    const storage = new FakeObjectStorage();
    storage.objects.set('prod/messages/stale', { content: Buffer.from('stale'), mimeType: 'text/plain' });
    const completeObjectDeletion = vi.fn(async () => undefined);
    const store = {
      scheduleStaleAttachmentCleanup: vi.fn(async () => 1),
      claimObjectDeletionBatch: vi.fn(async () => [{ id: 'job-1', objectKey: 'prod/messages/stale', attempts: 1 }]),
      completeObjectDeletion,
      retryObjectDeletion: vi.fn(async () => undefined),
    } as unknown as CanonicalMessagingStore;
    const worker = new MediaCleanupWorker(store, storage, 24, 60);

    await expect(worker.drainOnce(new Date('2026-07-18T00:00:00.000Z'))).resolves.toBe(1);
    expect(storage.objects.has('prod/messages/stale')).toBe(false);
    expect(completeObjectDeletion).toHaveBeenCalledWith('job-1', expect.any(Date));
  });

  it('retains a durable retry when object deletion fails', async () => {
    const storage = new FakeObjectStorage();
    storage.available = false;
    const completeObjectDeletion = vi.fn(async () => undefined);
    const retryObjectDeletion = vi.fn(async () => undefined);
    const store = {
      scheduleStaleAttachmentCleanup: vi.fn(async () => 0),
      claimObjectDeletionBatch: vi.fn(async () => [{ id: 'job-2', objectKey: 'prod/messages/retry', attempts: 2 }]),
      completeObjectDeletion,
      retryObjectDeletion,
    } as unknown as CanonicalMessagingStore;
    const worker = new MediaCleanupWorker(store, storage, 24, 60);

    await worker.drainOnce(new Date('2026-07-18T00:00:00.000Z'));
    expect(retryObjectDeletion).toHaveBeenCalledWith('job-2', 2, 'Object storage unavailable', expect.any(Date));
    expect(completeObjectDeletion).not.toHaveBeenCalled();
  });
});
