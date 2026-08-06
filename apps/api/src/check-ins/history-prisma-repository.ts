import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

import type {
  HistoryCursor,
  HistoryItem,
  HistoryMedia,
  HistoryRepository,
  HistorySubmissionType,
} from './history-types.js';

const reviewSelect = {
  id: true,
  decision: true,
  source: true,
  reason: true,
  reviewerId: true,
  reviewedAt: true,
} satisfies Prisma.SubmissionReviewSelect;

const soloSelect = {
  id: true,
  attemptNumber: true,
  contentText: true,
  status: true,
  submittedAt: true,
  mediaIds: true,
  review: { select: reviewSelect },
  checkIn: {
    select: {
      id: true,
      checkDate: true,
      pointsEarned: true,
      child: { select: { id: true, nickname: true } },
      task: { select: { id: true, name: true } },
      attempts: { orderBy: { attemptNumber: 'desc' as const }, take: 1, select: { id: true } },
    },
  },
} satisfies Prisma.CheckInSubmissionAttemptSelect;

const collaborationSelect = {
  id: true,
  attemptNumber: true,
  contentText: true,
  status: true,
  submittedAt: true,
  mediaIds: true,
  review: { select: reviewSelect },
  submission: {
    select: {
      id: true,
      childId: true,
      child: { select: { id: true, nickname: true } },
      attempts: { orderBy: { attemptNumber: 'desc' as const }, take: 1, select: { id: true } },
      round: {
        select: {
          id: true,
          roundNumber: true,
          startDate: true,
          endDate: true,
          task: { select: { id: true, name: true } },
          participants: { select: { childId: true, pointsEarned: true } },
        },
      },
    },
  },
} satisfies Prisma.CollaborationSubmissionAttemptSelect;

type SoloValue = Prisma.CheckInSubmissionAttemptGetPayload<{ select: typeof soloSelect }>;
type CollaborationValue = Prisma.CollaborationSubmissionAttemptGetPayload<{
  select: typeof collaborationSelect;
}>;

function jsonMediaIds(value: Prisma.JsonValue): readonly string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

function cursorFilter(source: HistorySubmissionType, cursor: HistoryCursor | null) {
  if (!cursor) return {};
  const sameTime =
    source === cursor.submissionType
      ? { submittedAt: cursor.submittedAt, id: { lt: cursor.attemptId } }
      : source === 'COLLABORATION' && cursor.submissionType === 'SOLO'
        ? { submittedAt: cursor.submittedAt }
        : null;
  return {
    OR: [{ submittedAt: { lt: cursor.submittedAt } }, ...(sameTime === null ? [] : [sameTime])],
  };
}

function review(value: SoloValue['review'] | CollaborationValue['review']) {
  return value
    ? {
        id: value.id,
        decision: value.decision,
        source: value.source,
        reason: value.reason,
        reviewerId: value.reviewerId,
        reviewedAt: value.reviewedAt,
      }
    : null;
}

function compare(left: HistoryItem, right: HistoryItem): number {
  return (
    right.submittedAt.getTime() - left.submittedAt.getTime() ||
    (left.submissionType === right.submissionType ? 0 : left.submissionType === 'SOLO' ? -1 : 1) ||
    (left.attemptId === right.attemptId ? 0 : left.attemptId > right.attemptId ? -1 : 1)
  );
}

function mediaFor(ids: Prisma.JsonValue, media: ReadonlyMap<string, HistoryMedia>) {
  return jsonMediaIds(ids).flatMap((id) => {
    const item = media.get(id);
    return item ? [item] : [];
  });
}

export class PrismaHistoryRepository implements HistoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findFamilySettings(familyId: string) {
    const family = await this.prisma.family.findFirst({
      where: { id: familyId, deletedAt: null },
      select: { settings: true },
    });
    const settings = family?.settings;
    return settings && typeof settings === 'object' && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : family
        ? {}
        : null;
  }

  async findHistory(input: Parameters<HistoryRepository['findHistory']>[0]) {
    const common = { familyId: input.familyId };
    const businessDateFilter =
      input.filters.startDate === undefined || input.filters.endDateExclusive === undefined
        ? null
        : { gte: input.filters.startDate, lt: input.filters.endDateExclusive };
    const soloPromise: Promise<SoloValue[]> =
      input.filters.submissionType === 'COLLABORATION'
        ? Promise.resolve([] as SoloValue[])
        : this.prisma.checkInSubmissionAttempt.findMany({
            where: {
              ...common,
              ...cursorFilter('SOLO', input.cursor),
              checkIn: {
                ...(input.filters.childId === undefined ? {} : { childId: input.filters.childId }),
                ...(input.filters.taskId === undefined ? {} : { taskId: input.filters.taskId }),
                ...(businessDateFilter === null ? {} : { checkDate: businessDateFilter }),
              },
            },
            orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
            take: input.limit + 1,
            select: soloSelect,
          });
    const collaborationPromise: Promise<CollaborationValue[]> =
      input.filters.submissionType === 'SOLO'
        ? Promise.resolve([] as CollaborationValue[])
        : this.prisma.collaborationSubmissionAttempt.findMany({
            where: {
              ...common,
              ...cursorFilter('COLLABORATION', input.cursor),
              submission: {
                ...(input.filters.childId === undefined ? {} : { childId: input.filters.childId }),
                ...(input.filters.taskId === undefined && businessDateFilter === null
                  ? {}
                  : {
                      round: {
                        ...(input.filters.taskId === undefined
                          ? {}
                          : { taskId: input.filters.taskId }),
                        ...(businessDateFilter === null ? {} : { endDate: businessDateFilter }),
                      },
                    }),
              },
            },
            orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
            take: input.limit + 1,
            select: collaborationSelect,
          });
    const [solo, collaboration] = await Promise.all([soloPromise, collaborationPromise]);
    const mediaIds = [...solo, ...collaboration].flatMap((item) => jsonMediaIds(item.mediaIds));
    const assets =
      mediaIds.length === 0
        ? []
        : await this.prisma.mediaAsset.findMany({
            where: {
              id: { in: [...new Set(mediaIds)] },
              familyId: input.familyId,
              uploadStatus: 'READY',
              deletedAt: null,
            },
            select: {
              id: true,
              type: true,
              mimeType: true,
              sizeBytes: true,
              width: true,
              height: true,
              duration: true,
              createdAt: true,
            },
          });
    const media = new Map<string, HistoryMedia>(
      assets.map((asset) => [asset.id, { ...asset, sizeBytes: Number(asset.sizeBytes) }]),
    );
    const items: HistoryItem[] = [
      ...solo.map((attempt) => ({
        attemptId: attempt.id,
        submissionId: attempt.checkIn.id,
        submissionType: 'SOLO' as const,
        attemptNumber: attempt.attemptNumber,
        child: attempt.checkIn.child,
        task: attempt.checkIn.task,
        contentText: attempt.contentText,
        status: attempt.review?.decision ?? attempt.status,
        submittedAt: attempt.submittedAt,
        checkDate: attempt.checkIn.checkDate,
        collaborationRound: null,
        review: review(attempt.review),
        pointsEarned:
          attempt.checkIn.attempts[0]?.id === attempt.id ? attempt.checkIn.pointsEarned : null,
        media: mediaFor(attempt.mediaIds, media),
      })),
      ...collaboration.map((attempt) => {
        const submission = attempt.submission;
        return {
          attemptId: attempt.id,
          submissionId: submission.id,
          submissionType: 'COLLABORATION' as const,
          attemptNumber: attempt.attemptNumber,
          child: submission.child,
          task: submission.round.task,
          contentText: attempt.contentText,
          status: attempt.review?.decision ?? attempt.status,
          submittedAt: attempt.submittedAt,
          checkDate: submission.round.endDate,
          collaborationRound: {
            id: submission.round.id,
            roundNumber: submission.round.roundNumber,
            startDate: submission.round.startDate,
            endDate: submission.round.endDate,
          },
          review: review(attempt.review),
          pointsEarned:
            submission.attempts[0]?.id === attempt.id
              ? (submission.round.participants.find(({ childId }) => childId === submission.childId)
                  ?.pointsEarned ?? null)
              : null,
          media: mediaFor(attempt.mediaIds, media),
        };
      }),
    ];
    return items.sort(compare).slice(0, input.limit + 1);
  }
}
