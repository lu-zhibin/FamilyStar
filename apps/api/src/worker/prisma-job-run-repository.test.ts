import { describe, expect, it, vi } from 'vitest';

import { PrismaWorkerJobRunRepository } from './prisma-job-run-repository.js';

const NOW = new Date('2026-07-31T14:00:00.000Z');

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    jobName: 'task-cycle',
    runKey: '2026-07-31',
    status: 'FAILED',
    attempts: 1,
    startedAt: new Date('2026-07-31T13:00:00.000Z'),
    finishedAt: new Date('2026-07-31T13:00:01.000Z'),
    nextRetryAt: new Date('2026-07-31T13:00:02.000Z'),
    errorCode: 'Error',
    result: null,
    createdAt: new Date('2026-07-31T13:00:00.000Z'),
    updatedAt: new Date('2026-07-31T13:00:01.000Z'),
    ...overrides,
  };
}

function fixture(existing: ReturnType<typeof run> | null) {
  const workerJobRun = {
    findUnique: vi.fn().mockResolvedValue(existing),
    create: vi.fn().mockResolvedValue(run({ status: 'RUNNING' })),
    update: vi.fn().mockResolvedValue(run({ status: 'RUNNING', attempts: 2 })),
  };
  return {
    repository: new PrismaWorkerJobRunRepository({ workerJobRun } as never),
    workerJobRun,
  };
}

const claim = {
  jobName: 'task-cycle' as const,
  runKey: '2026-07-31',
  now: NOW,
  staleAfterMilliseconds: 300_000,
  maxAttempts: 3,
};

describe('PrismaWorkerJobRunRepository', () => {
  it('creates the first durable run for a deterministic key', async () => {
    const { repository, workerJobRun } = fixture(null);

    await expect(repository.claim(claim)).resolves.toEqual({ id: 'run-1', attempt: 1 });
    expect(workerJobRun.create).toHaveBeenCalledWith({
      data: { jobName: 'task-cycle', runKey: '2026-07-31', startedAt: NOW },
    });
  });

  it('reclaims due failures and clears prior error state', async () => {
    const { repository, workerJobRun } = fixture(run());

    await expect(repository.claim(claim)).resolves.toEqual({ id: 'run-1', attempt: 2 });
    expect(workerJobRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({
        status: 'RUNNING',
        attempts: { increment: 1 },
        finishedAt: null,
        nextRetryAt: null,
        errorCode: null,
      }),
    });
  });

  it.each([
    run({ status: 'SUCCEEDED' }),
    run({ nextRetryAt: new Date('2026-07-31T15:00:00.000Z') }),
    run({ status: 'RUNNING', attempts: 3 }),
  ])('skips completed, delayed, and exhausted runs', async (existing) => {
    const { repository, workerJobRun } = fixture(existing);

    await expect(repository.claim(claim)).resolves.toBeNull();
    expect(workerJobRun.update).not.toHaveBeenCalled();
  });

  it('reclaims a stale running record within the attempt limit', async () => {
    const { repository } = fixture(
      run({ status: 'RUNNING', startedAt: new Date('2026-07-31T13:00:00.000Z') }),
    );

    await expect(repository.claim(claim)).resolves.toEqual({ id: 'run-1', attempt: 2 });
  });
});
