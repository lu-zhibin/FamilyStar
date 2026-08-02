import { randomUUID } from 'node:crypto';

import { acquireLock, releaseLock } from '../infrastructure/redis/primitives.js';
import type {
  ReviewDecision,
  ReviewTargetType,
  SubmissionReviewDependencies,
  SubmissionReviewOperations,
  SubmissionReviewRecord,
} from './review-types.js';

const REVIEW_LOCK_TTL_MILLISECONDS = 10_000;
const PENDING_REVIEW_LIMIT = 100;

export class SubmissionReviewError extends Error {
  constructor(
    public readonly code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' | 'CONFLICT',
    message: string,
  ) {
    super(message);
    this.name = 'SubmissionReviewError';
  }
}

function targetMatches(
  review: SubmissionReviewRecord,
  targetType: ReviewTargetType,
  targetId: string,
): boolean {
  return review.targetType === targetType && review.targetId === targetId;
}

export class SubmissionReviewService implements SubmissionReviewOperations {
  private readonly now: () => Date;
  private readonly ownerTokenFactory: () => string;

  constructor(private readonly dependencies: SubmissionReviewDependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.ownerTokenFactory = dependencies.ownerTokenFactory ?? randomUUID;
  }

  async listPendingReviews(input: Parameters<SubmissionReviewOperations['listPendingReviews']>[0]) {
    const session = await this.requireParent(input.sessionToken);
    return {
      reviews: await this.dependencies.repository.listPendingReviews(
        session.familyId,
        PENDING_REVIEW_LIMIT,
      ),
    };
  }

  async reviewCheckIn(input: Parameters<SubmissionReviewOperations['reviewCheckIn']>[0]) {
    const session = await this.requireParent(input.sessionToken);
    const reason = this.reason(input.decision, input.reason);
    return {
      review: await this.review({
        targetType: 'CHECK_IN',
        targetId: input.checkInId,
        familyId: session.familyId,
        reviewerId: session.subjectId,
        idempotencyKey: input.idempotencyKey,
        decision: input.decision,
        ...(reason === undefined ? {} : { reason }),
      }),
    };
  }

  async reviewCollaborationSubmission(
    input: Parameters<SubmissionReviewOperations['reviewCollaborationSubmission']>[0],
  ) {
    const session = await this.requireParent(input.sessionToken);
    const reason = this.reason(input.decision, input.reason);
    return {
      review: await this.review({
        targetType: 'COLLABORATION_SUBMISSION',
        targetId: input.submissionId,
        familyId: session.familyId,
        reviewerId: session.subjectId,
        idempotencyKey: input.idempotencyKey,
        decision: input.decision,
        ...(reason === undefined ? {} : { reason }),
      }),
    };
  }

  async listCheckInReviews(input: Parameters<SubmissionReviewOperations['listCheckInReviews']>[0]) {
    const session = await this.requireParent(input.sessionToken);
    return {
      reviews: await this.dependencies.repository.listCheckInReviews(
        session.familyId,
        input.checkInId,
      ),
    };
  }

  async listCollaborationSubmissionReviews(
    input: Parameters<SubmissionReviewOperations['listCollaborationSubmissionReviews']>[0],
  ) {
    const session = await this.requireParent(input.sessionToken);
    return {
      reviews: await this.dependencies.repository.listCollaborationSubmissionReviews(
        session.familyId,
        input.submissionId,
      ),
    };
  }

  private async review(input: {
    targetType: ReviewTargetType;
    targetId: string;
    familyId: string;
    reviewerId: string;
    idempotencyKey: string;
    decision: ReviewDecision;
    reason?: string;
  }): Promise<SubmissionReviewRecord> {
    const duplicate = await this.dependencies.repository.findByIdempotencyKey(
      input.familyId,
      input.idempotencyKey,
    );
    if (duplicate) {
      if (targetMatches(duplicate, input.targetType, input.targetId)) return duplicate;
      throw new SubmissionReviewError('CONFLICT', 'The idempotency key is already in use.');
    }

    const lockKey = this.dependencies.keys.reviewLock(input.targetType, input.targetId);
    const ownerToken = this.ownerTokenFactory();
    const acquired = await acquireLock(
      this.dependencies.redis,
      lockKey,
      ownerToken,
      REVIEW_LOCK_TTL_MILLISECONDS,
    );
    if (!acquired) {
      throw new SubmissionReviewError('CONFLICT', 'The submission is currently being reviewed.');
    }

    try {
      const afterLock = await this.dependencies.repository.findByIdempotencyKey(
        input.familyId,
        input.idempotencyKey,
      );
      if (afterLock) {
        if (targetMatches(afterLock, input.targetType, input.targetId)) return afterLock;
        throw new SubmissionReviewError('CONFLICT', 'The idempotency key is already in use.');
      }
      const reviewedAt = this.now();
      if (input.targetType === 'CHECK_IN') {
        return await this.dependencies.repository.reviewCheckIn({
          familyId: input.familyId,
          checkInId: input.targetId,
          reviewerId: input.reviewerId,
          idempotencyKey: input.idempotencyKey,
          decision: input.decision,
          ...(input.reason === undefined ? {} : { reason: input.reason }),
          reviewedAt,
        });
      }
      return await this.dependencies.repository.reviewCollaborationSubmission({
        familyId: input.familyId,
        submissionId: input.targetId,
        reviewerId: input.reviewerId,
        idempotencyKey: input.idempotencyKey,
        decision: input.decision,
        ...(input.reason === undefined ? {} : { reason: input.reason }),
        reviewedAt,
      });
    } finally {
      await releaseLock(this.dependencies.redis, lockKey, ownerToken);
    }
  }

  private reason(decision: ReviewDecision, reason?: string): string | undefined {
    const normalized = reason?.trim();
    if (decision === 'REJECTED' && !normalized) {
      throw new SubmissionReviewError('INVALID', 'A rejection reason is required.');
    }
    return normalized || undefined;
  }

  private async requireParent(token?: string) {
    const session = token ? await this.dependencies.sessions.read(token) : null;
    if (!session) {
      throw new SubmissionReviewError('UNAUTHORIZED', 'An active parent session is required.');
    }
    if (session.role !== 'parent') {
      throw new SubmissionReviewError('FORBIDDEN', 'A parent session is required.');
    }
    return session;
  }
}
