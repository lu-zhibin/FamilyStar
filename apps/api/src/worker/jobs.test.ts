import { describe, expect, it, vi } from 'vitest';

import { createWorkerJobs, MediaCleanupError, PrismaWorkerJobsRepository } from './jobs.js';
import type { WorkerJobsRepository } from './jobs.js';

const NOW = new Date('2026-07-31T14:23:45.000Z');

function fixture() {
  const repository: WorkerJobsRepository = {
    listActiveFamilyIds: vi.fn().mockResolvedValue(['family-1', 'family-2']),
    listExpiredMediaUploads: vi.fn().mockResolvedValue([
      {
        sessionId: 'upload-1',
        familyId: 'family-1',
        objectKey: 'family-1/orphan',
        uploadId: 'cos-1',
      },
    ]),
    markMediaUploadCleaned: vi.fn().mockResolvedValue(undefined),
    reconcilePoints: vi.fn().mockResolvedValue({
      scanned: 2,
      discrepancies: [
        {
          familyId: 'family-1',
          userId: 'child-1',
          storedBalance: 8,
          calculatedBalance: 10,
          storedEarnedTotal: 8,
          calculatedEarnedTotal: 10,
        },
      ],
    }),
    deleteExpiredNotifications: vi.fn().mockResolvedValue(8),
  };
  const collaborationScheduler = {
    generate: vi
      .fn()
      .mockResolvedValueOnce([{ id: 'round-1' }])
      .mockResolvedValueOnce([]),
  };
  const reviewTimeout = {
    runBatch: vi.fn().mockResolvedValue({ scanned: 3, approved: 1, skipped: 2 }),
  };
  const outbox = {
    dispatchBatch: vi.fn().mockResolvedValue({ claimed: 2, published: 2, failed: 0 }),
  };
  const cos = {
    initializeMultipart: vi.fn(),
    authorizePart: vi.fn(),
    completeMultipart: vi.fn(),
    abortMultipart: vi.fn().mockResolvedValue(undefined),
    deleteObject: vi.fn().mockResolvedValue(undefined),
    inspectObject: vi.fn(),
    createReadUrl: vi.fn(),
  };
  const connections = {
    get: vi.fn().mockResolvedValue({
      bucket: 'bucket',
      region: 'region',
      secretId: 'id',
      secretKey: 'key',
    }),
  };
  const jobs = createWorkerJobs({
    repository,
    collaborationScheduler: collaborationScheduler as never,
    reviewTimeout,
    outbox,
    cos,
    connections,
    batchSize: 100,
    mediaCleanupAgeHours: 24,
  });
  return { jobs, repository, collaborationScheduler, reviewTimeout, outbox, cos, connections };
}

describe('createWorkerJobs', () => {
  it('registers all six jobs with stable time buckets', () => {
    const { jobs } = fixture();

    expect(jobs.map(({ name }) => name)).toEqual([
      'task-cycle',
      'review-timeout',
      'outbox-dispatch',
      'media-cleanup',
      'points-reconciliation',
      'notification-cleanup',
    ]);
    expect(jobs.map((job) => job.runKey(NOW))).toEqual([
      '2026-07-31',
      String(Math.floor(NOW.getTime() / 60_000)),
      String(Math.floor(NOW.getTime() / 5_000)),
      String(Math.floor(NOW.getTime() / 3_600_000)),
      '2026-07-31',
      '2026-07-31',
    ]);
  });

  it('generates task cycles and runs review and Outbox batches', async () => {
    const { jobs, collaborationScheduler } = fixture();

    await expect(jobs[0]?.execute(NOW)).resolves.toEqual({ families: 2, rounds: 1 });
    await expect(jobs[1]?.execute(NOW)).resolves.toEqual({ scanned: 3, approved: 1, skipped: 2 });
    await expect(jobs[2]?.execute(NOW)).resolves.toEqual({ claimed: 2, published: 2, failed: 0 });
    expect(collaborationScheduler.generate).toHaveBeenNthCalledWith(1, {
      familyId: 'family-1',
      date: '2026-07-31',
    });
  });

  it('cleans an expired multipart upload and soft-deletes its asset', async () => {
    const { jobs, repository, cos } = fixture();

    await expect(jobs[3]?.execute(NOW)).resolves.toEqual({ scanned: 1, cleaned: 1 });
    expect(repository.listExpiredMediaUploads).toHaveBeenCalledWith(
      new Date('2026-07-30T14:23:45.000Z'),
      100,
    );
    expect(cos.abortMultipart).toHaveBeenCalledWith(expect.objectContaining({ uploadId: 'cos-1' }));
    expect(cos.deleteObject).toHaveBeenCalledWith(
      expect.objectContaining({ objectKey: 'family-1/orphan' }),
    );
    expect(repository.markMediaUploadCleaned).toHaveBeenCalledWith('upload-1', 'family-1', NOW);
  });

  it('fails the cleanup run so the generic runner can retry unresolved objects', async () => {
    const { jobs, cos, repository } = fixture();
    cos.abortMultipart.mockRejectedValueOnce(new Error('COS unavailable'));

    await expect(jobs[3]?.execute(NOW)).rejects.toBeInstanceOf(MediaCleanupError);
    expect(repository.markMediaUploadCleaned).not.toHaveBeenCalled();
  });

  it('reports points discrepancies without mutating balances', async () => {
    const { jobs, repository } = fixture();

    await expect(jobs[4]?.execute(NOW)).resolves.toMatchObject({
      scanned: 2,
      discrepancy_count: 1,
      discrepancies: [{ userId: 'child-1', calculatedBalance: 10 }],
    });
    expect(repository.reconcilePoints).toHaveBeenCalledWith(100);
  });

  it('deletes one bounded batch of notifications strictly older than ninety days', async () => {
    const { jobs, repository } = fixture();

    await expect(jobs[5]?.execute(NOW)).resolves.toEqual({
      deleted: 8,
      cutoff: '2026-05-02T14:23:45.000Z',
    });
    expect(repository.deleteExpiredNotifications).toHaveBeenCalledWith(
      new Date('2026-05-02T14:23:45.000Z'),
      100,
    );
  });
});

describe('PrismaWorkerJobsRepository', () => {
  it('lists active families and maps expired media cleanup candidates', async () => {
    const prisma = {
      family: {
        findMany: vi.fn().mockResolvedValue([{ id: 'family-1' }]),
      },
      mediaUploadSession: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'upload-1',
            familyId: 'family-1',
            uploadId: 'cos-1',
            mediaAsset: { objectKey: 'family-1/orphan' },
          },
        ]),
      },
    };
    const repository = new PrismaWorkerJobsRepository(prisma as never);
    const cutoff = new Date('2026-07-30T14:00:00.000Z');

    await expect(repository.listActiveFamilyIds()).resolves.toEqual(['family-1']);
    await expect(repository.listExpiredMediaUploads(cutoff, 25)).resolves.toEqual([
      {
        sessionId: 'upload-1',
        familyId: 'family-1',
        uploadId: 'cos-1',
        objectKey: 'family-1/orphan',
      },
    ]);
    expect(prisma.family.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    expect(prisma.mediaUploadSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 25,
        where: expect.objectContaining({ updatedAt: { lte: cutoff } }),
      }),
    );
  });

  it('marks an expired upload and its media asset as cleaned in one transaction', async () => {
    const transaction = {
      mediaUploadSession: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      mediaAsset: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      $transaction: vi.fn(async (work: (client: typeof transaction) => Promise<void>) =>
        work(transaction),
      ),
    };
    const repository = new PrismaWorkerJobsRepository(prisma as never);

    await repository.markMediaUploadCleaned('upload-1', 'family-1', NOW);

    expect(transaction.mediaUploadSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'FAILED', failureCode: 'WORKER_CLEANED' } }),
    );
    expect(transaction.mediaAsset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { uploadStatus: 'FAILED', deletedAt: NOW } }),
    );
  });

  it('selects and deletes a stable bounded notification batch with a strict cutoff', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([{ id: 'notification-1' }, { id: 'notification-2' }]);
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const transaction = { notification: { findMany, deleteMany } };
    const prisma = {
      $transaction: vi.fn(async (work: (client: typeof transaction) => Promise<number>) =>
        work(transaction),
      ),
    };
    const repository = new PrismaWorkerJobsRepository(prisma as never);
    const cutoff = new Date('2026-05-02T14:23:45.000Z');

    await expect(repository.deleteExpiredNotifications(cutoff, 25)).resolves.toBe(2);
    expect(findMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 25,
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['notification-1', 'notification-2'] }, createdAt: { lt: cutoff } },
    });
  });

  it('property: cleanup honors the strict ninety-day edge, batch cap, and repeated execution', async () => {
    const cutoff = new Date('2026-05-02T14:23:45.000Z');
    const rows = [
      ...Array.from({ length: 5 }, (_, index) => ({
        id: `expired-${index}`,
        createdAt: new Date(cutoff.getTime() - index - 1),
      })),
      { id: 'exact-cutoff', createdAt: new Date(cutoff) },
      { id: 'newer', createdAt: new Date(cutoff.getTime() + 1) },
    ];
    const notification = {
      findMany: vi.fn(async ({ where, take }) =>
        rows
          .filter((row) => row.createdAt < where.createdAt.lt)
          .sort(
            (left, right) =>
              left.createdAt.getTime() - right.createdAt.getTime() ||
              left.id.localeCompare(right.id),
          )
          .slice(0, take)
          .map(({ id }) => ({ id })),
      ),
      deleteMany: vi.fn(async ({ where }) => {
        const ids = new Set(where.id.in);
        let count = 0;
        for (let index = rows.length - 1; index >= 0; index -= 1) {
          const row = rows[index];
          if (row && ids.has(row.id) && row.createdAt < where.createdAt.lt) {
            rows.splice(index, 1);
            count += 1;
          }
        }
        return { count };
      }),
    };
    const repository = new PrismaWorkerJobsRepository({
      $transaction: vi.fn(async (work) => work({ notification })),
    } as never);

    await expect(repository.deleteExpiredNotifications(cutoff, 3)).resolves.toBe(3);
    await expect(repository.deleteExpiredNotifications(cutoff, 3)).resolves.toBe(2);
    await expect(repository.deleteExpiredNotifications(cutoff, 3)).resolves.toBe(0);

    expect(rows.map(({ id }) => id)).toEqual(['exact-cutoff', 'newer']);
    expect(notification.findMany.mock.calls.map(([input]) => input.take)).toEqual([3, 3, 3]);
  });

  it('recalculates balances and earned totals from immutable points logs', async () => {
    const prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'child-ok',
            familyId: 'family-1',
            pointsBalance: 10,
            pointsEarnedTotal: 15,
          },
          {
            id: 'child-drift',
            familyId: 'family-1',
            pointsBalance: 4,
            pointsEarnedTotal: 4,
          },
        ]),
      },
      pointsLog: {
        groupBy: vi
          .fn()
          .mockResolvedValueOnce([
            { userId: 'child-ok', _sum: { delta: 10 } },
            { userId: 'child-drift', _sum: { delta: 7 } },
          ])
          .mockResolvedValueOnce([
            { userId: 'child-ok', _sum: { delta: 15 } },
            { userId: 'child-drift', _sum: { delta: 9 } },
          ]),
      },
    };
    const repository = new PrismaWorkerJobsRepository(prisma as never);

    await expect(repository.reconcilePoints(100)).resolves.toEqual({
      scanned: 2,
      discrepancies: [
        {
          familyId: 'family-1',
          userId: 'child-drift',
          storedBalance: 4,
          calculatedBalance: 7,
          storedEarnedTotal: 4,
          calculatedEarnedTotal: 9,
        },
      ],
    });
    expect(prisma.pointsLog.groupBy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ type: 'EARN' }, { type: 'MANUAL', delta: { gt: 0 } }],
        }),
      }),
    );
  });

  it('returns an empty reconciliation report without querying logs', async () => {
    const prisma = {
      user: { findMany: vi.fn().mockResolvedValue([]) },
      pointsLog: { groupBy: vi.fn() },
    };
    const repository = new PrismaWorkerJobsRepository(prisma as never);

    await expect(repository.reconcilePoints(100)).resolves.toEqual({
      scanned: 0,
      discrepancies: [],
    });
    expect(prisma.pointsLog.groupBy).not.toHaveBeenCalled();
  });
});
