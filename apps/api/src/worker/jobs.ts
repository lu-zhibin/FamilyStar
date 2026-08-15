import type { PrismaClient } from '@prisma/client';

import type { SubmissionReviewTimeoutBatch } from '../check-ins/review-types.js';
import type { DispatchResult } from '../events/outbox.js';
import type { CosClientPort, CosConnectionProvider } from '../media/types.js';
import type { CollaborationScheduler } from '../tasks/collaboration-scheduler.js';
import type { WorkerJob, WorkerJobResult } from './types.js';

type OutboxBatch = { dispatchBatch(): Promise<DispatchResult> };

type MediaCleanupCandidate = Readonly<{
  sessionId: string;
  familyId: string;
  objectKey: string;
  uploadId: string | null;
}>;

export type PointsDiscrepancy = Readonly<{
  familyId: string;
  userId: string;
  storedBalance: number;
  calculatedBalance: number;
  storedEarnedTotal: number;
  calculatedEarnedTotal: number;
}>;

export type WorkerJobsRepository = {
  listActiveFamilyIds(): Promise<readonly string[]>;
  listExpiredMediaUploads(cutoff: Date, limit: number): Promise<readonly MediaCleanupCandidate[]>;
  markMediaUploadCleaned(sessionId: string, familyId: string, cleanedAt: Date): Promise<void>;
  reconcilePoints(limit: number): Promise<{
    scanned: number;
    discrepancies: readonly PointsDiscrepancy[];
  }>;
  deleteExpiredNotifications(cutoff: Date, limit: number): Promise<number>;
};

export class MediaCleanupError extends Error {
  constructor(readonly failed: number) {
    super('One or more expired media uploads could not be cleaned.');
    this.name = 'MediaCleanupError';
  }
}

export class PrismaWorkerJobsRepository implements WorkerJobsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listActiveFamilyIds(): Promise<readonly string[]> {
    return (
      await this.prisma.family.findMany({
        where: { deletedAt: null },
        select: { id: true },
        orderBy: { id: 'asc' },
      })
    ).map(({ id }) => id);
  }

  async listExpiredMediaUploads(cutoff: Date, limit: number) {
    const sessions = await this.prisma.mediaUploadSession.findMany({
      where: {
        status: { in: ['PENDING', 'UPLOADING', 'FAILED'] },
        updatedAt: { lte: cutoff },
        mediaAsset: { deletedAt: null },
      },
      select: {
        id: true,
        familyId: true,
        uploadId: true,
        mediaAsset: { select: { objectKey: true } },
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return sessions.map((session) => ({
      sessionId: session.id,
      familyId: session.familyId,
      objectKey: session.mediaAsset.objectKey,
      uploadId: session.uploadId,
    }));
  }

  async markMediaUploadCleaned(
    sessionId: string,
    familyId: string,
    cleanedAt: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.mediaUploadSession.updateMany({
        where: { id: sessionId, familyId, status: { in: ['PENDING', 'UPLOADING', 'FAILED'] } },
        data: { status: 'FAILED', failureCode: 'WORKER_CLEANED' },
      });
      await transaction.mediaAsset.updateMany({
        where: { familyId, uploadSession: { id: sessionId }, deletedAt: null },
        data: { uploadStatus: 'FAILED', deletedAt: cleanedAt },
      });
    });
  }

  async reconcilePoints(limit: number) {
    const users = await this.prisma.user.findMany({
      where: { role: 'CHILD', deletedAt: null },
      select: { id: true, familyId: true, pointsBalance: true, pointsEarnedTotal: true },
      orderBy: { id: 'asc' },
      take: limit,
    });
    if (users.length === 0) return { scanned: 0, discrepancies: [] };

    const userIds = users.map(({ id }) => id);
    const [balances, earnedTotals] = await Promise.all([
      this.prisma.pointsLog.groupBy({
        by: ['userId'],
        where: { userId: { in: userIds } },
        _sum: { delta: true },
      }),
      this.prisma.pointsLog.groupBy({
        by: ['userId'],
        where: {
          userId: { in: userIds },
          OR: [{ type: 'EARN' }, { type: 'MANUAL', delta: { gt: 0 } }],
        },
        _sum: { delta: true },
      }),
    ]);
    const balanceByUser = new Map(balances.map((row) => [row.userId, row._sum.delta ?? 0]));
    const earnedByUser = new Map(earnedTotals.map((row) => [row.userId, row._sum.delta ?? 0]));
    const discrepancies = users.flatMap((user): PointsDiscrepancy[] => {
      const calculatedBalance = balanceByUser.get(user.id) ?? 0;
      const calculatedEarnedTotal = earnedByUser.get(user.id) ?? 0;
      if (
        calculatedBalance === user.pointsBalance &&
        calculatedEarnedTotal === user.pointsEarnedTotal
      ) {
        return [];
      }
      return [
        {
          familyId: user.familyId,
          userId: user.id,
          storedBalance: user.pointsBalance,
          calculatedBalance,
          storedEarnedTotal: user.pointsEarnedTotal,
          calculatedEarnedTotal,
        },
      ];
    });
    return { scanned: users.length, discrepancies };
  }

  async deleteExpiredNotifications(cutoff: Date, limit: number): Promise<number> {
    return this.prisma.$transaction(async (transaction) => {
      const candidates = await transaction.notification.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: limit,
      });
      if (candidates.length === 0) return 0;
      const deleted = await transaction.notification.deleteMany({
        where: { id: { in: candidates.map(({ id }) => id) }, createdAt: { lt: cutoff } },
      });
      return deleted.count;
    });
  }
}

function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function bucket(now: Date, milliseconds: number): string {
  return String(Math.floor(now.getTime() / milliseconds));
}

export function createWorkerJobs(input: {
  repository: WorkerJobsRepository;
  collaborationScheduler: CollaborationScheduler;
  reviewTimeout: SubmissionReviewTimeoutBatch;
  outbox: OutboxBatch;
  cos: CosClientPort;
  connections: CosConnectionProvider;
  batchSize: number;
  mediaCleanupAgeHours: number;
}): readonly WorkerJob[] {
  return [
    {
      name: 'task-cycle',
      runKey: (now) => bucket(now, 60_000),
      execute: async (now): Promise<WorkerJobResult> => {
        const familyIds = await input.repository.listActiveFamilyIds();
        let rounds = 0;
        for (const familyId of familyIds) {
          rounds += (await input.collaborationScheduler.generate({ familyId, date: utcDate(now) }))
            .length;
        }
        return { families: familyIds.length, rounds };
      },
    },
    {
      name: 'review-timeout',
      runKey: (now) => bucket(now, 60_000),
      execute: async () => ({ ...(await input.reviewTimeout.runBatch()) }),
    },
    {
      name: 'outbox-dispatch',
      runKey: (now) => bucket(now, 5_000),
      execute: async () => ({ ...(await input.outbox.dispatchBatch()) }),
    },
    {
      name: 'media-cleanup',
      runKey: (now) => bucket(now, 60 * 60_000),
      execute: async (now) => {
        const cutoff = new Date(now.getTime() - input.mediaCleanupAgeHours * 60 * 60_000);
        const candidates = await input.repository.listExpiredMediaUploads(cutoff, input.batchSize);
        let cleaned = 0;
        let failed = 0;
        for (const candidate of candidates) {
          try {
            const connection = await input.connections.get(candidate.familyId);
            if (candidate.uploadId) {
              await input.cos.abortMultipart({
                connection,
                objectKey: candidate.objectKey,
                uploadId: candidate.uploadId,
              });
            }
            await input.cos.deleteObject({ connection, objectKey: candidate.objectKey });
            await input.repository.markMediaUploadCleaned(
              candidate.sessionId,
              candidate.familyId,
              now,
            );
            cleaned += 1;
          } catch {
            failed += 1;
          }
        }
        if (failed > 0) throw new MediaCleanupError(failed);
        return { scanned: candidates.length, cleaned };
      },
    },
    {
      name: 'points-reconciliation',
      runKey: utcDate,
      execute: async () => {
        const result = await input.repository.reconcilePoints(input.batchSize);
        return {
          scanned: result.scanned,
          discrepancy_count: result.discrepancies.length,
          discrepancies: result.discrepancies,
        };
      },
    },
    {
      name: 'notification-cleanup',
      runKey: utcDate,
      execute: async (now) => {
        const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60_000);
        const deleted = await input.repository.deleteExpiredNotifications(cutoff, input.batchSize);
        return { deleted, cutoff: cutoff.toISOString() };
      },
    },
  ];
}
