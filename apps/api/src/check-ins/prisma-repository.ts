import type { Prisma, PrismaClient } from '@prisma/client';

import { normalizeFamilySettings } from '../family-settings/service.js';
import type { MediaAssetRecord } from '../media/types.js';
import { PrismaPointsTransactionWriter } from '../points/prisma-writer.js';
import type { PointsAwardPort, PointsTransactionWriter } from '../points/types.js';
import type { TaskFrequency } from '../tasks/types.js';
import { validateSubmissionContent } from './content.js';
import type {
  CheckInRecord,
  CheckInRepository,
  CollaborationRoundContext,
  CollaborationSubmissionRecord,
  SubmissionAttemptRecord,
} from './types.js';

const checkInInclude = {
  media: { orderBy: { sortOrder: 'asc' as const } },
  attempts: { orderBy: { attemptNumber: 'asc' as const } },
} satisfies Prisma.CheckInInclude;
const collaborationInclude = {
  media: { orderBy: { sortOrder: 'asc' as const } },
  attempts: { orderBy: { attemptNumber: 'asc' as const } },
} satisfies Prisma.CollaborationSubmissionInclude;

type CheckInWithHistory = Prisma.CheckInGetPayload<{ include: typeof checkInInclude }>;
type CollaborationWithHistory = Prisma.CollaborationSubmissionGetPayload<{
  include: typeof collaborationInclude;
}>;

function date(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function mediaIds(value: Prisma.JsonValue): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function checkAttempt(value: CheckInWithHistory['attempts'][number]): SubmissionAttemptRecord {
  return {
    id: value.id,
    attemptNumber: value.attemptNumber,
    idempotencyKey: value.idempotencyKey,
    text: value.contentText,
    mediaIds: mediaIds(value.mediaIds),
    status: value.status,
    submittedAt: value.submittedAt,
    priorStatus: value.priorStatus,
    priorReviewerId: value.priorReviewerId,
    priorReviewedAt: value.priorReviewedAt,
    priorReviewComment: value.priorReviewComment,
  };
}

function collaborationAttempt(
  value: CollaborationWithHistory['attempts'][number],
): SubmissionAttemptRecord {
  return {
    id: value.id,
    attemptNumber: value.attemptNumber,
    idempotencyKey: value.idempotencyKey,
    text: value.contentText,
    mediaIds: mediaIds(value.mediaIds),
    status: value.status,
    submittedAt: value.submittedAt,
    priorStatus: value.priorStatus,
    priorReviewerId: value.priorReviewedById,
    priorReviewedAt: value.priorReviewedAt,
    priorReviewComment: value.priorReviewComment,
  };
}

function checkInRecord(value: CheckInWithHistory): CheckInRecord {
  const attempts = value.attempts.map(checkAttempt);
  return {
    id: value.id,
    familyId: value.familyId,
    assignmentId: value.taskAssignmentId,
    childId: value.childId,
    taskId: value.taskId,
    checkDate: date(value.checkDate),
    isMakeup: value.isMakeup,
    text: value.contentText,
    mediaIds: value.media.map(({ mediaAssetId }) => mediaAssetId),
    status: value.status,
    submittedAt: attempts.at(-1)?.submittedAt ?? value.createdAt,
    attempts,
  };
}

function collaborationRecord(value: CollaborationWithHistory): CollaborationSubmissionRecord {
  const attempts = value.attempts.map(collaborationAttempt);
  return {
    id: value.id,
    familyId: value.familyId,
    roundId: value.roundId,
    childId: value.childId,
    text: value.contentText,
    mediaIds: value.media.map(({ mediaAssetId }) => mediaAssetId),
    status: value.status,
    submittedAt: attempts.at(-1)?.submittedAt ?? value.submittedAt,
    attempts,
  };
}

function number(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error('Media size exceeds safe integer range.');
  return result;
}

function mediaRecord(value: {
  id: string;
  familyId: string;
  type: 'IMAGE' | 'VIDEO' | 'AUDIO';
  objectKey: string;
  mimeType: string;
  checksum: string;
  sizeBytes: bigint;
  duration: number | null;
  uploadStatus: 'PENDING' | 'UPLOADING' | 'READY' | 'FAILED';
}): MediaAssetRecord {
  return { ...value, sizeBytes: number(value.sizeBytes) };
}

async function checkedMedia(
  transaction: Prisma.TransactionClient,
  familyId: string,
  requestedIds: readonly string[],
): Promise<readonly MediaAssetRecord[]> {
  const assets = await transaction.mediaAsset.findMany({
    where: { id: { in: [...requestedIds] }, familyId, uploadStatus: 'READY', deletedAt: null },
  });
  const byId = new Map(assets.map((asset) => [asset.id, mediaRecord(asset)]));
  const ordered = requestedIds
    .map((id) => byId.get(id))
    .filter((asset): asset is MediaAssetRecord => Boolean(asset));
  if (ordered.length !== requestedIds.length)
    throw new Error('Media ownership or readiness changed.');
  return ordered;
}

function mediaCreates(familyId: string, ids: readonly string[]) {
  return ids.map((mediaAssetId, sortOrder) => ({ familyId, mediaAssetId, sortOrder }));
}

export class PrismaCheckInRepository implements CheckInRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly points: PointsTransactionWriter = new PrismaPointsTransactionWriter(prisma),
  ) {}

  async findSoloAssignment(familyId: string, childId: string, assignmentId: string) {
    const assignment = await this.prisma.taskAssignment.findFirst({
      where: { id: assignmentId, familyId, childId, deletedAt: null },
      include: { task: true, family: { select: { settings: true } } },
    });
    if (!assignment || assignment.task.deletedAt !== null) return null;
    return {
      assignmentId: assignment.id,
      familyId,
      childId,
      taskId: assignment.taskId,
      taskStatus: assignment.task.status,
      collaborationMode: assignment.task.collaborationMode,
      checkType: assignment.customCheckType ?? assignment.task.checkType,
      verifyMode: assignment.customVerifyMode ?? assignment.task.verifyMode,
      rewardPoints: assignment.customPoints ?? assignment.task.basePoints,
      frequency: (assignment.customFrequency ??
        assignment.task.frequency) as unknown as TaskFrequency,
      startDate: date(assignment.startDate),
      endDate: assignment.endDate ? date(assignment.endDate) : null,
      settings: normalizeFamilySettings(assignment.family.settings as Record<string, unknown>),
    };
  }

  async findReadyMedia(familyId: string, requestedIds: readonly string[]) {
    if (requestedIds.length === 0) return [];
    const assets = await this.prisma.mediaAsset.findMany({
      where: { id: { in: [...requestedIds] }, familyId, uploadStatus: 'READY', deletedAt: null },
    });
    const byId = new Map(assets.map((asset) => [asset.id, mediaRecord(asset)]));
    return requestedIds
      .map((id) => byId.get(id))
      .filter((asset): asset is MediaAssetRecord => Boolean(asset));
  }

  async findCheckInByIdempotencyKey(familyId: string, idempotencyKey: string) {
    const attempt = await this.prisma.checkInSubmissionAttempt.findUnique({
      where: { familyId_idempotencyKey: { familyId, idempotencyKey } },
      select: { checkInId: true },
    });
    if (!attempt) return null;
    const value = await this.prisma.checkIn.findFirst({
      where: { id: attempt.checkInId, familyId, deletedAt: null },
      include: checkInInclude,
    });
    return value ? checkInRecord(value) : null;
  }

  async findCheckIn(familyId: string, childId: string, checkInId: string) {
    const value = await this.prisma.checkIn.findFirst({
      where: { id: checkInId, familyId, childId, deletedAt: null },
      include: checkInInclude,
    });
    return value ? checkInRecord(value) : null;
  }

  submitSolo(input: Parameters<CheckInRepository['submitSolo']>[0]) {
    return this.points.run(async (transaction, points) => {
      const duplicate = await transaction.checkInSubmissionAttempt.findUnique({
        where: {
          familyId_idempotencyKey: {
            familyId: input.context.familyId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        select: { checkInId: true },
      });
      if (duplicate) {
        const value = await transaction.checkIn.findUniqueOrThrow({
          where: { id: duplicate.checkInId },
          include: checkInInclude,
        });
        return checkInRecord(value);
      }
      const media = await checkedMedia(transaction, input.context.familyId, input.mediaIds);
      validateSubmissionContent(input.context.checkType, input.text, media);
      const current = await transaction.checkIn.findFirst({
        where: {
          familyId: input.context.familyId,
          taskAssignmentId: input.context.assignmentId,
          checkDate: new Date(`${input.checkDate}T00:00:00.000Z`),
          deletedAt: null,
        },
        include: { attempts: { select: { id: true } } },
      });
      if (current && current.status !== 'REJECTED')
        throw new Error('Current check-in is final or pending.');
      if (!current) {
        const created = await transaction.checkIn.create({
          data: {
            familyId: input.context.familyId,
            taskId: input.context.taskId,
            taskAssignmentId: input.context.assignmentId,
            childId: input.context.childId,
            idempotencyKey: input.idempotencyKey,
            contentText: input.text ?? null,
            isMakeup: input.isMakeup,
            status: input.status,
            checkDate: new Date(`${input.checkDate}T00:00:00.000Z`),
            media: { create: mediaCreates(input.context.familyId, input.mediaIds) },
            attempts: {
              create: {
                familyId: input.context.familyId,
                attemptNumber: 1,
                idempotencyKey: input.idempotencyKey,
                contentText: input.text ?? null,
                status: input.status,
                submittedAt: input.submittedAt,
                mediaIds: [...input.mediaIds],
              },
            },
          },
          include: checkInInclude,
        });
        await this.awardApprovedCheckIn(points, input, created.id, created.status);
        return checkInRecord(created);
      }
      await transaction.checkInMedia.deleteMany({ where: { checkInId: current.id } });
      const updated = await transaction.checkIn.update({
        where: { id: current.id },
        data: {
          idempotencyKey: input.idempotencyKey,
          contentText: input.text ?? null,
          isMakeup: input.isMakeup,
          status: input.status,
          reviewerId: null,
          reviewedAt: null,
          reviewComment: null,
          media: { create: mediaCreates(input.context.familyId, input.mediaIds) },
          attempts: {
            create: {
              familyId: input.context.familyId,
              attemptNumber: current.attempts.length + 1,
              idempotencyKey: input.idempotencyKey,
              contentText: input.text ?? null,
              status: input.status,
              submittedAt: input.submittedAt,
              mediaIds: [...input.mediaIds],
              priorStatus: current.status,
              priorReviewerId: current.reviewerId,
              priorReviewedAt: current.reviewedAt,
              priorReviewComment: current.reviewComment,
            },
          },
        },
        include: checkInInclude,
      });
      await this.awardApprovedCheckIn(points, input, updated.id, updated.status);
      return checkInRecord(updated);
    });
  }

  private async awardApprovedCheckIn(
    points: PointsAwardPort,
    input: Parameters<CheckInRepository['submitSolo']>[0],
    checkInId: string,
    status: CheckInWithHistory['status'],
  ): Promise<void> {
    if (status !== 'APPROVED') return;
    await points.earnCheckIn({
      familyId: input.context.familyId,
      userId: input.context.childId,
      checkInId,
      basePoints: input.context.rewardPoints,
      awardDate: input.checkDate,
      actorId: input.context.childId,
      occurredAt: input.submittedAt,
    });
  }

  async findRound(
    familyId: string,
    childId: string,
    roundId: string,
  ): Promise<CollaborationRoundContext | null> {
    const round = await this.prisma.collaborationRound.findFirst({
      where: {
        id: roundId,
        familyId,
        task: { familyId, deletedAt: null },
      },
      include: {
        participants: { where: { child: { familyId, role: 'CHILD', deletedAt: null } } },
        submissions: {
          where: { child: { familyId, role: 'CHILD', deletedAt: null } },
          select: { childId: true, status: true },
        },
        task: { include: { assignments: { where: { childId, deletedAt: null } } } },
      },
    });
    if (!round || round.task.collaborationMode !== 'COLLAB') return null;
    const assignment = round.task.assignments[0];
    const statuses = new Map(
      round.submissions.map((submission) => [submission.childId, submission.status]),
    );
    return {
      id: round.id,
      familyId,
      status: round.status,
      startDate: date(round.startDate),
      endDate: date(round.endDate),
      checkType: assignment?.customCheckType ?? round.task.checkType,
      verifyMode: assignment?.customVerifyMode ?? round.task.verifyMode,
      childIsActiveParticipant: round.participants.some(
        (participant) => participant.childId === childId && participant.status === 'ACTIVE',
      ),
      participants: round.participants.map((participant) => ({
        childId: participant.childId,
        active: participant.status === 'ACTIVE',
        submissionStatus: statuses.get(participant.childId) ?? null,
      })),
    };
  }

  async findCollaborationByIdempotencyKey(familyId: string, idempotencyKey: string) {
    const attempt = await this.prisma.collaborationSubmissionAttempt.findUnique({
      where: { familyId_idempotencyKey: { familyId, idempotencyKey } },
      select: { submissionId: true },
    });
    if (!attempt) return null;
    const value = await this.prisma.collaborationSubmission.findFirst({
      where: { id: attempt.submissionId, familyId },
      include: collaborationInclude,
    });
    return value ? collaborationRecord(value) : null;
  }

  submitCollaboration(input: Parameters<CheckInRepository['submitCollaboration']>[0]) {
    return this.points.run(async (transaction, points) => {
      const duplicate = await transaction.collaborationSubmissionAttempt.findUnique({
        where: {
          familyId_idempotencyKey: {
            familyId: input.context.familyId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        select: { submissionId: true },
      });
      if (duplicate) {
        return collaborationRecord(
          await transaction.collaborationSubmission.findUniqueOrThrow({
            where: { id: duplicate.submissionId },
            include: collaborationInclude,
          }),
        );
      }
      const media = await checkedMedia(transaction, input.context.familyId, input.mediaIds);
      validateSubmissionContent(input.context.checkType, input.text, media);
      const current = await transaction.collaborationSubmission.findUnique({
        where: { roundId_childId: { roundId: input.context.id, childId: input.childId } },
        include: { attempts: { select: { id: true } } },
      });
      if (current && current.status !== 'REJECTED')
        throw new Error('Current submission is final or pending.');
      let submissionId: string;
      if (!current) {
        const created = await transaction.collaborationSubmission.create({
          data: {
            familyId: input.context.familyId,
            roundId: input.context.id,
            childId: input.childId,
            idempotencyKey: input.idempotencyKey,
            contentText: input.text ?? null,
            status: input.status,
            submittedAt: input.submittedAt,
            media: { create: mediaCreates(input.context.familyId, input.mediaIds) },
            attempts: {
              create: {
                familyId: input.context.familyId,
                attemptNumber: 1,
                idempotencyKey: input.idempotencyKey,
                contentText: input.text ?? null,
                status: input.status,
                submittedAt: input.submittedAt,
                mediaIds: [...input.mediaIds],
              },
            },
          },
          select: { id: true },
        });
        submissionId = created.id;
      } else {
        await transaction.collaborationSubmissionMedia.deleteMany({
          where: { submissionId: current.id },
        });
        await transaction.collaborationSubmission.update({
          where: { id: current.id },
          data: {
            idempotencyKey: input.idempotencyKey,
            contentText: input.text ?? null,
            status: input.status,
            submittedAt: input.submittedAt,
            reviewedById: null,
            reviewedAt: null,
            reviewComment: null,
            media: { create: mediaCreates(input.context.familyId, input.mediaIds) },
            attempts: {
              create: {
                familyId: input.context.familyId,
                attemptNumber: current.attempts.length + 1,
                idempotencyKey: input.idempotencyKey,
                contentText: input.text ?? null,
                status: input.status,
                submittedAt: input.submittedAt,
                mediaIds: [...input.mediaIds],
                priorStatus: current.status,
                priorReviewedById: current.reviewedById,
                priorReviewedAt: current.reviewedAt,
                priorReviewComment: current.reviewComment,
              },
            },
          },
        });
        submissionId = current.id;
      }
      const participants = await transaction.collaborationRoundParticipant.findMany({
        where: { roundId: input.context.id, status: 'ACTIVE' },
        select: { childId: true },
      });
      const submissions = await transaction.collaborationSubmission.findMany({
        where: {
          roundId: input.context.id,
          childId: { in: participants.map(({ childId }) => childId) },
        },
        select: { childId: true, status: true },
      });
      const allSubmitted = participants.every((participant) =>
        submissions.some((submission) => submission.childId === participant.childId),
      );
      if (allSubmitted) {
        await transaction.collaborationRound.updateMany({
          where: { id: input.context.id, familyId: input.context.familyId, status: 'PENDING' },
          data: { status: 'ACTIVE' },
        });
      }
      await points.completeCollaborationRound({
        familyId: input.context.familyId,
        roundId: input.context.id,
        actorId: input.childId,
        occurredAt: input.submittedAt,
      });
      return collaborationRecord(
        await transaction.collaborationSubmission.findUniqueOrThrow({
          where: { id: submissionId },
          include: collaborationInclude,
        }),
      );
    });
  }

  async listCollaborationSubmissions(familyId: string, _childId: string, roundId: string) {
    const values = await this.prisma.collaborationSubmission.findMany({
      where: { familyId, roundId },
      include: collaborationInclude,
      orderBy: { submittedAt: 'asc' },
    });
    return values.map(collaborationRecord);
  }
}
