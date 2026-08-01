import { randomUUID } from 'node:crypto';

import { normalizeFamilySettings } from '../family-settings/service.js';
import { acquireLock, releaseLock } from '../infrastructure/redis/primitives.js';
import type {
  PendingReviewCandidate,
  SubmissionReviewTimeoutBatch,
  SubmissionReviewTimeoutDependencies,
} from './review-types.js';

const DEFAULT_BATCH_SIZE = 100;
const REVIEW_LOCK_TTL_MILLISECONDS = 10_000;
const HOUR_MILLISECONDS = 60 * 60 * 1_000;

function timeoutIdempotencyKey(candidate: PendingReviewCandidate): string {
  return `timeout:${candidate.targetType}:${candidate.attemptId}`;
}

export class SubmissionReviewTimeoutService implements SubmissionReviewTimeoutBatch {
  private readonly batchSize: number;
  private readonly now: () => Date;
  private readonly ownerTokenFactory: () => string;

  constructor(private readonly dependencies: SubmissionReviewTimeoutDependencies) {
    this.batchSize = Math.max(1, Math.trunc(dependencies.batchSize ?? DEFAULT_BATCH_SIZE));
    this.now = dependencies.now ?? (() => new Date());
    this.ownerTokenFactory = dependencies.ownerTokenFactory ?? randomUUID;
  }

  async runBatch(): Promise<{ scanned: number; approved: number; skipped: number }> {
    const candidates = await this.dependencies.repository.listPendingReviewCandidates(
      this.batchSize,
    );
    const reviewedAt = this.now();
    let approved = 0;

    for (const candidate of candidates) {
      const timeoutHours = normalizeFamilySettings(candidate.familySettings).reviewTimeoutHours;
      const expiresAt = candidate.submittedAt.getTime() + timeoutHours * HOUR_MILLISECONDS;
      if (timeoutHours === 0 || expiresAt > reviewedAt.getTime()) continue;
      if (await this.approve(candidate, reviewedAt)) approved += 1;
    }

    return {
      scanned: candidates.length,
      approved,
      skipped: candidates.length - approved,
    };
  }

  private async approve(candidate: PendingReviewCandidate, reviewedAt: Date): Promise<boolean> {
    const lockKey = this.dependencies.keys.reviewLock(candidate.targetType, candidate.targetId);
    const ownerToken = this.ownerTokenFactory();
    const acquired = await acquireLock(
      this.dependencies.redis,
      lockKey,
      ownerToken,
      REVIEW_LOCK_TTL_MILLISECONDS,
    );
    if (!acquired) return false;

    try {
      const review = await this.dependencies.repository.approveTimedOutSubmission({
        candidate,
        idempotencyKey: timeoutIdempotencyKey(candidate),
        reviewedAt,
      });
      return review !== null;
    } finally {
      await releaseLock(this.dependencies.redis, lockKey, ownerToken);
    }
  }
}
