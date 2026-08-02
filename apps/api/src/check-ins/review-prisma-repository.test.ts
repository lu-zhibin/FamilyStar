import type { Prisma, PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { PointsTransactionWriter } from '../points/types.js';
import { PrismaSubmissionReviewRepository } from './review-prisma-repository.js';

const reviewedAt = new Date('2026-07-31T12:00:00.000Z');

function databaseReview() {
  return {
    id: 'review-1',
    familyId: 'family-1',
    targetType: 'CHECK_IN' as const,
    checkInAttemptId: 'attempt-1',
    collaborationAttemptId: null,
    idempotencyKey: 'review-key',
    decision: 'REJECTED' as const,
    source: 'PARENT' as const,
    reason: 'Add a photo',
    reviewerId: 'parent-1',
    reviewedAt,
    createdAt: reviewedAt,
    checkInAttempt: { checkInId: 'check-in-1' },
    collaborationAttempt: null,
  };
}

function pointsWriter(transaction: object, earnCheckIn = vi.fn().mockResolvedValue({})) {
  const completeCollaborationRound = vi.fn().mockResolvedValue(false);
  return {
    earnCheckIn,
    completeCollaborationRound,
    writer: {
      run: vi.fn((work) =>
        work(transaction as Prisma.TransactionClient, {
          earnCheckIn,
          completeCollaborationRound,
        }),
      ),
    } as PointsTransactionWriter,
  };
}

describe('PrismaSubmissionReviewRepository', () => {
  it('merges the authenticated family pending submissions using latest attempts', async () => {
    const prisma = {
      checkIn: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'check-in-1',
            task: { id: 'task-1', name: '晨读' },
            child: { id: 'child-1', nickname: '小星' },
            attempts: [
              {
                id: 'check-attempt-2',
                contentText: '完成两章',
                submittedAt: new Date('2026-07-31T11:00:00.000Z'),
              },
            ],
            media: [
              {
                mediaAsset: { id: 'media-1', type: 'IMAGE', mimeType: 'image/jpeg' },
              },
            ],
          },
        ]),
      },
      collaborationSubmission: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'submission-1',
            round: { task: { id: 'task-2', name: '整理房间' } },
            child: { id: 'child-2', nickname: '小月' },
            attempts: [
              {
                id: 'collaboration-attempt-1',
                contentText: null,
                submittedAt: new Date('2026-07-31T10:00:00.000Z'),
              },
            ],
            media: [],
          },
        ]),
      },
    } as unknown as PrismaClient;

    const result = await new PrismaSubmissionReviewRepository(prisma).listPendingReviews(
      'family-1',
      100,
    );

    expect(result.map(({ targetId }) => targetId)).toEqual(['submission-1', 'check-in-1']);
    expect(result[1]).toMatchObject({
      attemptId: 'check-attempt-2',
      task: { name: '晨读' },
      child: { nickname: '小星' },
      media: [{ id: 'media-1', type: 'IMAGE' }],
    });
    expect(prisma.checkIn.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ familyId: 'family-1', status: 'PENDING' }),
        take: 100,
      }),
    );
    expect(prisma.collaborationSubmission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ familyId: 'family-1', status: 'PENDING' }),
        take: 100,
      }),
    );
  });

  it('updates only a pending check-in and creates its review in one transaction', async () => {
    const transaction = {
      submissionReview: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(databaseReview()),
      },
      checkIn: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'check-in-1',
          attempts: [{ id: 'attempt-1' }],
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (operation) => operation(transaction)),
    } as unknown as PrismaClient;
    const points = pointsWriter(transaction);

    const result = await new PrismaSubmissionReviewRepository(prisma, points.writer).reviewCheckIn({
      familyId: 'family-1',
      checkInId: 'check-in-1',
      reviewerId: 'parent-1',
      idempotencyKey: 'review-key',
      decision: 'REJECTED',
      reason: 'Add a photo',
      reviewedAt,
    });

    expect(transaction.checkIn.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'check-in-1',
        familyId: 'family-1',
        status: 'PENDING',
        deletedAt: null,
      },
      data: {
        status: 'REJECTED',
        reviewerId: 'parent-1',
        reviewedAt,
        reviewComment: 'Add a photo',
      },
    });
    expect(transaction.submissionReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetType: 'CHECK_IN',
          checkInAttemptId: 'attempt-1',
          idempotencyKey: 'review-key',
          source: 'PARENT',
        }),
      }),
    );
    expect(result).toMatchObject({
      targetType: 'CHECK_IN',
      targetId: 'check-in-1',
      attemptId: 'attempt-1',
    });
    expect(points.earnCheckIn).not.toHaveBeenCalled();
  });

  it('returns a conflict when the pending condition no longer matches', async () => {
    const transaction = {
      submissionReview: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      checkIn: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'check-in-1',
          attempts: [{ id: 'attempt-1' }],
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (operation) => operation(transaction)),
    } as unknown as PrismaClient;

    await expect(
      new PrismaSubmissionReviewRepository(prisma).reviewCheckIn({
        familyId: 'family-1',
        checkInId: 'check-in-1',
        reviewerId: 'parent-1',
        idempotencyKey: 'review-key',
        decision: 'APPROVED',
        reviewedAt,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('awards assignment override points when a parent approves a check-in', async () => {
    const approvedReview = {
      ...databaseReview(),
      decision: 'APPROVED' as const,
      reason: null,
    };
    const transaction = {
      submissionReview: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(approvedReview),
      },
      checkIn: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'check-in-1',
          childId: 'child-1',
          checkDate: new Date('2026-07-31T00:00:00.000Z'),
          taskAssignment: { customPoints: 15, task: { basePoints: 10 } },
          attempts: [{ id: 'attempt-1' }],
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const points = pointsWriter(transaction);
    const repository = new PrismaSubmissionReviewRepository({} as PrismaClient, points.writer);

    await repository.reviewCheckIn({
      familyId: 'family-1',
      checkInId: 'check-in-1',
      reviewerId: 'parent-1',
      idempotencyKey: 'review-key',
      decision: 'APPROVED',
      reviewedAt,
    });

    expect(points.earnCheckIn).toHaveBeenCalledWith({
      familyId: 'family-1',
      userId: 'child-1',
      checkInId: 'check-in-1',
      basePoints: 15,
      awardDate: '2026-07-31',
      actorId: 'parent-1',
      occurredAt: reviewedAt,
    });
  });

  it('rejects a transaction-time idempotency collision with another target', async () => {
    const transaction = {
      submissionReview: {
        findUnique: vi.fn().mockResolvedValue(databaseReview()),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (operation) => operation(transaction)),
    } as unknown as PrismaClient;

    await expect(
      new PrismaSubmissionReviewRepository(prisma).reviewCollaborationSubmission({
        familyId: 'family-1',
        submissionId: 'submission-1',
        reviewerId: 'parent-1',
        idempotencyKey: 'review-key',
        decision: 'APPROVED',
        reviewedAt,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('checks collaboration completion after a parent approval', async () => {
    const collaborationReview = {
      ...databaseReview(),
      targetType: 'COLLABORATION_SUBMISSION' as const,
      checkInAttemptId: null,
      collaborationAttemptId: 'attempt-1',
      decision: 'APPROVED' as const,
      reason: null,
      checkInAttempt: null,
      collaborationAttempt: { submissionId: 'submission-1' },
    };
    const transaction = {
      submissionReview: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(collaborationReview),
      },
      collaborationSubmission: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'submission-1',
          roundId: 'round-1',
          attempts: [{ id: 'attempt-1' }],
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const points = pointsWriter(transaction);

    await new PrismaSubmissionReviewRepository(
      {} as PrismaClient,
      points.writer,
    ).reviewCollaborationSubmission({
      familyId: 'family-1',
      submissionId: 'submission-1',
      reviewerId: 'parent-1',
      idempotencyKey: 'review-key',
      decision: 'APPROVED',
      reviewedAt,
    });

    expect(points.completeCollaborationRound).toHaveBeenCalledWith({
      familyId: 'family-1',
      roundId: 'round-1',
      actorId: 'parent-1',
      occurredAt: reviewedAt,
    });
  });

  it('merges both target kinds into one ordered bounded candidate batch', async () => {
    const prisma = {
      checkIn: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'check-in-1',
            familyId: 'family-1',
            family: { settings: { reviewTimeoutHours: 48 } },
            attempts: [
              { id: 'check-attempt-1', submittedAt: new Date('2026-07-29T12:00:00.000Z') },
            ],
          },
        ]),
      },
      collaborationSubmission: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'submission-1',
            familyId: 'family-2',
            family: { settings: { reviewTimeoutHours: 24 } },
            attempts: [
              { id: 'collab-attempt-1', submittedAt: new Date('2026-07-28T12:00:00.000Z') },
            ],
          },
        ]),
      },
    } as unknown as PrismaClient;

    const result = await new PrismaSubmissionReviewRepository(prisma).listPendingReviewCandidates(
      1,
    );

    expect(result).toEqual([
      expect.objectContaining({
        targetType: 'COLLABORATION_SUBMISSION',
        targetId: 'submission-1',
        attemptId: 'collab-attempt-1',
      }),
    ]);
    expect(prisma.checkIn.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 1 }));
    expect(prisma.collaborationSubmission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1 }),
    );
  });

  it.each([
    ['CHECK_IN', 'check-in-1', 'checkInAttemptId', 'reviewerId'],
    ['COLLABORATION_SUBMISSION', 'submission-1', 'collaborationAttemptId', 'reviewedById'],
  ] as const)(
    'automatically approves a pending %s with timeout history',
    async (targetType, targetId, attemptField, reviewerField) => {
      const automaticReview = {
        ...databaseReview(),
        targetType,
        checkInAttemptId: targetType === 'CHECK_IN' ? 'attempt-1' : null,
        collaborationAttemptId: targetType === 'COLLABORATION_SUBMISSION' ? 'attempt-1' : null,
        decision: 'APPROVED' as const,
        source: 'TIMEOUT' as const,
        reason: null,
        reviewerId: null,
        checkInAttempt: targetType === 'CHECK_IN' ? { checkInId: targetId } : null,
        collaborationAttempt:
          targetType === 'COLLABORATION_SUBMISSION' ? { submissionId: targetId } : null,
      };
      const target = {
        findFirst: vi.fn().mockResolvedValue({
          childId: 'child-1',
          checkDate: new Date('2026-07-31T00:00:00.000Z'),
          roundId: 'round-1',
          taskAssignment: { customPoints: null, task: { basePoints: 10 } },
          attempts: [{ id: 'attempt-1' }],
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      };
      const transaction = {
        submissionReview: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(automaticReview),
        },
        checkIn: targetType === 'CHECK_IN' ? target : undefined,
        collaborationSubmission: targetType === 'COLLABORATION_SUBMISSION' ? target : undefined,
      };
      const prisma = {
        $transaction: vi.fn(async (operation) => operation(transaction)),
      } as unknown as PrismaClient;
      const points = pointsWriter(transaction);

      const result = await new PrismaSubmissionReviewRepository(
        prisma,
        points.writer,
      ).approveTimedOutSubmission({
        candidate: {
          familyId: 'family-1',
          familySettings: { reviewTimeoutHours: 48 },
          targetType,
          targetId,
          attemptId: 'attempt-1',
          submittedAt: new Date('2026-07-29T12:00:00.000Z'),
        },
        idempotencyKey: `timeout:${targetType}:attempt-1`,
        reviewedAt,
      });

      if (targetType === 'CHECK_IN') {
        expect(points.earnCheckIn).toHaveBeenCalledWith({
          familyId: 'family-1',
          userId: 'child-1',
          checkInId: 'check-in-1',
          basePoints: 10,
          awardDate: '2026-07-31',
          actorId: null,
          occurredAt: reviewedAt,
        });
      } else {
        expect(points.earnCheckIn).not.toHaveBeenCalled();
        expect(points.completeCollaborationRound).toHaveBeenCalledWith({
          familyId: 'family-1',
          roundId: 'round-1',
          actorId: null,
          occurredAt: reviewedAt,
        });
      }

      expect(target.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PENDING' }),
          data: expect.objectContaining({
            status: 'APPROVED',
            [reviewerField]: null,
          }),
        }),
      );
      expect(transaction.submissionReview.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            source: 'TIMEOUT',
            reviewerId: null,
            [attemptField]: 'attempt-1',
          }),
        }),
      );
      expect(result).toMatchObject({ source: 'TIMEOUT', reviewerId: null, targetType });
    },
  );

  it('skips an automatic review when the parent changed status concurrently', async () => {
    const transaction = {
      submissionReview: { findUnique: vi.fn().mockResolvedValue(null) },
      checkIn: {
        findFirst: vi.fn().mockResolvedValue({ attempts: [{ id: 'attempt-1' }] }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (operation) => operation(transaction)),
    } as unknown as PrismaClient;

    await expect(
      new PrismaSubmissionReviewRepository(prisma).approveTimedOutSubmission({
        candidate: {
          familyId: 'family-1',
          familySettings: { reviewTimeoutHours: 48 },
          targetType: 'CHECK_IN',
          targetId: 'check-in-1',
          attemptId: 'attempt-1',
          submittedAt: new Date('2026-07-29T12:00:00.000Z'),
        },
        idempotencyKey: 'timeout:CHECK_IN:attempt-1',
        reviewedAt,
      }),
    ).resolves.toBeNull();
  });

  it('skips an automatic review when a newer attempt replaced the candidate', async () => {
    const transaction = {
      submissionReview: { findUnique: vi.fn().mockResolvedValue(null) },
      checkIn: {
        findFirst: vi.fn().mockResolvedValue({ attempts: [{ id: 'attempt-2' }] }),
        updateMany: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (operation) => operation(transaction)),
    } as unknown as PrismaClient;

    await expect(
      new PrismaSubmissionReviewRepository(prisma).approveTimedOutSubmission({
        candidate: {
          familyId: 'family-1',
          familySettings: { reviewTimeoutHours: 48 },
          targetType: 'CHECK_IN',
          targetId: 'check-in-1',
          attemptId: 'attempt-1',
          submittedAt: new Date('2026-07-29T12:00:00.000Z'),
        },
        idempotencyKey: 'timeout:CHECK_IN:attempt-1',
        reviewedAt,
      }),
    ).resolves.toBeNull();
    expect(transaction.checkIn.updateMany).not.toHaveBeenCalled();
  });
});
