import { randomUUID } from 'node:crypto';

import { normalizeFamilySettings } from '../family-settings/service.js';
import { encodeCursor, InvalidPaginationError } from '../http/cursor.js';
import {
  InvalidQueryFilterError,
  parseFamilyDateRange,
  parseUuidFilter,
} from '../http/query-validation.js';
import { acquireLock, releaseLock } from '../infrastructure/redis/primitives.js';
import type {
  ReviewDecision,
  ReviewHistoryQuery,
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
    const settings = await this.dependencies.repository.findFamilySettings(session.familyId);
    if (!settings) throw new SubmissionReviewError('NOT_FOUND', 'The family was not found.');
    const timeoutHours = normalizeFamilySettings(settings).reviewTimeoutHours;
    const now = this.now().getTime();
    const reviews = await this.dependencies.repository.listPendingReviews(
      session.familyId,
      PENDING_REVIEW_LIMIT,
    );
    return {
      reviews: reviews.map((review) => {
        const reviewDeadlineAt =
          timeoutHours === 0
            ? null
            : new Date(review.submittedAt.getTime() + timeoutHours * 60 * 60 * 1000);
        return {
          ...review,
          reviewDeadlineAt,
          isOverdue: reviewDeadlineAt !== null && reviewDeadlineAt.getTime() <= now,
        };
      }),
    };
  }

  async listReviewHistory(input: ReviewHistoryQuery & { sessionToken?: string }) {
    const session = await this.requireParent(input.sessionToken);
    const settings = await this.dependencies.repository.findFamilySettings(session.familyId);
    if (!settings) throw new SubmissionReviewError('NOT_FOUND', 'The family was not found.');
    if ((input.startDate === undefined) !== (input.endDate === undefined)) {
      throw new InvalidQueryFilterError('start_date and end_date must be provided together.');
    }
    const dateRange =
      input.startDate && input.endDate
        ? parseFamilyDateRange({
            startDate: input.startDate,
            endDate: input.endDate,
            timeZone: normalizeFamilySettings(settings).timeZone,
            maxDays: 366,
          })
        : null;
    const records = await this.dependencies.repository.listReviewHistory({
      familyId: session.familyId,
      ...(input.childId === undefined ? {} : { childId: input.childId }),
      ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
      ...(input.decision === undefined ? {} : { decision: input.decision }),
      ...(dateRange === null
        ? {}
        : { startAt: dateRange.startAt, endAtExclusive: dateRange.endAtExclusive }),
      cursor: this.reviewHistoryCursor(input.cursor),
      limit: input.limit,
    });
    const hasMore = records.length > input.limit;
    const reviews = records.slice(0, input.limit);
    const last = reviews.at(-1);
    return {
      reviews,
      page: {
        has_more: hasMore,
        next_cursor:
          hasMore && last
            ? encodeCursor({ sortValue: last.reviewedAt.toISOString(), id: last.id })
            : null,
      },
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

  private reviewHistoryCursor(cursor: ReviewHistoryQuery['cursor']) {
    if (!cursor) return null;
    const reviewedAt = new Date(cursor.sortValue);
    if (!Number.isFinite(reviewedAt.getTime()) || reviewedAt.toISOString() !== cursor.sortValue) {
      throw new InvalidPaginationError('The cursor is invalid.');
    }
    try {
      const reviewId = parseUuidFilter(cursor.id, 'cursor review id');
      if (!reviewId) throw new InvalidPaginationError('The cursor is invalid.');
      return { reviewedAt, reviewId };
    } catch (error) {
      if (error instanceof InvalidPaginationError) throw error;
      if (error instanceof InvalidQueryFilterError) {
        throw new InvalidPaginationError('The cursor is invalid.');
      }
      throw error;
    }
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
