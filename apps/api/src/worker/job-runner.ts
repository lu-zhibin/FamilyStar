import { randomUUID } from 'node:crypto';

import { acquireLock, releaseLock } from '../infrastructure/redis/primitives.js';
import type { WorkerJob, WorkerJobRunnerDependencies, WorkerJobResult } from './types.js';

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_MILLISECONDS = 5_000;

export function workerErrorCode(error: unknown): string {
  return error instanceof Error && error.name.trim().length > 0
    ? error.name.slice(0, 80)
    : 'UnknownError';
}

export class WorkerJobRunner {
  private readonly maxAttempts: number;
  private readonly retryBaseMilliseconds: number;
  private readonly ownerTokenFactory: () => string;

  constructor(private readonly dependencies: WorkerJobRunnerDependencies) {
    this.maxAttempts = dependencies.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.retryBaseMilliseconds =
      dependencies.retryBaseMilliseconds ?? DEFAULT_RETRY_BASE_MILLISECONDS;
    this.ownerTokenFactory = dependencies.ownerTokenFactory ?? randomUUID;
  }

  async run(job: WorkerJob, now = new Date()): Promise<'completed' | 'skipped'> {
    const ownerToken = this.ownerTokenFactory();
    const lockKey = this.dependencies.lockKey(job.name);
    const acquired = await acquireLock(
      this.dependencies.redis,
      lockKey,
      ownerToken,
      this.dependencies.lockTtlMilliseconds,
    );
    if (!acquired) return 'skipped';

    try {
      const claim = await this.dependencies.repository.claim({
        jobName: job.name,
        runKey: job.runKey(now),
        now,
        staleAfterMilliseconds: this.dependencies.lockTtlMilliseconds,
        maxAttempts: this.maxAttempts,
      });
      if (!claim) return 'skipped';

      try {
        const result: WorkerJobResult = await job.execute(now);
        await this.dependencies.repository.succeed(claim.id, new Date(), result);
        return 'completed';
      } catch (error) {
        const retryDelay = this.retryBaseMilliseconds * 2 ** (claim.attempt - 1);
        await this.dependencies.repository.fail({
          id: claim.id,
          finishedAt: new Date(),
          errorCode: workerErrorCode(error),
          nextRetryAt: claim.attempt < this.maxAttempts ? new Date(Date.now() + retryDelay) : null,
        });
        throw error;
      }
    } finally {
      await releaseLock(this.dependencies.redis, lockKey, ownerToken);
    }
  }
}
