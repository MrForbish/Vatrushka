import type { VatrushkaService } from "../service.js";

export class VoiceReconciliationWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly service: VatrushkaService,
    private readonly intervalSeconds: number,
    private readonly report: (error: unknown) => void = () => undefined,
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

  private async tick(): Promise<void> {
    try {
      await this.service.reconcileVoicePresence();
    } catch (error) {
      this.report(error);
    } finally {
      if (this.running) {
        this.timer = setTimeout(
          () => void this.tick(),
          this.intervalSeconds * 1_000,
        );
        this.timer.unref();
      }
    }
  }
}
