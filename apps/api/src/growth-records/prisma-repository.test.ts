import type { GrowthRecord, PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { PrismaGrowthRecordRepository } from './prisma-repository.js';
import { GrowthRecordAccessError } from './service.js';

const now = new Date('2026-08-06T08:00:00.000Z');

type GrowthRecordValue = GrowthRecord & {
  child: { id: string; nickname: string };
  task: { id: string; name: string } | null;
  media: readonly unknown[];
};

function value(overrides: Partial<GrowthRecordValue> = {}): GrowthRecordValue {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    familyId: 'family-a',
    childId: 'child-a',
    taskId: null,
    type: 'NOTE' as const,
    title: '阅读笔记',
    contentText: null,
    occurredOn: new Date('2026-08-06T00:00:00.000Z'),
    sourceType: null,
    sourceId: null,
    pointsEarned: null,
    createdById: 'parent-a',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    child: { id: 'child-a', nickname: '星星' },
    task: null,
    media: [],
    ...overrides,
  };
}

function prismaWithTransaction(transaction: object): PrismaClient {
  return {
    $transaction: vi.fn(async (work: (client: typeof transaction) => Promise<unknown>) =>
      work(transaction),
    ),
  } as unknown as PrismaClient;
}

describe('PrismaGrowthRecordRepository', () => {
  it('property: builds a strict stable keyset boundary for every generated cursor', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new PrismaGrowthRecordRepository({
      growthRecord: { findMany },
    } as unknown as PrismaClient);

    for (let index = 0; index < 64; index += 1) {
      const occurredOn = new Date(Date.UTC(2026, 7, (index % 28) + 1));
      const id = `record-${String(index).padStart(3, '0')}`;
      await repository.findMany({
        familyId: `family-${index}`,
        filters: {},
        cursor: { occurredOn, id },
        limit: (index % 50) + 1,
      });

      expect(findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: {
            familyId: `family-${index}`,
            deletedAt: null,
            OR: [{ occurredOn: { lt: occurredOn } }, { occurredOn, id: { lt: id } }],
          },
          orderBy: [{ occurredOn: 'desc' }, { id: 'desc' }],
          take: (index % 50) + 2,
        }),
      );
    }
  });

  it('keeps automatic task names on their immutable approval snapshot', async () => {
    const findMany = vi.fn().mockResolvedValue([
      value({
        type: 'CHECK_IN',
        title: '审批时的任务名称',
        sourceType: 'CHECK_IN',
        sourceId: 'source-a',
        taskId: 'task-a',
        task: { id: 'task-a', name: '后来修改的任务名称' },
      }),
      value({ taskId: 'task-a', task: { id: 'task-a', name: '当前任务名称' } }),
    ]);
    const repository = new PrismaGrowthRecordRepository({
      growthRecord: { findMany },
    } as unknown as PrismaClient);

    const records = await repository.findMany({
      familyId: 'family-a',
      filters: {},
      cursor: null,
      limit: 20,
    });

    expect(records[0]?.task).toEqual({ id: 'task-a', name: '审批时的任务名称' });
    expect(records[1]?.task).toEqual({ id: 'task-a', name: '当前任务名称' });
  });

  it('creates an ordered manual record after validating family references and READY media', async () => {
    const create = vi.fn().mockResolvedValue(value());
    const transaction = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'active-user' }) },
      task: { findFirst: vi.fn() },
      mediaAsset: {
        findMany: vi.fn().mockResolvedValue([{ id: 'media-a' }, { id: 'media-b' }]),
      },
      growthRecord: { create },
    };
    const repository = new PrismaGrowthRecordRepository(prismaWithTransaction(transaction));

    await repository.createManual({
      familyId: 'family-a',
      parentId: 'parent-a',
      record: {
        childId: 'child-a',
        type: 'NOTE',
        title: '阅读笔记',
        occurredOn: new Date('2026-08-06T00:00:00.000Z'),
        mediaIds: ['media-a', 'media-b'],
      },
    });

    expect(transaction.mediaAsset.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['media-a', 'media-b'] },
        familyId: 'family-a',
        uploadStatus: 'READY',
        deletedAt: null,
      },
      select: { id: true },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          familyId: 'family-a',
          media: {
            create: [
              { familyId: 'family-a', mediaAssetId: 'media-a', sortOrder: 0 },
              { familyId: 'family-a', mediaAssetId: 'media-b', sortOrder: 1 },
            ],
          },
        }),
      }),
    );
  });

  it('rejects media that is absent from the family READY set', async () => {
    const transaction = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'active-user' }) },
      task: { findFirst: vi.fn() },
      mediaAsset: { findMany: vi.fn().mockResolvedValue([]) },
      growthRecord: { create: vi.fn() },
    };
    const repository = new PrismaGrowthRecordRepository(prismaWithTransaction(transaction));
    await expect(
      repository.createManual({
        familyId: 'family-a',
        parentId: 'parent-a',
        record: {
          childId: 'child-a',
          type: 'NOTE',
          title: '阅读笔记',
          occurredOn: new Date('2026-08-06T00:00:00.000Z'),
          mediaIds: ['media-a'],
        },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' } satisfies Partial<GrowthRecordAccessError>);
    expect(transaction.growthRecord.create).not.toHaveBeenCalled();
  });

  it('property: rejects every generated cross-family child, task, and media reference', async () => {
    const missingReferences = ['child', 'task', 'media'] as const;
    for (const missing of missingReferences) {
      for (let index = 0; index < 12; index += 1) {
        const transaction = {
          user: {
            findFirst: vi
              .fn()
              .mockResolvedValueOnce({ id: `parent-${index}` })
              .mockResolvedValueOnce(missing === 'child' ? null : { id: `child-${index}` }),
          },
          task: {
            findFirst: vi
              .fn()
              .mockResolvedValue(missing === 'task' ? null : { id: `task-${index}` }),
          },
          mediaAsset: {
            findMany: vi
              .fn()
              .mockResolvedValue(missing === 'media' ? [] : [{ id: `media-${index}` }]),
          },
          growthRecord: { create: vi.fn() },
        };
        const repository = new PrismaGrowthRecordRepository(prismaWithTransaction(transaction));

        await expect(
          repository.createManual({
            familyId: `family-${index}`,
            parentId: `parent-${index}`,
            record: {
              childId: `child-${index}`,
              taskId: `task-${index}`,
              type: 'NOTE',
              title: `记录 ${index}`,
              occurredOn: now,
              mediaIds: [`media-${index}`],
            },
          }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' } satisfies Partial<GrowthRecordAccessError>);
        expect(transaction.task.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ familyId: `family-${index}` }),
          }),
        );
        expect(transaction.mediaAsset.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ familyId: `family-${index}` }),
          }),
        );
        expect(transaction.growthRecord.create).not.toHaveBeenCalled();
      }
    }
  });

  it('keeps automatic CHECK_IN records outside manual update and delete operations', async () => {
    const update = vi.fn();
    const transaction = {
      growthRecord: { findFirst: vi.fn().mockResolvedValue(null), update },
    };
    const repository = new PrismaGrowthRecordRepository(prismaWithTransaction(transaction));
    await expect(
      repository.updateManual({
        familyId: 'family-a',
        recordId: 'record-a',
        record: { title: '更新' },
      }),
    ).resolves.toBeNull();
    expect(transaction.growthRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: { in: ['NOTE', 'MILESTONE'] },
          sourceType: null,
          sourceId: null,
        }),
      }),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('updates note text without revalidating unchanged historical references', async () => {
    const update = vi.fn().mockResolvedValue(value({ title: '更新后的笔记' }));
    const transaction = {
      growthRecord: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'record-a', childId: 'child-a', taskId: 'task-a' }),
        update,
      },
    };
    const repository = new PrismaGrowthRecordRepository(prismaWithTransaction(transaction));

    await expect(
      repository.updateManual({
        familyId: 'family-a',
        recordId: 'record-a',
        record: { title: '更新后的笔记' },
      }),
    ).resolves.toMatchObject({ title: '更新后的笔记' });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { title: '更新后的笔记' } }),
    );
  });
});
