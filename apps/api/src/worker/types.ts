import type { Prisma } from '@prisma/client';

import type { RedisCommandPort } from '../infrastructure/redis/primitives.js';

export const WORKER_JOB_NAMES = [
  'task-cycle',
  'review-timeout',
  'outbox-dispatch',
  'media-cleanup',
  'points-reconciliation',
  'notification-cleanup',
] as const;

export type WorkerJobName = (typeof WORKER_JOB_NAMES)[number];
export type WorkerJobResult = Prisma.InputJsonObject;

export type WorkerJob = Readonly<{
  name: WorkerJobName;
  runKey(now: Date): string;
  execute(now: Date): Promise<WorkerJobResult>;
}>;

export type WorkerJobClaim = Readonly<{ id: string; attempt: number }>;

export type WorkerJobRunRepository = {
  claim(input: {
    jobName: WorkerJobName;
    runKey: string;
    now: Date;
    staleAfterMilliseconds: number;
    maxAttempts: number;
  }): Promise<WorkerJobClaim | null>;
  succeed(id: string, finishedAt: Date, result: WorkerJobResult): Promise<void>;
  fail(input: {
    id: string;
    finishedAt: Date;
    errorCode: string;
    nextRetryAt: Date | null;
  }): Promise<void>;
};

export type WorkerJobRunnerDependencies = Readonly<{
  repository: WorkerJobRunRepository;
  redis: RedisCommandPort;
  lockKey(jobName: WorkerJobName): string;
  lockTtlMilliseconds: number;
  maxAttempts?: number;
  retryBaseMilliseconds?: number;
  ownerTokenFactory?: () => string;
}>;

export type WorkerHealth = Readonly<{
  startedAt: Date;
  lastTickAt: Date | null;
  lastSuccessfulTickAt: Date | null;
  lastErrorCode: string | null;
}>;
