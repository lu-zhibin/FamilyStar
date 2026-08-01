import { describe, expect, it, vi } from 'vitest';

import { WorkerScheduler } from './scheduler.js';
import type { WorkerJob } from './types.js';

const NOW = new Date('2026-07-31T14:00:00.000Z');

function job(name: WorkerJob['name']): WorkerJob {
  return { name, runKey: () => 'run', execute: vi.fn() };
}

describe('WorkerScheduler', () => {
  it('runs every registered job and records a successful health tick', async () => {
    const runner = { run: vi.fn().mockResolvedValue('completed') };
    const jobs = [job('task-cycle'), job('review-timeout')];
    const scheduler = new WorkerScheduler(runner as never, jobs, 5_000);

    await scheduler.tick(NOW);

    expect(runner.run).toHaveBeenCalledTimes(2);
    expect(scheduler.health()).toMatchObject({
      lastTickAt: NOW,
      lastSuccessfulTickAt: NOW,
      lastErrorCode: null,
    });
  });

  it('continues remaining jobs and exposes a redacted error code', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const runner = {
      run: vi
        .fn()
        .mockRejectedValueOnce(new TypeError('private'))
        .mockResolvedValueOnce('completed'),
    };
    const scheduler = new WorkerScheduler(
      runner as never,
      [job('task-cycle'), job('outbox-dispatch')],
      5_000,
    );

    await scheduler.tick(NOW);

    expect(runner.run).toHaveBeenCalledTimes(2);
    expect(scheduler.health()).toMatchObject({
      lastTickAt: NOW,
      lastSuccessfulTickAt: null,
      lastErrorCode: 'TypeError',
    });
    expect(consoleError).toHaveBeenCalledWith(expect.not.stringContaining('private'));
    consoleError.mockRestore();
  });
});
