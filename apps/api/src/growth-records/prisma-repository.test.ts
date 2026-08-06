import type { GrowthRecord, PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { PrismaGrowthRecordRepository } from './prisma-repository.js';
import { GrowthRecordAccessError } from './service.js';

const now = new Date('2026-08-06T08:00:00.000Z');

function value(overrides: Partial<GrowthRecord> = {}) {
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
