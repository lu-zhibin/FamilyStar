import { createDomainEvent } from '@familystar/shared';
import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import {
  OutboxLeaseLostError,
  PrismaOutboxRepository,
  PrismaOutboxWriter,
  PrismaTransactionRunner,
} from './prisma-outbox.js';

const EVENT = createDomainEvent({
  event_id: '018f31f2-b9a8-7cc0-a9e1-1256dc8cd915',
  event_name: 'tasks.task.completed.v1',
  occurred_at: '2026-07-30T09:00:00.000Z',
  family_id: '018f47a8-7b21-7cc2-9a4d-8f92fa16f186',
  actor_id: '018f47a8-7b21-7cc2-9a4d-8f92fa16f187',
  correlation_id: 'request-1',
  payload: { points: 5 },
});

describe('PrismaOutboxWriter', () => {
  it('maps a domain event to an Outbox row', async () => {
    const create = vi.fn().mockResolvedValue({});
    const transaction = { outboxEvent: { create } } as unknown as Prisma.TransactionClient;

    await new PrismaOutboxWriter().append(transaction, EVENT);

    expect(create).toHaveBeenCalledWith({
      data: {
        id: EVENT.event_id,
        familyId: EVENT.family_id,
        actorId: EVENT.actor_id,
        eventName: EVENT.event_name,
        correlationId: EVENT.correlation_id,
        payload: EVENT.payload,
        occurredAt: new Date(EVENT.occurred_at),
        availableAt: new Date(EVENT.occurred_at),
      },
    });
  });
});

describe('PrismaTransactionRunner', () => {
  it('passes the active Prisma transaction to the work callback', async () => {
    const transaction = { marker: 'transaction' };
    const prisma = {
      $transaction: (work: (value: typeof transaction) => unknown) => work(transaction),
    };
    const work = vi.fn().mockResolvedValue(42);

    await expect(new PrismaTransactionRunner(prisma as never).run(work)).resolves.toBe(42);
    expect(work).toHaveBeenCalledWith(transaction);
  });
});

describe('PrismaOutboxRepository', () => {
  it('claims rows and restores immutable domain events', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        id: EVENT.event_id,
        familyId: EVENT.family_id,
        actorId: EVENT.actor_id,
        eventName: EVENT.event_name,
        correlationId: EVENT.correlation_id,
        payload: EVENT.payload,
        occurredAt: new Date(EVENT.occurred_at),
        attempts: 2,
      },
    ]);
    const prisma = {
      $transaction: (work: (transaction: { $queryRaw: typeof queryRaw }) => unknown) =>
        work({ $queryRaw: queryRaw }),
    };
    const store = new PrismaOutboxRepository(prisma as never);

    await expect(
      store.claimBatch({
        workerId: 'worker-1',
        batchSize: 10,
        leaseMilliseconds: 30_000,
        now: new Date('2026-07-30T10:00:00.000Z'),
      }),
    ).resolves.toEqual([{ event: EVENT, attempts: 2 }]);
    expect(queryRaw).toHaveBeenCalledOnce();
  });

  it('acknowledges and reschedules events held by the worker', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const store = new PrismaOutboxRepository({ outboxEvent: { updateMany } } as never);
    const now = new Date('2026-07-30T10:00:00.000Z');

    await store.markPublished(EVENT.event_id, 'worker-1', now);
    await store.reschedule(EVENT.event_id, 'worker-1', now, 'A'.repeat(100));

    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: EVENT.event_id, lockOwner: 'worker-1', publishedAt: null },
      data: { publishedAt: now, lockedAt: null, lockOwner: null, lastError: null },
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: EVENT.event_id, lockOwner: 'worker-1', publishedAt: null },
      data: {
        availableAt: now,
        lockedAt: null,
        lockOwner: null,
        lastError: 'A'.repeat(80),
      },
    });
  });

  it('rejects acknowledgements after a lease is lost', async () => {
    const store = new PrismaOutboxRepository({
      outboxEvent: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    } as never);

    await expect(store.markPublished(EVENT.event_id, 'other-worker', new Date())).rejects.toEqual(
      new OutboxLeaseLostError(EVENT.event_id),
    );
  });
});
