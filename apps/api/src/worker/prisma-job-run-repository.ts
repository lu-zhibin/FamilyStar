import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

import type { WorkerJobRunRepository } from './types.js';

export class PrismaWorkerJobRunRepository implements WorkerJobRunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async claim(input: Parameters<WorkerJobRunRepository['claim']>[0]) {
    const staleBefore = new Date(input.now.getTime() - input.staleAfterMilliseconds);
    const existing = await this.prisma.workerJobRun.findUnique({
      where: { jobName_runKey: { jobName: input.jobName, runKey: input.runKey } },
    });
    if (existing) {
      const retryableFailure =
        existing.status === 'FAILED' &&
        existing.attempts < input.maxAttempts &&
        (existing.nextRetryAt === null || existing.nextRetryAt <= input.now);
      const staleRun =
        existing.status === 'RUNNING' &&
        existing.attempts < input.maxAttempts &&
        existing.startedAt <= staleBefore;
      if (!retryableFailure && !staleRun) return null;
      const run = await this.prisma.workerJobRun.update({
        where: { id: existing.id },
        data: {
          status: 'RUNNING',
          attempts: { increment: 1 },
          startedAt: input.now,
          finishedAt: null,
          nextRetryAt: null,
          errorCode: null,
          result: Prisma.DbNull,
        },
      });
      return { id: run.id, attempt: run.attempts };
    }

    try {
      const run = await this.prisma.workerJobRun.create({
        data: { jobName: input.jobName, runKey: input.runKey, startedAt: input.now },
      });
      return { id: run.id, attempt: run.attempts };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return null;
      }
      throw error;
    }
  }

  async succeed(
    id: string,
    finishedAt: Date,
    result: Parameters<WorkerJobRunRepository['succeed']>[2],
  ) {
    await this.prisma.workerJobRun.update({
      where: { id },
      data: { status: 'SUCCEEDED', finishedAt, result, nextRetryAt: null, errorCode: null },
    });
  }

  async fail(input: Parameters<WorkerJobRunRepository['fail']>[0]) {
    await this.prisma.workerJobRun.update({
      where: { id: input.id },
      data: {
        status: 'FAILED',
        finishedAt: input.finishedAt,
        nextRetryAt: input.nextRetryAt,
        errorCode: input.errorCode,
      },
    });
  }
}
