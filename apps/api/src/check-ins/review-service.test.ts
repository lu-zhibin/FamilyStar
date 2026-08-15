import { describe, expect, it, vi } from 'vitest';

import type { SessionStore } from '../family-auth/types.js';
import { createRedisKeyspace } from '../infrastructure/redis/keys.js';
import type { RedisCommandPort } from '../infrastructure/redis/primitives.js';
import { SubmissionReviewError, SubmissionReviewService } from './review-service.js';
import type {
  PendingSubmissionReviewItem,
  SubmissionReviewRecord,
  SubmissionReviewRepository,
} from './review-types.js';

const reviewedAt = new Date('2026-07-31T12:00:00.000Z');

function record(overrides: Partial<SubmissionReviewRecord> = {}): SubmissionReviewRecord {
  return {
    id: 'review-1',
    familyId: 'family-1',
    targetType: 'CHECK_IN',
    targetId: 'check-in-1',
    attemptId: 'attempt-1',
    idempotencyKey: 'review-key',
    decision: 'APPROVED',
    source: 'PARENT',
    reason: null,
    reviewerId: 'parent-1',
    reviewedAt,
    ...overrides,
  };
}

function dependencies(role: 'parent' | 'child' = 'parent') {
  const repository: SubmissionReviewRepository = {
    listPendingReviews: vi.fn().mockResolvedValue([]),
    findFamilySettings: vi
      .fn()
      .mockResolvedValue({ timeZone: 'Asia/Shanghai', reviewTimeoutHours: 48 }),
    listReviewHistory: vi.fn().mockResolvedValue([]),
    findByIdempotencyKey: vi.fn().mockResolvedValue(null),
    reviewCheckIn: vi.fn(async (input) =>
      record({
        idempotencyKey: input.idempotencyKey,
        decision: input.decision,
        reason: input.reason ?? null,
      }),
    ),
    reviewCollaborationSubmission: vi.fn(async (input) =>
      record({
        targetType: 'COLLABORATION_SUBMISSION',
        targetId: input.submissionId,
        idempotencyKey: input.idempotencyKey,
        decision: input.decision,
        reason: input.reason ?? null,
      }),
    ),
    listCheckInReviews: vi.fn().mockResolvedValue([]),
    listCollaborationSubmissionReviews: vi.fn().mockResolvedValue([]),
  };
  const sessions: SessionStore = {
    create: vi.fn(),
    read: vi.fn(async (token) =>
      token === 'session'
        ? {
            subjectId: role === 'parent' ? 'parent-1' : 'child-1',
            familyId: 'family-1',
            role,
            issuedAt: reviewedAt.toISOString(),
          }
        : null,
    ),
    revoke: vi.fn(),
    revokeSubject: vi.fn(),
  };
  const commands: readonly (readonly string[])[] = [];
  const mutableCommands = commands as (readonly string[])[];
  const redis: RedisCommandPort = {
    sendCommand: vi.fn(async (arguments_) => {
      mutableCommands.push(arguments_);
      return arguments_[0] === 'SET' ? 'OK' : 1;
    }),
  };
  return { repository, sessions, redis, commands };
}

function service(values = dependencies()) {
  return new SubmissionReviewService({
    repository: values.repository,
    sessions: values.sessions,
    redis: values.redis,
    keys: createRedisKeyspace('test'),
    now: () => reviewedAt,
    ownerTokenFactory: () => 'owner-1',
  });
}

describe('SubmissionReviewService', () => {
  it('lists only the authenticated parent family pending queue', async () => {
    const values = dependencies();
    await service(values).listPendingReviews({ sessionToken: 'session' });

    expect(values.repository.listPendingReviews).toHaveBeenCalledWith('family-1', 100);
  });

  it('derives each pending review deadline and overdue state from family settings', async () => {
    const values = dependencies();
    const pending: PendingSubmissionReviewItem = {
      targetType: 'CHECK_IN',
      targetId: 'check-in-1',
      attemptId: 'attempt-1',
      task: { id: 'task-1', name: '晨读' },
      child: { id: 'child-1', nickname: '小星' },
      contentText: null,
      media: [],
      submittedAt: new Date('2026-07-29T12:00:00.000Z'),
    };
    vi.mocked(values.repository.listPendingReviews).mockResolvedValue([pending]);

    const result = await service(values).listPendingReviews({ sessionToken: 'session' });

    expect(result.reviews[0]).toMatchObject({
      reviewDeadlineAt: new Date('2026-07-31T12:00:00.000Z'),
      isOverdue: true,
    });
  });

  it('filters family review history by family date boundaries', async () => {
    const values = dependencies();
    vi.mocked(values.repository.listReviewHistory).mockResolvedValue([
      {
        ...record(),
        task: { id: 'task-1', name: '晨读' },
        child: { id: 'child-1', nickname: '小星' },
      },
    ]);

    const result = await service(values).listReviewHistory({
      sessionToken: 'session',
      childId: '00000000-0000-4000-8000-000000000001',
      taskId: '00000000-0000-4000-8000-000000000002',
      decision: 'APPROVED',
      startDate: '2026-07-31',
      endDate: '2026-07-31',
      cursor: null,
      limit: 25,
    });

    expect(values.repository.listReviewHistory).toHaveBeenCalledWith({
      familyId: 'family-1',
      childId: '00000000-0000-4000-8000-000000000001',
      taskId: '00000000-0000-4000-8000-000000000002',
      decision: 'APPROVED',
      startAt: new Date('2026-07-30T16:00:00.000Z'),
      endAtExclusive: new Date('2026-07-31T16:00:00.000Z'),
      cursor: null,
      limit: 25,
    });
    expect(result.page).toEqual({ has_more: false, next_cursor: null });
  });

  it('reviews a pending check-in under an owner lock and releases the lock', async () => {
    const values = dependencies();
    const result = await service(values).reviewCheckIn({
      sessionToken: 'session',
      checkInId: 'check-in-1',
      idempotencyKey: 'review-key',
      decision: 'REJECTED',
      reason: '  Add a photo  ',
    });

    expect(result.review.reason).toBe('Add a photo');
    expect(values.repository.reviewCheckIn).toHaveBeenCalledWith({
      familyId: 'family-1',
      checkInId: 'check-in-1',
      reviewerId: 'parent-1',
      idempotencyKey: 'review-key',
      decision: 'REJECTED',
      reason: 'Add a photo',
      reviewedAt,
    });
    expect(values.commands[0]).toEqual([
      'SET',
      'test:review-lock:CHECK_IN:check-in-1',
      'owner-1',
      'PX',
      '10000',
      'NX',
    ]);
    expect(values.commands[1]?.[0]).toBe('EVAL');
  });

  it('requires a non-empty rejection reason before acquiring a lock', async () => {
    const values = dependencies();
    await expect(
      service(values).reviewCheckIn({
        sessionToken: 'session',
        checkInId: 'check-in-1',
        idempotencyKey: 'review-key',
        decision: 'REJECTED',
        reason: '   ',
      }),
    ).rejects.toMatchObject({ code: 'INVALID' });
    expect(values.redis.sendCommand).not.toHaveBeenCalled();
  });

  it('requires a parent session', async () => {
    await expect(
      service(dependencies('child')).reviewCheckIn({
        sessionToken: 'session',
        checkInId: 'check-in-1',
        idempotencyKey: 'review-key',
        decision: 'APPROVED',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('returns an existing review for an idempotent retry without taking a lock', async () => {
    const values = dependencies();
    vi.mocked(values.repository.findByIdempotencyKey).mockResolvedValue(record());
    const result = await service(values).reviewCheckIn({
      sessionToken: 'session',
      checkInId: 'check-in-1',
      idempotencyKey: 'review-key',
      decision: 'APPROVED',
    });

    expect(result.review.id).toBe('review-1');
    expect(values.redis.sendCommand).not.toHaveBeenCalled();
    expect(values.repository.reviewCheckIn).not.toHaveBeenCalled();
  });

  it('rejects idempotency key reuse for another target', async () => {
    const values = dependencies();
    vi.mocked(values.repository.findByIdempotencyKey).mockResolvedValue(record());
    await expect(
      service(values).reviewCollaborationSubmission({
        sessionToken: 'session',
        submissionId: 'submission-1',
        idempotencyKey: 'review-key',
        decision: 'APPROVED',
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<SubmissionReviewError>>({ code: 'CONFLICT' }),
    );
  });

  it('reports lock contention as a conflict', async () => {
    const values = dependencies();
    vi.mocked(values.redis.sendCommand).mockResolvedValue(null);
    await expect(
      service(values).reviewCheckIn({
        sessionToken: 'session',
        checkInId: 'check-in-1',
        idempotencyKey: 'review-key',
        decision: 'APPROVED',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(values.repository.reviewCheckIn).not.toHaveBeenCalled();
  });

  it('property: serializes concurrent decisions so only one reaches the repository', async () => {
    let lockOwner: string | null = null;
    let finishReview!: (value: SubmissionReviewRecord) => void;
    const pendingReview = new Promise<SubmissionReviewRecord>((resolve) => {
      finishReview = resolve;
    });
    const values = dependencies();
    vi.mocked(values.redis.sendCommand).mockImplementation(async (arguments_) => {
      if (arguments_[0] === 'SET') {
        if (lockOwner) return null;
        lockOwner = String(arguments_[2]);
        return 'OK';
      }
      lockOwner = null;
      return 1;
    });
    vi.mocked(values.repository.reviewCheckIn).mockReturnValue(pendingReview);
    const reviews = service(values);

    const winner = reviews.reviewCheckIn({
      sessionToken: 'session',
      checkInId: 'check-in-1',
      idempotencyKey: 'approve-key',
      decision: 'APPROVED',
    });
    await vi.waitFor(() => expect(values.repository.reviewCheckIn).toHaveBeenCalledOnce());
    const competitor = reviews
      .reviewCheckIn({
        sessionToken: 'session',
        checkInId: 'check-in-1',
        idempotencyKey: 'reject-key',
        decision: 'REJECTED',
        reason: 'Try again',
      })
      .then(
        (value) => ({ status: 'fulfilled' as const, value }),
        (reason: unknown) => ({ status: 'rejected' as const, reason }),
      );

    await vi.waitFor(() => expect(values.redis.sendCommand).toHaveBeenCalledTimes(2));
    finishReview(record({ idempotencyKey: 'approve-key' }));
    const [winnerResult, competitorResult] = await Promise.all([
      winner.then(
        (value) => ({ status: 'fulfilled' as const, value }),
        (reason: unknown) => ({ status: 'rejected' as const, reason }),
      ),
      competitor,
    ]);

    expect(winnerResult).toMatchObject({
      status: 'fulfilled',
      value: { review: { decision: 'APPROVED' } },
    });
    expect(competitorResult).toMatchObject({
      status: 'rejected',
      reason: { code: 'CONFLICT' },
    });
    expect(values.repository.reviewCheckIn).toHaveBeenCalledOnce();
    expect(lockOwner).toBeNull();
  });

  it('serializes concurrent collaboration decisions under the submission lock', async () => {
    let lockOwner: string | null = null;
    let finishReview!: (value: SubmissionReviewRecord) => void;
    const pendingReview = new Promise<SubmissionReviewRecord>((resolve) => {
      finishReview = resolve;
    });
    const values = dependencies();
    vi.mocked(values.redis.sendCommand).mockImplementation(async (arguments_) => {
      if (arguments_[0] === 'SET') {
        if (lockOwner) return null;
        lockOwner = String(arguments_[2]);
        return 'OK';
      }
      lockOwner = null;
      return 1;
    });
    vi.mocked(values.repository.reviewCollaborationSubmission).mockReturnValue(pendingReview);
    const reviews = service(values);

    const winner = reviews.reviewCollaborationSubmission({
      sessionToken: 'session',
      submissionId: 'submission-1',
      idempotencyKey: 'approve-collaboration',
      decision: 'APPROVED',
    });
    await vi.waitFor(() =>
      expect(values.repository.reviewCollaborationSubmission).toHaveBeenCalledOnce(),
    );
    const competitor = reviews
      .reviewCollaborationSubmission({
        sessionToken: 'session',
        submissionId: 'submission-1',
        idempotencyKey: 'reject-collaboration',
        decision: 'REJECTED',
        reason: 'Try again',
      })
      .then(
        (value) => ({ status: 'fulfilled' as const, value }),
        (reason: unknown) => ({ status: 'rejected' as const, reason }),
      );

    await vi.waitFor(() => expect(values.redis.sendCommand).toHaveBeenCalledTimes(2));
    finishReview(
      record({
        targetType: 'COLLABORATION_SUBMISSION',
        targetId: 'submission-1',
        idempotencyKey: 'approve-collaboration',
      }),
    );
    const [winnerResult, competitorResult] = await Promise.all([
      winner.then(
        (value) => ({ status: 'fulfilled' as const, value }),
        (reason: unknown) => ({ status: 'rejected' as const, reason }),
      ),
      competitor,
    ]);

    expect(winnerResult).toMatchObject({
      status: 'fulfilled',
      value: { review: { targetType: 'COLLABORATION_SUBMISSION', decision: 'APPROVED' } },
    });
    expect(competitorResult).toMatchObject({
      status: 'rejected',
      reason: { code: 'CONFLICT' },
    });
    expect(values.repository.reviewCollaborationSubmission).toHaveBeenCalledOnce();
    expect(values.redis.sendCommand).toHaveBeenNthCalledWith(1, [
      'SET',
      'test:review-lock:COLLABORATION_SUBMISSION:submission-1',
      'owner-1',
      'PX',
      '10000',
      'NX',
    ]);
    expect(lockOwner).toBeNull();
  });
});
