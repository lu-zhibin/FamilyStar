import type { Prisma, PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { PointsTransactionWriter } from '../points/types.js';
import { PrismaCheckInRepository } from './prisma-repository.js';
import type { CollaborationRoundContext, SoloAssignmentContext } from './types.js';

const submittedAt = new Date('2026-07-31T12:00:00.000Z');

function approvedCheckIn() {
  return {
    id: 'check-in-1',
    familyId: 'family-1',
    taskAssignmentId: 'assignment-1',
    childId: 'child-1',
    taskId: 'task-1',
    checkDate: new Date('2026-07-31T00:00:00.000Z'),
    isMakeup: false,
    contentText: null,
    status: 'APPROVED' as const,
    createdAt: submittedAt,
    media: [],
    attempts: [
      {
        id: 'attempt-1',
        attemptNumber: 1,
        idempotencyKey: 'submit-key',
        contentText: null,
        mediaIds: [],
        status: 'APPROVED' as const,
        submittedAt,
        priorStatus: null,
        priorReviewerId: null,
        priorReviewedAt: null,
        priorReviewComment: null,
      },
    ],
  };
}

describe('PrismaCheckInRepository points integration', () => {
  it('resolves custom assignment points ahead of task base points', async () => {
    const prisma = {
      taskAssignment: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'assignment-1',
          taskId: 'task-1',
          childId: 'child-1',
          startDate: new Date('2026-07-01T00:00:00.000Z'),
          endDate: null,
          customPoints: 15,
          customCheckType: null,
          customVerifyMode: null,
          customFrequency: null,
          task: {
            deletedAt: null,
            status: 'ACTIVE',
            collaborationMode: 'SOLO',
            checkType: 'TICK',
            verifyMode: 'AUTO',
            frequency: { kind: 'daily' },
            basePoints: 10,
          },
          family: { settings: {} },
        }),
      },
    } as unknown as PrismaClient;

    const context = await new PrismaCheckInRepository(prisma).findSoloAssignment(
      'family-1',
      'child-1',
      'assignment-1',
    );

    expect(context?.rewardPoints).toBe(15);
  });

  it('awards the resolved assignment points for an AUTO check-in in the same transaction', async () => {
    const transaction = {
      checkInSubmissionAttempt: { findUnique: vi.fn().mockResolvedValue(null) },
      mediaAsset: { findMany: vi.fn().mockResolvedValue([]) },
      checkIn: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(approvedCheckIn()),
      },
    } as unknown as Prisma.TransactionClient;
    const earnCheckIn = vi.fn().mockResolvedValue({});
    const completeCollaborationRound = vi.fn().mockResolvedValue(false);
    const points: PointsTransactionWriter = {
      run: vi.fn((work) => work(transaction, { earnCheckIn, completeCollaborationRound })),
    };
    const repository = new PrismaCheckInRepository({} as PrismaClient, points);
    const context: SoloAssignmentContext = {
      assignmentId: 'assignment-1',
      familyId: 'family-1',
      childId: 'child-1',
      taskId: 'task-1',
      taskStatus: 'ACTIVE',
      collaborationMode: 'SOLO',
      checkType: 'TICK',
      verifyMode: 'AUTO',
      rewardPoints: 15,
      frequency: { kind: 'daily' },
      startDate: '2026-07-01',
      endDate: null,
      settings: {
        timeZone: 'UTC',
        checkInDeadline: '23:59',
        makeupDays: 3,
        reviewTimeoutHours: 48,
        autoApproveQuota: 0,
        streakMultipliers: [],
      },
    };

    await repository.submitSolo({
      context,
      idempotencyKey: 'submit-key',
      checkDate: '2026-07-31',
      isMakeup: false,
      status: 'APPROVED',
      mediaIds: [],
      submittedAt,
    });

    expect(earnCheckIn).toHaveBeenCalledWith({
      familyId: 'family-1',
      userId: 'child-1',
      checkInId: 'check-in-1',
      basePoints: 15,
      awardDate: '2026-07-31',
      actorId: 'child-1',
      occurredAt: submittedAt,
    });
  });

  it('returns an idempotent AUTO check-in without issuing a second award', async () => {
    const existing = approvedCheckIn();
    const transaction = {
      checkInSubmissionAttempt: {
        findUnique: vi.fn().mockResolvedValue({ checkInId: existing.id }),
      },
      checkIn: { findUniqueOrThrow: vi.fn().mockResolvedValue(existing) },
    } as unknown as Prisma.TransactionClient;
    const earnCheckIn = vi.fn();
    const points: PointsTransactionWriter = {
      run: vi.fn((work) =>
        work(transaction, {
          earnCheckIn,
          completeCollaborationRound: vi.fn(),
        }),
      ),
    };

    await new PrismaCheckInRepository({} as PrismaClient, points).submitSolo({
      context: {
        assignmentId: 'assignment-1',
        familyId: 'family-1',
        childId: 'child-1',
        taskId: 'task-1',
        taskStatus: 'ACTIVE',
        collaborationMode: 'SOLO',
        checkType: 'TICK',
        verifyMode: 'AUTO',
        rewardPoints: 15,
        frequency: { kind: 'daily' },
        startDate: '2026-07-01',
        endDate: null,
        settings: {
          timeZone: 'UTC',
          checkInDeadline: '23:59',
          makeupDays: 3,
          reviewTimeoutHours: 48,
          autoApproveQuota: 0,
          streakMultipliers: [],
        },
      },
      idempotencyKey: 'submit-key',
      checkDate: '2026-07-31',
      isMakeup: false,
      status: 'APPROVED',
      mediaIds: [],
      submittedAt,
    });

    expect(earnCheckIn).not.toHaveBeenCalled();
  });

  it('resubmits a rejected AUTO collaboration attempt as approved and checks completion', async () => {
    const previous = {
      id: 'submission-1',
      familyId: 'family-1',
      roundId: 'round-1',
      childId: 'child-1',
      idempotencyKey: 'first-key',
      contentText: null,
      status: 'REJECTED' as const,
      submittedAt,
      reviewedById: 'parent-1',
      reviewedAt: submittedAt,
      reviewComment: 'Retry',
      attempts: [{ id: 'attempt-1' }],
    };
    const approved = {
      ...previous,
      idempotencyKey: 'second-key',
      status: 'APPROVED' as const,
      reviewedById: null,
      reviewedAt: null,
      reviewComment: null,
      media: [],
      attempts: [
        {
          id: 'attempt-1',
          attemptNumber: 1,
          idempotencyKey: 'first-key',
          contentText: null,
          mediaIds: [],
          status: 'REJECTED' as const,
          submittedAt,
          priorStatus: null,
          priorReviewedById: null,
          priorReviewedAt: null,
          priorReviewComment: null,
        },
        {
          id: 'attempt-2',
          attemptNumber: 2,
          idempotencyKey: 'second-key',
          contentText: null,
          mediaIds: [],
          status: 'APPROVED' as const,
          submittedAt,
          priorStatus: 'REJECTED' as const,
          priorReviewedById: 'parent-1',
          priorReviewedAt: submittedAt,
          priorReviewComment: 'Retry',
        },
      ],
    };
    const transaction = {
      collaborationSubmissionAttempt: { findUnique: vi.fn().mockResolvedValue(null) },
      mediaAsset: { findMany: vi.fn().mockResolvedValue([]) },
      collaborationSubmissionMedia: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      collaborationSubmission: {
        findUnique: vi.fn().mockResolvedValue(previous),
        update: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([{ childId: 'child-1', status: 'APPROVED' }]),
        findUniqueOrThrow: vi.fn().mockResolvedValue(approved),
      },
      collaborationRoundParticipant: {
        findMany: vi.fn().mockResolvedValue([{ childId: 'child-1' }]),
      },
      collaborationRound: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    } as unknown as Prisma.TransactionClient;
    const completeCollaborationRound = vi.fn().mockResolvedValue(true);
    const points: PointsTransactionWriter = {
      run: vi.fn((work) =>
        work(transaction, {
          earnCheckIn: vi.fn(),
          completeCollaborationRound,
        }),
      ),
    };
    const context: CollaborationRoundContext = {
      id: 'round-1',
      familyId: 'family-1',
      status: 'ACTIVE',
      startDate: '2026-07-31',
      endDate: '2026-07-31',
      checkType: 'TICK',
      verifyMode: 'AUTO',
      childIsActiveParticipant: true,
      participants: [{ childId: 'child-1', active: true, submissionStatus: 'REJECTED' }],
    };

    const result = await new PrismaCheckInRepository(
      {} as PrismaClient,
      points,
    ).submitCollaboration({
      context,
      childId: 'child-1',
      idempotencyKey: 'second-key',
      status: 'APPROVED',
      mediaIds: [],
      submittedAt,
    });

    expect(transaction.collaborationSubmission.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) }),
    );
    expect(completeCollaborationRound).toHaveBeenCalledWith({
      familyId: 'family-1',
      roundId: 'round-1',
      actorId: 'child-1',
      occurredAt: submittedAt,
    });
    expect(result).toMatchObject({ status: 'APPROVED', attempts: [{}, {}] });
  });
});
