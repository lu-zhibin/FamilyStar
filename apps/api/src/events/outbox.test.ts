import { createDomainEvent } from '@familystar/shared';
import { describe, expect, it, vi } from 'vitest';

import {
  OutboxDispatcher,
  runWithOutbox,
  type OutboxDispatcherOptions,
  type OutboxRepository,
} from './outbox.js';

const EVENT = createDomainEvent({
  event_id: '018f31f2-b9a8-7cc0-a9e1-1256dc8cd915',
  event_name: 'tasks.task.completed.v1',
  occurred_at: '2026-07-30T09:00:00.000Z',
  family_id: '018f47a8-7b21-7cc2-9a4d-8f92fa16f186',
  actor_id: '018f47a8-7b21-7cc2-9a4d-8f92fa16f187',
  correlation_id: 'request-1',
  payload: { points: 5 },
});
const NOW = new Date('2026-07-30T10:00:00.000Z');

function repository(overrides: Partial<OutboxRepository> = {}): OutboxRepository {
  return {
    claimBatch: vi.fn().mockResolvedValue([]),
    markPublished: vi.fn().mockResolvedValue(undefined),
    reschedule: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function options(overrides: Partial<OutboxDispatcherOptions> = {}): OutboxDispatcherOptions {
  return {
    workerId: 'worker-1',
    batchSize: 10,
    leaseMilliseconds: 30_000,
    retryBaseMilliseconds: 1_000,
    retryMaxMilliseconds: 8_000,
    clock: () => NOW,
    ...overrides,
  };
}

describe('runWithOutbox', () => {
  it('appends events inside the transaction and returns the business result', async () => {
    const calls: string[] = [];
    const transaction = { id: 'tx-1' };
    const runner = {
      run: async <Result>(work: (value: typeof transaction) => Promise<Result>) => {
        calls.push('transaction');
        return work(transaction);
      },
    };
    const writer = {
      append: vi.fn(async () => {
        calls.push(EVENT.event_id);
      }),
    };

    const result = await runWithOutbox(runner, writer, async (activeTransaction) => {
      expect(activeTransaction).toBe(transaction);
      calls.push('business');
      return { result: 42, events: [EVENT, EVENT] };
    });

    expect(result).toBe(42);
    expect(calls).toEqual(['transaction', 'business', EVENT.event_id, EVENT.event_id]);
    expect(writer.append).toHaveBeenCalledWith(transaction, EVENT);
  });

  it('does not append events when business work fails', async () => {
    const writer = { append: vi.fn() };
    const runner = { run: <Result>(work: (transaction: object) => Promise<Result>) => work({}) };

    await expect(
      runWithOutbox(runner, writer, async () => {
        throw new Error('business failed');
      }),
    ).rejects.toThrow('business failed');
    expect(writer.append).not.toHaveBeenCalled();
  });
});

describe('OutboxDispatcher', () => {
  it('claims and publishes a batch', async () => {
    const store = repository({
      claimBatch: vi.fn().mockResolvedValue([{ event: EVENT, attempts: 1 }]),
    });
    const publisher = { publish: vi.fn().mockResolvedValue(undefined) };

    await expect(
      new OutboxDispatcher(store, publisher, options()).dispatchBatch(),
    ).resolves.toEqual({
      claimed: 1,
      published: 1,
      failed: 0,
    });
    expect(store.claimBatch).toHaveBeenCalledWith({
      workerId: 'worker-1',
      batchSize: 10,
      leaseMilliseconds: 30_000,
      now: NOW,
    });
    expect(store.markPublished).toHaveBeenCalledWith(EVENT.event_id, 'worker-1', NOW);
    expect(store.reschedule).not.toHaveBeenCalled();
  });

  it('reschedules failed publications with classified exponential backoff', async () => {
    const store = repository({
      claimBatch: vi.fn().mockResolvedValue([{ event: EVENT, attempts: 3 }]),
    });
    const publisher = { publish: vi.fn().mockRejectedValue(new TypeError('sensitive detail')) };

    await expect(
      new OutboxDispatcher(store, publisher, options()).dispatchBatch(),
    ).resolves.toEqual({
      claimed: 1,
      published: 0,
      failed: 1,
    });
    expect(store.reschedule).toHaveBeenCalledWith(
      EVENT.event_id,
      'worker-1',
      new Date('2026-07-30T10:00:04.000Z'),
      'TypeError',
    );
  });

  it('caps retry delay and classifies non-error failures', async () => {
    const store = repository({
      claimBatch: vi.fn().mockResolvedValue([{ event: EVENT, attempts: 60 }]),
    });
    const publisher = { publish: vi.fn().mockRejectedValue('failure') };

    await new OutboxDispatcher(store, publisher, options()).dispatchBatch();

    expect(store.reschedule).toHaveBeenCalledWith(
      EVENT.event_id,
      'worker-1',
      new Date('2026-07-30T10:00:08.000Z'),
      'UnknownError',
    );
  });

  it('uses the system clock and classifies errors with an empty name', async () => {
    const unnamedError = new Error('failure');
    unnamedError.name = '';
    const store = repository({
      claimBatch: vi.fn().mockResolvedValue([{ event: EVENT, attempts: 0 }]),
    });
    const before = Date.now();

    await new OutboxDispatcher(
      store,
      { publish: vi.fn().mockRejectedValue(unnamedError) },
      {
        workerId: 'worker-1',
        batchSize: 10,
        leaseMilliseconds: 30_000,
        retryBaseMilliseconds: 1_000,
        retryMaxMilliseconds: 8_000,
      },
    ).dispatchBatch();

    const claimOptions = vi.mocked(store.claimBatch).mock.calls[0]?.[0];
    expect(claimOptions?.now.getTime()).toBeGreaterThanOrEqual(before);
    expect(store.reschedule).toHaveBeenCalledWith(
      EVENT.event_id,
      'worker-1',
      expect.any(Date),
      'UnknownError',
    );
  });

  it.each([
    [{ workerId: ' ' }, 'Worker ID must not be empty.'],
    [{ batchSize: 0 }, 'Batch size must be a positive safe integer.'],
    [{ leaseMilliseconds: 0 }, 'Lease duration must be a positive safe integer.'],
    [{ retryBaseMilliseconds: 0 }, 'Retry base duration must be a positive safe integer.'],
    [{ retryMaxMilliseconds: 0 }, 'Retry maximum duration must be a positive safe integer.'],
    [
      { retryBaseMilliseconds: 2_000, retryMaxMilliseconds: 1_000 },
      'Retry maximum duration must be at least the retry base duration.',
    ],
  ])('rejects invalid dispatcher options', (override, message) => {
    expect(
      () => new OutboxDispatcher(repository(), { publish: vi.fn() }, options(override)),
    ).toThrow(message);
  });
});
