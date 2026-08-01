import { createDomainEvent } from '@familystar/shared';
import { describe, expect, it, vi } from 'vitest';

import { IdempotentEventConsumer, type EventReceiptStore } from './idempotent-consumer.js';

const EVENT = createDomainEvent({
  event_id: '018f31f2-b9a8-7cc0-a9e1-1256dc8cd915',
  event_name: 'tasks.task.completed.v1',
  occurred_at: '2026-07-30T09:00:00.000Z',
  family_id: '018f47a8-7b21-7cc2-9a4d-8f92fa16f186',
  actor_id: null,
  correlation_id: 'scheduler-1',
  payload: {},
});

function receipts(claimed = true): EventReceiptStore {
  return {
    claim: vi.fn().mockResolvedValue(claimed),
    release: vi.fn().mockResolvedValue(true),
  };
}

describe('IdempotentEventConsumer', () => {
  it('processes the first delivery and retains its receipt', async () => {
    const store = receipts();
    const handler = vi.fn().mockResolvedValue(undefined);
    const consumer = new IdempotentEventConsumer(store, handler, {
      consumer: 'points-projector',
      receiptTtlSeconds: 86_400,
      ownerTokenFactory: () => 'owner-1',
    });

    await expect(consumer.consume(EVENT)).resolves.toBe('processed');
    expect(store.claim).toHaveBeenCalledWith('points-projector', EVENT.event_id, 'owner-1', 86_400);
    expect(handler).toHaveBeenCalledWith(EVENT);
    expect(store.release).not.toHaveBeenCalled();
  });

  it('skips duplicate deliveries', async () => {
    const store = receipts(false);
    const handler = vi.fn();
    const consumer = new IdempotentEventConsumer(store, handler, {
      consumer: 'points-projector',
      receiptTtlSeconds: 60,
    });

    await expect(consumer.consume(EVENT)).resolves.toBe('duplicate');
    expect(handler).not.toHaveBeenCalled();
  });

  it('owner-releases the receipt when handling fails', async () => {
    const store = receipts();
    const consumer = new IdempotentEventConsumer(
      store,
      () => {
        throw new Error('retry me');
      },
      {
        consumer: 'points-projector',
        receiptTtlSeconds: 60,
        ownerTokenFactory: () => 'owner-2',
      },
    );

    await expect(consumer.consume(EVENT)).rejects.toThrow('retry me');
    expect(store.release).toHaveBeenCalledWith('points-projector', EVENT.event_id, 'owner-2');
  });

  it.each([
    [{ consumer: ' ', receiptTtlSeconds: 60 }, 'Consumer name must not be empty.'],
    [
      { consumer: 'points-projector', receiptTtlSeconds: 0 },
      'Receipt TTL must be a positive safe integer.',
    ],
  ])('rejects invalid options', (invalidOptions, message) => {
    expect(() => new IdempotentEventConsumer(receipts(), vi.fn(), invalidOptions)).toThrow(message);
  });
});
