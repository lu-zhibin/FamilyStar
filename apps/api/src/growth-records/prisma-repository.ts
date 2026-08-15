import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

import { GrowthRecordAccessError } from './service.js';
import type {
  GrowthRecordItem,
  GrowthRecordRepository,
  ManualGrowthRecordInput,
  ManualGrowthRecordPatch,
} from './types.js';

const recordSelect = {
  id: true,
  familyId: true,
  type: true,
  title: true,
  contentText: true,
  occurredOn: true,
  sourceType: true,
  sourceId: true,
  pointsEarned: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  child: { select: { id: true, nickname: true } },
  task: { select: { id: true, name: true } },
  media: {
    orderBy: { sortOrder: 'asc' as const },
    select: {
      mediaAsset: {
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
      },
    },
  },
} satisfies Prisma.GrowthRecordSelect;

type GrowthRecordValue = Prisma.GrowthRecordGetPayload<{ select: typeof recordSelect }>;

function record(value: GrowthRecordValue): GrowthRecordItem {
  return {
    ...value,
    task: value.task && value.sourceType ? { id: value.task.id, name: value.title } : value.task,
    media: value.media.map(({ mediaAsset }) => ({
      ...mediaAsset,
      sizeBytes: Number(mediaAsset.sizeBytes),
    })),
  };
}

export class PrismaGrowthRecordRepository implements GrowthRecordRepository {
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

  async findMany(input: Parameters<GrowthRecordRepository['findMany']>[0]) {
    const dateFilter =
      input.filters.startDate === undefined || input.filters.endDateExclusive === undefined
        ? undefined
        : { gte: input.filters.startDate, lt: input.filters.endDateExclusive };
    const values = await this.prisma.growthRecord.findMany({
      where: {
        familyId: input.familyId,
        deletedAt: null,
        ...(input.filters.childId === undefined ? {} : { childId: input.filters.childId }),
        ...(input.filters.taskId === undefined ? {} : { taskId: input.filters.taskId }),
        ...(input.filters.type === undefined ? {} : { type: input.filters.type }),
        ...(dateFilter === undefined ? {} : { occurredOn: dateFilter }),
        ...(input.cursor === null
          ? {}
          : {
              OR: [
                { occurredOn: { lt: input.cursor.occurredOn } },
                { occurredOn: input.cursor.occurredOn, id: { lt: input.cursor.id } },
              ],
            }),
      },
      orderBy: [{ occurredOn: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      select: recordSelect,
    });
    return values.map(record);
  }

  createManual(input: {
    familyId: string;
    parentId: string;
    record: ManualGrowthRecordInput;
  }): Promise<GrowthRecordItem> {
    return this.prisma.$transaction(async (transaction) => {
      await this.validateReferences(transaction, input.familyId, input.parentId, input.record, {
        child: true,
        task: true,
        media: true,
      });
      return record(
        await transaction.growthRecord.create({
          data: {
            familyId: input.familyId,
            childId: input.record.childId,
            taskId: input.record.taskId ?? null,
            type: input.record.type,
            title: input.record.title,
            contentText: input.record.contentText ?? null,
            occurredOn: input.record.occurredOn,
            createdById: input.parentId,
            media: {
              create: input.record.mediaIds.map((mediaAssetId, sortOrder) => ({
                familyId: input.familyId,
                mediaAssetId,
                sortOrder,
              })),
            },
          },
          select: recordSelect,
        }),
      );
    });
  }

  updateManual(input: {
    familyId: string;
    recordId: string;
    record: ManualGrowthRecordPatch;
  }): Promise<GrowthRecordItem | null> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.growthRecord.findFirst({
        where: {
          id: input.recordId,
          familyId: input.familyId,
          type: { in: ['NOTE', 'MILESTONE'] },
          sourceType: null,
          sourceId: null,
          deletedAt: null,
        },
        select: { id: true, childId: true, taskId: true },
      });
      if (!current) return null;
      await this.validateReferences(
        transaction,
        input.familyId,
        null,
        {
          childId: input.record.childId ?? current.childId,
          taskId: input.record.taskId === undefined ? current.taskId : input.record.taskId,
          mediaIds: input.record.mediaIds ?? [],
        },
        {
          child: input.record.childId !== undefined,
          task: input.record.taskId !== undefined,
          media: input.record.mediaIds !== undefined,
        },
      );
      if (input.record.mediaIds !== undefined) {
        await transaction.growthRecordMedia.deleteMany({
          where: { familyId: input.familyId, growthRecordId: current.id },
        });
        if (input.record.mediaIds.length > 0) {
          await transaction.growthRecordMedia.createMany({
            data: input.record.mediaIds.map((mediaAssetId, sortOrder) => ({
              familyId: input.familyId,
              growthRecordId: current.id,
              mediaAssetId,
              sortOrder,
            })),
          });
        }
      }
      return record(
        await transaction.growthRecord.update({
          where: { id: current.id },
          data: {
            ...(input.record.childId === undefined ? {} : { childId: input.record.childId }),
            ...(input.record.taskId === undefined ? {} : { taskId: input.record.taskId }),
            ...(input.record.type === undefined ? {} : { type: input.record.type }),
            ...(input.record.title === undefined ? {} : { title: input.record.title }),
            ...(input.record.contentText === undefined
              ? {}
              : { contentText: input.record.contentText }),
            ...(input.record.occurredOn === undefined
              ? {}
              : { occurredOn: input.record.occurredOn }),
          },
          select: recordSelect,
        }),
      );
    });
  }

  async softDeleteManual(familyId: string, recordId: string, now: Date): Promise<boolean> {
    const result = await this.prisma.growthRecord.updateMany({
      where: {
        id: recordId,
        familyId,
        type: { in: ['NOTE', 'MILESTONE'] },
        sourceType: null,
        sourceId: null,
        deletedAt: null,
      },
      data: { deletedAt: now },
    });
    return result.count === 1;
  }

  private async validateReferences(
    transaction: Prisma.TransactionClient,
    familyId: string,
    parentId: string | null,
    input: Pick<ManualGrowthRecordInput, 'childId' | 'taskId' | 'mediaIds'>,
    validate: Readonly<{ child: boolean; task: boolean; media: boolean }>,
  ): Promise<void> {
    const [parent, child, task, media] = await Promise.all([
      parentId
        ? transaction.user.findFirst({
            where: { id: parentId, familyId, role: 'PARENT', deletedAt: null },
            select: { id: true },
          })
        : Promise.resolve({ id: 'existing-parent' }),
      validate.child
        ? transaction.user.findFirst({
            where: { id: input.childId, familyId, role: 'CHILD', deletedAt: null },
            select: { id: true },
          })
        : Promise.resolve({ id: 'unchanged-child' }),
      validate.task && input.taskId
        ? transaction.task.findFirst({
            where: { id: input.taskId, familyId, deletedAt: null },
            select: { id: true },
          })
        : Promise.resolve({ id: 'no-task' }),
      validate.media && input.mediaIds.length > 0
        ? transaction.mediaAsset.findMany({
            where: {
              id: { in: [...input.mediaIds] },
              familyId,
              uploadStatus: 'READY',
              deletedAt: null,
            },
            select: { id: true },
          })
        : Promise.resolve(input.mediaIds.map((id) => ({ id }))),
    ]);
    if (!parent) throw new GrowthRecordAccessError('FORBIDDEN', 'The parent was not found.');
    if (!child) throw new GrowthRecordAccessError('NOT_FOUND', 'The child was not found.');
    if (!task) throw new GrowthRecordAccessError('NOT_FOUND', 'The task was not found.');
    if (media.length !== input.mediaIds.length) {
      throw new GrowthRecordAccessError('NOT_FOUND', 'A READY media asset was not found.');
    }
  }
}
