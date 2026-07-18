import type { AppConfig } from '../config.js';
import type { ObjectStorage } from '../ports.js';
import type { CanonicalMessagingStore } from './canonical-messaging.js';

export class MediaCleanupWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly store: CanonicalMessagingStore,
    private readonly storage: ObjectStorage,
    private readonly unfinishedHours: number,
    private readonly intervalSeconds: number,
    private readonly report: (details: { jobId?: string; result: 'deleted' | 'retry' | 'scheduled'; count?: number; errorCode?: string }) => void = () => undefined,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  async drainOnce(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - this.unfinishedHours * 60 * 60 * 1_000);
    const scheduled = await this.store.scheduleStaleAttachmentCleanup(cutoff, now);
    if (scheduled > 0) this.report({ result: 'scheduled', count: scheduled });
    const jobs = await this.store.claimObjectDeletionBatch(100, now);
    for (const job of jobs) {
      try {
        await this.storage.deleteObject(job.objectKey);
        await this.store.completeObjectDeletion(job.id, new Date());
        this.report({ jobId: job.id, result: 'deleted' });
      } catch (error) {
        await this.store.retryObjectDeletion(job.id, job.attempts, error instanceof Error ? error.message : 'Unknown object deletion error', new Date());
        this.report({ jobId: job.id, result: 'retry', errorCode: error instanceof Error ? error.name : 'UNKNOWN' });
      }
    }
    return jobs.length;
  }

  private async tick(): Promise<void> {
    try { await this.drainOnce(); } catch (error) { this.report({ result: 'retry', errorCode: error instanceof Error ? error.name : 'UNKNOWN' }); }
    finally { if (this.running) this.timer = setTimeout(() => void this.tick(), this.intervalSeconds * 1_000); }
  }
}

export function createMediaCleanupWorker(config: AppConfig, store: CanonicalMessagingStore, storage: ObjectStorage | null, report?: ConstructorParameters<typeof MediaCleanupWorker>[4]): MediaCleanupWorker | null {
  return storage ? new MediaCleanupWorker(store, storage, config.MEDIA_CLEANUP_UNFINISHED_HOURS, config.MEDIA_CLEANUP_INTERVAL_SECONDS, report) : null;
}
