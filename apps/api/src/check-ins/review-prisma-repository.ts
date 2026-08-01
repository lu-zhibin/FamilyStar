import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

import { PrismaPointsTransactionWriter } from '../points/prisma-writer.js';
import type { PointsAwardPort, PointsTransactionWriter } from '../points/types.js';
import { SubmissionReviewError } from './review-service.js';
import type {
  PendingReviewCandidate,
  SubmissionReviewRecord,
  SubmissionReviewRepository,
  SubmissionReviewTimeoutRepository,
} from './review-types.js';

const reviewInclude = {
  checkInAttempt: { select: { checkInId: true } },
  collaborationAttempt: { select: { submissionId: true } },
} satisfies Prisma.SubmissionReviewInclude;

type ReviewWithTarget = Prisma.SubmissionReviewGetPayload<{ include: typeof reviewInclude }>;

function reviewRecord(value: ReviewWithTarget): SubmissionReviewRecord {
  if (value.targetType === 'CHECK_IN' && value.checkInAttempt) {
    return {
      id: value.id,
      familyId: value.familyId,
      targetType: value.targetType,
      targetId: value.checkInAttempt.checkInId,
      attemptId: value.checkInAttemptId as string,
      idempotencyKey: value.idempotencyKey,
      decision: value.decision,
      source: value.source,
      reason: value.reason,
      reviewerId: value.reviewerId,
      reviewedAt: value.reviewedAt,
    };
  }
  if (value.targetType === 'COLLABORATION_SUBMISSION' && value.collaborationAttempt) {
    return {
      id: value.id,
      familyId: value.familyId,
      targetType: value.targetType,
      targetId: value.collaborationAttempt.submissionId,
      attemptId: value.collaborationAttemptId as string,
      idempotencyKey: value.idempotencyKey,
      decision: value.decision,
      source: value.source,
      reason: value.reason,
      reviewerId: value.reviewerId,
      reviewedAt: value.reviewedAt,
    };
  }
  throw new Error('Submission review target is inconsistent.');
}

function idempotentReview(
  value: ReviewWithTarget,
  targetType: SubmissionReviewRecord['targetType'],
  targetId: string,
): SubmissionReviewRecord {
  const review = reviewRecord(value);
  if (review.targetType === targetType && review.targetId === targetId) return review;
  throw new SubmissionReviewError('CONFLICT', 'The idempotency key is already in use.');
}

function familySettings(value: Prisma.JsonValue): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export class PrismaSubmissionReviewRepository
  implements SubmissionReviewRepository, SubmissionReviewTimeoutRepository
{
  constructor(
    private readonly prisma: PrismaClient,
    private readonly points: PointsTransactionWriter = new PrismaPointsTransactionWriter(prisma),
  ) {}

  async findByIdempotencyKey(familyId: string, idempotencyKey: string) {
    const value = await this.prisma.submissionReview.findUnique({
      where: { familyId_idempotencyKey: { familyId, idempotencyKey } },
      include: reviewInclude,
    });
    return value ? reviewRecord(value) : null;
  }

  async reviewCheckIn(input: Parameters<SubmissionReviewRepository['reviewCheckIn']>[0]) {
    try {
      return await this.points.run(async (transaction, points) => {
        const duplicate = await transaction.submissionReview.findUnique({
          where: {
            familyId_idempotencyKey: {
              familyId: input.familyId,
              idempotencyKey: input.idempotencyKey,
            },
          },
          include: reviewInclude,
        });
        if (duplicate) return idempotentReview(duplicate, 'CHECK_IN', input.checkInId);

        const checkIn = await transaction.checkIn.findFirst({
          where: { id: input.checkInId, familyId: input.familyId, deletedAt: null },
          select: {
            id: true,
            childId: true,
            checkDate: true,
            taskAssignment: {
              select: { customPoints: true, task: { select: { basePoints: true } } },
            },
            attempts: {
              orderBy: { attemptNumber: 'desc' },
              take: 1,
              select: { id: true },
            },
          },
        });
        const attempt = checkIn?.attempts[0];
        if (!checkIn || !attempt) {
          throw new SubmissionReviewError('NOT_FOUND', 'The check-in was not found.');
        }

        const updated = await transaction.checkIn.updateMany({
          where: {
            id: checkIn.id,
            familyId: input.familyId,
            status: 'PENDING',
            deletedAt: null,
          },
          data: {
            status: input.decision,
            reviewerId: input.reviewerId,
            reviewedAt: input.reviewedAt,
            reviewComment: input.reason ?? null,
          },
        });
        if (updated.count !== 1) {
          const raced = await transaction.submissionReview.findUnique({
            where: {
              familyId_idempotencyKey: {
                familyId: input.familyId,
                idempotencyKey: input.idempotencyKey,
              },
            },
            include: reviewInclude,
          });
          if (raced) return reviewRecord(raced);
          throw new SubmissionReviewError('CONFLICT', 'The check-in is no longer pending.');
        }

        const review = reviewRecord(
          await transaction.submissionReview.create({
            data: {
              familyId: input.familyId,
              targetType: 'CHECK_IN',
              checkInAttemptId: attempt.id,
              idempotencyKey: input.idempotencyKey,
              decision: input.decision,
              source: 'PARENT',
              reason: input.reason ?? null,
              reviewerId: input.reviewerId,
              reviewedAt: input.reviewedAt,
            },
            include: reviewInclude,
          }),
        );
        if (input.decision === 'APPROVED') {
          await this.awardCheckIn(points, {
            familyId: input.familyId,
            childId: checkIn.childId,
            checkInId: checkIn.id,
            basePoints:
              checkIn.taskAssignment.customPoints ?? checkIn.taskAssignment.task.basePoints,
            awardDate: checkIn.checkDate.toISOString().slice(0, 10),
            actorId: input.reviewerId,
            occurredAt: input.reviewedAt,
          });
        }
        return review;
      });
    } catch (error) {
      return this.resolveUniqueConflict(error, input.familyId, input.idempotencyKey, {
        targetType: 'CHECK_IN',
        targetId: input.checkInId,
      });
    }
  }

  async reviewCollaborationSubmission(
    input: Parameters<SubmissionReviewRepository['reviewCollaborationSubmission']>[0],
  ) {
    try {
      return await this.points.run(async (transaction, points) => {
        const duplicate = await transaction.submissionReview.findUnique({
          where: {
            familyId_idempotencyKey: {
              familyId: input.familyId,
              idempotencyKey: input.idempotencyKey,
            },
          },
          include: reviewInclude,
        });
        if (duplicate) {
          return idempotentReview(duplicate, 'COLLABORATION_SUBMISSION', input.submissionId);
        }

        const submission = await transaction.collaborationSubmission.findFirst({
          where: { id: input.submissionId, familyId: input.familyId },
          select: {
            id: true,
            roundId: true,
            attempts: {
              orderBy: { attemptNumber: 'desc' },
              take: 1,
              select: { id: true },
            },
          },
        });
        const attempt = submission?.attempts[0];
        if (!submission || !attempt) {
          throw new SubmissionReviewError(
            'NOT_FOUND',
            'The collaboration submission was not found.',
          );
        }

        const updated = await transaction.collaborationSubmission.updateMany({
          where: { id: submission.id, familyId: input.familyId, status: 'PENDING' },
          data: {
            status: input.decision,
            reviewedById: input.reviewerId,
            reviewedAt: input.reviewedAt,
            reviewComment: input.reason ?? null,
          },
        });
        if (updated.count !== 1) {
          const raced = await transaction.submissionReview.findUnique({
            where: {
              familyId_idempotencyKey: {
                familyId: input.familyId,
                idempotencyKey: input.idempotencyKey,
              },
            },
            include: reviewInclude,
          });
          if (raced) return reviewRecord(raced);
          throw new SubmissionReviewError(
            'CONFLICT',
            'The collaboration submission is no longer pending.',
          );
        }

        const review = reviewRecord(
          await transaction.submissionReview.create({
            data: {
              familyId: input.familyId,
              targetType: 'COLLABORATION_SUBMISSION',
              collaborationAttemptId: attempt.id,
              idempotencyKey: input.idempotencyKey,
              decision: input.decision,
              source: 'PARENT',
              reason: input.reason ?? null,
              reviewerId: input.reviewerId,
              reviewedAt: input.reviewedAt,
            },
            include: reviewInclude,
          }),
        );
        if (input.decision === 'APPROVED') {
          await points.completeCollaborationRound({
            familyId: input.familyId,
            roundId: submission.roundId,
            actorId: input.reviewerId,
            occurredAt: input.reviewedAt,
          });
        }
        return review;
      });
    } catch (error) {
      return this.resolveUniqueConflict(error, input.familyId, input.idempotencyKey, {
        targetType: 'COLLABORATION_SUBMISSION',
        targetId: input.submissionId,
      });
    }
  }

  async listCheckInReviews(familyId: string, checkInId: string) {
    const values = await this.prisma.submissionReview.findMany({
      where: { familyId, targetType: 'CHECK_IN', checkInAttempt: { checkInId } },
      include: reviewInclude,
      orderBy: { reviewedAt: 'asc' },
    });
    return values.map(reviewRecord);
  }

  async listCollaborationSubmissionReviews(familyId: string, submissionId: string) {
    const values = await this.prisma.submissionReview.findMany({
      where: {
        familyId,
        targetType: 'COLLABORATION_SUBMISSION',
        collaborationAttempt: { submissionId },
      },
      include: reviewInclude,
      orderBy: { reviewedAt: 'asc' },
    });
    return values.map(reviewRecord);
  }

  async listPendingReviewCandidates(limit: number): Promise<readonly PendingReviewCandidate[]> {
    const [checkIns, collaborationSubmissions] = await Promise.all([
      this.prisma.checkIn.findMany({
        where: { status: 'PENDING', deletedAt: null, family: { deletedAt: null } },
        select: {
          id: true,
          familyId: true,
          family: { select: { settings: true } },
          attempts: {
            orderBy: { attemptNumber: 'desc' },
            take: 1,
            select: { id: true, submittedAt: true },
          },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: limit,
      }),
      this.prisma.collaborationSubmission.findMany({
        where: { status: 'PENDING', family: { deletedAt: null } },
        select: {
          id: true,
          familyId: true,
          family: { select: { settings: true } },
          attempts: {
            orderBy: { attemptNumber: 'desc' },
            take: 1,
            select: { id: true, submittedAt: true },
          },
        },
        orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
        take: limit,
      }),
    ]);

    const candidates: PendingReviewCandidate[] = [];
    for (const checkIn of checkIns) {
      const attempt = checkIn.attempts[0];
      if (!attempt) continue;
      candidates.push({
        familyId: checkIn.familyId,
        familySettings: familySettings(checkIn.family.settings),
        targetType: 'CHECK_IN',
        targetId: checkIn.id,
        attemptId: attempt.id,
        submittedAt: attempt.submittedAt,
      });
    }
    for (const submission of collaborationSubmissions) {
      const attempt = submission.attempts[0];
      if (!attempt) continue;
      candidates.push({
        familyId: submission.familyId,
        familySettings: familySettings(submission.family.settings),
        targetType: 'COLLABORATION_SUBMISSION',
        targetId: submission.id,
        attemptId: attempt.id,
        submittedAt: attempt.submittedAt,
      });
    }
    return candidates
      .sort(
        (left, right) =>
          left.submittedAt.getTime() - right.submittedAt.getTime() ||
          left.targetType.localeCompare(right.targetType) ||
          left.targetId.localeCompare(right.targetId),
      )
      .slice(0, limit);
  }

  async approveTimedOutSubmission(
    input: Parameters<SubmissionReviewTimeoutRepository['approveTimedOutSubmission']>[0],
  ): Promise<SubmissionReviewRecord | null> {
    try {
      return await this.points.run(async (transaction, points) => {
        const duplicate = await transaction.submissionReview.findUnique({
          where: {
            familyId_idempotencyKey: {
              familyId: input.candidate.familyId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (duplicate) return null;

        if (input.candidate.targetType === 'CHECK_IN') {
          const checkIn = await transaction.checkIn.findFirst({
            where: {
              id: input.candidate.targetId,
              familyId: input.candidate.familyId,
              deletedAt: null,
            },
            select: {
              childId: true,
              checkDate: true,
              taskAssignment: {
                select: { customPoints: true, task: { select: { basePoints: true } } },
              },
              attempts: {
                orderBy: { attemptNumber: 'desc' },
                take: 1,
                select: { id: true },
              },
            },
          });
          if (checkIn?.attempts[0]?.id !== input.candidate.attemptId) return null;
          const updated = await transaction.checkIn.updateMany({
            where: {
              id: input.candidate.targetId,
              familyId: input.candidate.familyId,
              status: 'PENDING',
              deletedAt: null,
            },
            data: {
              status: 'APPROVED',
              reviewerId: null,
              reviewedAt: input.reviewedAt,
              reviewComment: null,
            },
          });
          if (updated.count !== 1) return null;
          const review = reviewRecord(
            await transaction.submissionReview.create({
              data: {
                familyId: input.candidate.familyId,
                targetType: 'CHECK_IN',
                checkInAttemptId: input.candidate.attemptId,
                idempotencyKey: input.idempotencyKey,
                decision: 'APPROVED',
                source: 'TIMEOUT',
                reason: null,
                reviewerId: null,
                reviewedAt: input.reviewedAt,
              },
              include: reviewInclude,
            }),
          );
          await this.awardCheckIn(points, {
            familyId: input.candidate.familyId,
            childId: checkIn.childId,
            checkInId: input.candidate.targetId,
            basePoints:
              checkIn.taskAssignment.customPoints ?? checkIn.taskAssignment.task.basePoints,
            awardDate: checkIn.checkDate.toISOString().slice(0, 10),
            actorId: null,
            occurredAt: input.reviewedAt,
          });
          return review;
        }

        const submission = await transaction.collaborationSubmission.findFirst({
          where: { id: input.candidate.targetId, familyId: input.candidate.familyId },
          select: {
            roundId: true,
            attempts: {
              orderBy: { attemptNumber: 'desc' },
              take: 1,
              select: { id: true },
            },
          },
        });
        if (submission?.attempts[0]?.id !== input.candidate.attemptId) return null;
        const updated = await transaction.collaborationSubmission.updateMany({
          where: {
            id: input.candidate.targetId,
            familyId: input.candidate.familyId,
            status: 'PENDING',
          },
          data: {
            status: 'APPROVED',
            reviewedById: null,
            reviewedAt: input.reviewedAt,
            reviewComment: null,
          },
        });
        if (updated.count !== 1) return null;
        const review = reviewRecord(
          await transaction.submissionReview.create({
            data: {
              familyId: input.candidate.familyId,
              targetType: 'COLLABORATION_SUBMISSION',
              collaborationAttemptId: input.candidate.attemptId,
              idempotencyKey: input.idempotencyKey,
              decision: 'APPROVED',
              source: 'TIMEOUT',
              reason: null,
              reviewerId: null,
              reviewedAt: input.reviewedAt,
            },
            include: reviewInclude,
          }),
        );
        await points.completeCollaborationRound({
          familyId: input.candidate.familyId,
          roundId: submission.roundId,
          actorId: null,
          occurredAt: input.reviewedAt,
        });
        return review;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return null;
      }
      throw error;
    }
  }

  private async awardCheckIn(
    points: PointsAwardPort,
    input: {
      familyId: string;
      childId: string;
      checkInId: string;
      basePoints: number;
      awardDate: string;
      actorId: string | null;
      occurredAt: Date;
    },
  ): Promise<void> {
    await points.earnCheckIn({
      familyId: input.familyId,
      userId: input.childId,
      checkInId: input.checkInId,
      basePoints: input.basePoints,
      awardDate: input.awardDate,
      actorId: input.actorId,
      occurredAt: input.occurredAt,
    });
  }

  private async resolveUniqueConflict(
    error: unknown,
    familyId: string,
    idempotencyKey: string,
    target: { targetType: SubmissionReviewRecord['targetType']; targetId: string },
  ): Promise<SubmissionReviewRecord> {
    if (error instanceof SubmissionReviewError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const duplicate = await this.findByIdempotencyKey(familyId, idempotencyKey);
      if (
        duplicate &&
        duplicate.targetType === target.targetType &&
        duplicate.targetId === target.targetId
      ) {
        return duplicate;
      }
      throw new SubmissionReviewError('CONFLICT', 'The submission has already been reviewed.');
    }
    throw error;
  }
}
