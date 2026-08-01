import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RedisCommandPort } from '../infrastructure/redis/primitives.js';
import { WorkerJobRunner } from './job-runner.js';
import type { WorkerJob, WorkerJobRunRepository } from './types.js';

const NOW = new Date('2026-07-31T14:00:00.000Z');

function fixture(input: { lockReply?: unknown; attempt?: number } = {}) {
  const sendCommand = vi
    .fn<RedisCommandPort['sendCommand']>()
    .mockResolvedValueOnce(input.lockReply === undefined ? 'OK' : input.lockReply)
    .mockResolvedValueOnce(1);
  const repository: WorkerJobRunRepository = {
    claim: vi.fn().mockResolvedValue({ id: 'run-1', attempt: input.attempt ?? 1 }),
    succeed: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
  };
  const job: WorkerJob = {
    name: 'task-cycle',
    runKey: () => '2026-07-31',
    execute: vi.fn().mockResolvedValue({ rounds: 2 }),
  };
  const runner = new WorkerJobRunner({
    repository,
    redis: { sendCommand },
    lockKey: (name) => `lock:${name}`,
    lockTtlMilliseconds: 30_000,
    retryBaseMilliseconds: 1_000,
    ownerTokenFactory: () => 'owner-1',
  });
  return { job, repository, runner, sendCommand };
}

describe('WorkerJobRunner', () => {
  beforeEach(() => vi.useRealTimers());

  it('claims a deterministic run, persists its result and releases the owner lock', async () => {
    const { job, repository, runner, sendCommand } = fixture();

    await expect(runner.run(job, NOW)).resolves.toBe('completed');

    expect(repository.claim).toHaveBeenCalledWith({
      jobName: 'task-cycle',
      runKey: '2026-07-31',
      now: NOW,
      staleAfterMilliseconds: 30_000,
      maxAttempts: 3,
    });
    expect(repository.succeed).toHaveBeenCalledWith('run-1', expect.any(Date), { rounds: 2 });
    expect(sendCommand.mock.calls[1]?.[0]).toEqual([
      'EVAL',
      expect.stringContaining("redis.call('GET', KEYS[1])"),
      '1',
      'lock:task-cycle',
      'owner-1',
    ]);
  });

  it('skips work when another Worker owns the job lock', async () => {
    const { job, repository, runner } = fixture({ lockReply: null });

    await expect(runner.run(job, NOW)).resolves.toBe('skipped');
    expect(repository.claim).not.toHaveBeenCalled();
    expect(job.execute).not.toHaveBeenCalled();
  });

  it('persists a bounded exponential retry after a failed attempt', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { job, repository, runner } = fixture({ attempt: 2 });
    vi.mocked(job.execute).mockRejectedValueOnce(new TypeError('private failure detail'));

    await expect(runner.run(job, NOW)).rejects.toThrow(TypeError);
    expect(repository.fail).toHaveBeenCalledWith({
      id: 'run-1',
      finishedAt: NOW,
      errorCode: 'TypeError',
      nextRetryAt: new Date('2026-07-31T14:00:02.000Z'),
    });
  });

  it('records the third failure as terminal', async () => {
    const { job, repository, runner } = fixture({ attempt: 3 });
    vi.mocked(job.execute).mockRejectedValueOnce(new Error('failed'));

    await expect(runner.run(job, NOW)).rejects.toThrow('failed');
    expect(repository.fail).toHaveBeenCalledWith(expect.objectContaining({ nextRetryAt: null }));
  });
});
