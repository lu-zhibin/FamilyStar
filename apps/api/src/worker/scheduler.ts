import type { WorkerHealth, WorkerJob } from './types.js';
import { workerErrorCode, WorkerJobRunner } from './job-runner.js';

export class WorkerScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private healthState: WorkerHealth = {
    startedAt: new Date(),
    lastTickAt: null,
    lastSuccessfulTickAt: null,
    lastErrorCode: null,
  };

  constructor(
    private readonly runner: WorkerJobRunner,
    private readonly jobs: readonly WorkerJob[],
    private readonly pollIntervalMilliseconds: number,
  ) {}

  health(): WorkerHealth {
    return this.healthState;
  }

  async tick(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    let lastErrorCode: string | null = null;
    try {
      for (const job of this.jobs) {
        try {
          await this.runner.run(job, now);
        } catch (error) {
          lastErrorCode = workerErrorCode(error);
          console.error(
            JSON.stringify({
              timestamp: new Date().toISOString(),
              level: 'error',
              event: 'worker_job_failed',
              job_name: job.name,
              error_code: lastErrorCode,
            }),
          );
        }
      }
      this.healthState = {
        ...this.healthState,
        lastTickAt: now,
        ...(lastErrorCode === null ? { lastSuccessfulTickAt: now } : {}),
        lastErrorCode,
      };
    } finally {
      this.running = false;
    }
  }

  async start(): Promise<void> {
    await this.tick();
    this.timer = setInterval(() => void this.tick(), this.pollIntervalMilliseconds);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
