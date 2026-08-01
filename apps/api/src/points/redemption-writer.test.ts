import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { InvalidPointsChangeError } from './logic.js';
import { PrismaPointsTransactionWriter } from './prisma-writer.js';
import { PointsTransactionRetryError } from './types.js';

const input = {
  familyId: '10000000-0000-4000-8000-000000000001',
  childId: '20000000-0000-4000-8000-000000000001',
  redemptionId: '30000000-0000-4000-8000-000000000001',
  points: 25,
  actorId: '20000000-0000-4000-8000-000000000001',
  occurredAt: new Date('2026-07-31T12:00:00.000Z'),
};

function setup(balance = 40, existing: unknown = null) {
  const transaction = {
    pointsLog: {
      findUnique: vi.fn().mockResolvedValue(existing),
      create: vi
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'log-1', createdAt: input.occurredAt, ...data }),
        ),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue({
        pointsBalance: balance,
        pointsEarnedTotal: 100,
        version: 4,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (work) => work(transaction)),
    pointsLog: { findUnique: vi.fn() },
  } as unknown as PrismaClient;
  const outbox = { append: vi.fn().mockResolvedValue(undefined) };
  return { transaction, outbox, writer: new PrismaPointsTransactionWriter(prisma, outbox) };
}

describe('redemption points writer', () => {
  it('redeems once while preserving pointsEarnedTotal', async () => {
    const { transaction, outbox, writer } = setup();
    const result = await writer.run((_transaction, points) => points.redeem(input));

    expect(transaction.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: input.childId,
        familyId: input.familyId,
        role: 'CHILD',
        version: 4,
        deletedAt: null,
      },
      data: { pointsBalance: 15, version: { increment: 1 } },
    });
    expect(result).toMatchObject({
      type: 'REDEEM',
      businessType: 'redemption',
      businessId: input.redemptionId,
      delta: -25,
      balanceAfter: 15,
      earnedTotalAfter: 100,
    });
    expect(outbox.append).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({ event_name: 'points.balance.changed.v1' }),
    );
  });

  it('refunds once and replays the unique log without another balance update', async () => {
    const first = setup(15);
    const refund = await first.writer.run((_transaction, points) => points.refund(input));
    expect(refund).toMatchObject({
      type: 'REFUND',
      delta: 25,
      balanceAfter: 40,
      earnedTotalAfter: 100,
    });

    const repeated = setup(40, refund);
    await expect(
      repeated.writer.run((_transaction, points) => points.refund(input)),
    ).resolves.toEqual(refund);
    expect(repeated.transaction.user.updateMany).not.toHaveBeenCalled();
    expect(repeated.outbox.append).not.toHaveBeenCalled();
  });

  it('fails before writes when the balance is insufficient', async () => {
    const { transaction, outbox, writer } = setup(10);
    await expect(writer.run((_transaction, points) => points.redeem(input))).rejects.toBeInstanceOf(
      InvalidPointsChangeError,
    );
    expect(transaction.user.updateMany).not.toHaveBeenCalled();
    expect(transaction.pointsLog.create).not.toHaveBeenCalled();
    expect(outbox.append).not.toHaveBeenCalled();
  });

  it('retries a transaction-level idempotency race and returns the replay', async () => {
    const { writer } = setup();
    const work = vi
      .fn()
      .mockRejectedValueOnce(new PointsTransactionRetryError(new Error('unique conflict')))
      .mockResolvedValueOnce('replayed');

    await expect(writer.run(work)).resolves.toBe('replayed');
    expect(work).toHaveBeenCalledTimes(2);
  });
});
