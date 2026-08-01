import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { OutboxWriter } from '../events/outbox.js';
import { PointsTransactionConflictError, PrismaPointsTransactionWriter } from './prisma-writer.js';
import type { CheckInPointsInput } from './types.js';

const input: CheckInPointsInput = {
  familyId: '10000000-0000-4000-8000-000000000001',
  userId: '20000000-0000-4000-8000-000000000001',
  checkInId: '30000000-0000-4000-8000-000000000001',
  basePoints: 8,
  awardDate: '2026-07-31',
  actorId: '20000000-0000-4000-8000-000000000001',
  occurredAt: new Date('2026-07-31T12:00:00.000Z'),
};

function pointsLog() {
  return {
    id: '40000000-0000-4000-8000-000000000001',
    familyId: input.familyId,
    userId: input.userId,
    type: 'EARN' as const,
    businessType: 'check_in',
    businessId: input.checkInId,
    delta: 8,
    balanceBefore: 12,
    balanceAfter: 20,
    earnedTotalAfter: 38,
    remark: null,
    createdAt: input.occurredAt,
  };
}

function transaction(
  options: {
    existing?: ReturnType<typeof pointsLog>;
    updateCount?: number;
    currentLevel?: number;
    configurations?: { level: number; pointsRequired: number }[];
  } = {},
) {
  return {
    pointsLog: {
      findUnique: vi.fn().mockResolvedValue(options.existing ?? null),
      create: vi.fn().mockResolvedValue(pointsLog()),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue({
        pointsBalance: 12,
        pointsEarnedTotal: 30,
        currentLevel: options.currentLevel ?? 2,
        version: 4,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: options.updateCount ?? 1 }),
    },
    levelConfig: {
      findMany: vi.fn().mockResolvedValue(
        options.configurations ?? [
          { level: 1, pointsRequired: 0 },
          { level: 2, pointsRequired: 30 },
        ],
      ),
    },
    checkIn: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    family: { findFirst: vi.fn().mockResolvedValue({ settings: {} }) },
    collaborationRoundParticipant: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

function client(databaseTransaction: ReturnType<typeof transaction>) {
  return {
    $transaction: vi.fn(async (operation) => operation(databaseTransaction)),
    pointsLog: { findUnique: vi.fn() },
  } as unknown as PrismaClient;
}

describe('PrismaPointsTransactionWriter', () => {
  it('updates both user balances, snapshots the check-in, writes a log and appends an event', async () => {
    const databaseTransaction = transaction();
    const prisma = client(databaseTransaction);
    const outbox = { append: vi.fn().mockResolvedValue(undefined) };
    const writer = new PrismaPointsTransactionWriter(
      prisma,
      outbox,
      () => '50000000-0000-4000-8000-000000000001',
    );

    const result = await writer.run((_transaction, points) => points.earnCheckIn(input));

    expect(databaseTransaction.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: input.userId,
        familyId: input.familyId,
        role: 'CHILD',
        version: 4,
        deletedAt: null,
      },
      data: {
        pointsBalance: 20,
        pointsEarnedTotal: 38,
        currentLevel: 2,
        version: { increment: 1 },
      },
    });
    expect(databaseTransaction.pointsLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'EARN',
        businessType: 'check_in',
        businessId: input.checkInId,
        balanceBefore: 12,
        balanceAfter: 20,
        earnedTotalAfter: 38,
      }),
    });
    expect(databaseTransaction.checkIn.updateMany).toHaveBeenCalledWith({
      where: {
        id: input.checkInId,
        familyId: input.familyId,
        childId: input.userId,
        deletedAt: null,
      },
      data: { pointsEarned: 8, streakMultiplier: new Prisma.Decimal(1) },
    });
    expect(outbox.append).toHaveBeenCalledWith(
      databaseTransaction,
      expect.objectContaining({
        event_name: 'points.balance.changed.v1',
        actor_id: input.actorId,
        payload: expect.objectContaining({ balance_after: 20, earned_total_after: 38 }),
      }),
    );
    expect(result).toEqual(pointsLog());
  });

  it('returns the existing business-key log without changing the balance', async () => {
    const databaseTransaction = transaction({ existing: pointsLog() });
    const outbox = { append: vi.fn() };
    const writer = new PrismaPointsTransactionWriter(client(databaseTransaction), outbox);

    await expect(writer.run((_transaction, points) => points.earnCheckIn(input))).resolves.toEqual(
      pointsLog(),
    );
    expect(databaseTransaction.user.updateMany).not.toHaveBeenCalled();
    expect(databaseTransaction.pointsLog.create).not.toHaveBeenCalled();
    expect(databaseTransaction.levelConfig.findMany).not.toHaveBeenCalled();
    expect(outbox.append).not.toHaveBeenCalled();
  });

  it('property: every repeated business key returns its log without side effects', async () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const repeatedInput = { ...input, checkInId: `check-in-${seed}` };
      const existing = { ...pointsLog(), businessId: repeatedInput.checkInId };
      const databaseTransaction = transaction({ existing });
      const outbox = { append: vi.fn() };
      const writer = new PrismaPointsTransactionWriter(client(databaseTransaction), outbox);

      await expect(
        writer.run((_transaction, points) => points.earnCheckIn(repeatedInput)),
      ).resolves.toEqual(existing);
      expect(databaseTransaction.user.updateMany).not.toHaveBeenCalled();
      expect(databaseTransaction.pointsLog.create).not.toHaveBeenCalled();
      expect(databaseTransaction.checkIn.updateMany).not.toHaveBeenCalled();
      expect(outbox.append).not.toHaveBeenCalled();
    }
  });

  it('advances across multiple levels and appends one atomic level event', async () => {
    const databaseTransaction = transaction({
      currentLevel: 1,
      configurations: [
        { level: 1, pointsRequired: 0 },
        { level: 2, pointsRequired: 10 },
        { level: 3, pointsRequired: 35 },
      ],
    });
    const outbox = { append: vi.fn().mockResolvedValue(undefined) };
    const writer = new PrismaPointsTransactionWriter(client(databaseTransaction), outbox);

    await writer.run((_transaction, points) => points.earnCheckIn(input));

    expect(databaseTransaction.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currentLevel: 3 }) }),
    );
    expect(outbox.append).toHaveBeenCalledTimes(2);
    expect(outbox.append).toHaveBeenNthCalledWith(
      2,
      databaseTransaction,
      expect.objectContaining({
        event_name: 'levels.level.advanced.v1',
        payload: {
          user_id: input.userId,
          previous_level: 1,
          current_level: 3,
          earned_total: 38,
        },
      }),
    );
  });

  it('keeps a cached higher level and emits no downgrade event', async () => {
    const databaseTransaction = transaction({
      currentLevel: 3,
      configurations: [
        { level: 1, pointsRequired: 0 },
        { level: 2, pointsRequired: 30 },
        { level: 3, pointsRequired: 80 },
      ],
    });
    const outbox = { append: vi.fn().mockResolvedValue(undefined) };
    const writer = new PrismaPointsTransactionWriter(client(databaseTransaction), outbox);

    await writer.run((_transaction, points) => points.earnCheckIn(input));

    expect(databaseTransaction.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currentLevel: 3 }) }),
    );
    expect(outbox.append).toHaveBeenCalledTimes(1);
    expect(outbox.append).toHaveBeenCalledWith(
      databaseTransaction,
      expect.objectContaining({ event_name: 'points.balance.changed.v1' }),
    );
  });

  it('rolls back the EARN work when the level event append fails', async () => {
    const databaseTransaction = transaction({
      currentLevel: 1,
      configurations: [
        { level: 1, pointsRequired: 0 },
        { level: 2, pointsRequired: 30 },
      ],
    });
    const levelEventError = new Error('level event unavailable');
    const outbox = {
      append: vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(levelEventError),
    };
    const writer = new PrismaPointsTransactionWriter(client(databaseTransaction), outbox);

    await expect(writer.run((_transaction, points) => points.earnCheckIn(input))).rejects.toBe(
      levelEventError,
    );
    expect(databaseTransaction.pointsLog.create).toHaveBeenCalledOnce();
    expect(outbox.append).toHaveBeenCalledTimes(2);
  });

  it('retries the full work three times and returns a retryable conflict', async () => {
    const databaseTransaction = transaction({ updateCount: 0 });
    const prisma = client(databaseTransaction);
    const work = vi.fn((_transaction, points) => points.earnCheckIn(input));
    const writer = new PrismaPointsTransactionWriter(prisma, { append: vi.fn() });

    await expect(writer.run(work)).rejects.toBeInstanceOf(PointsTransactionConflictError);
    expect(work).toHaveBeenCalledTimes(3);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(databaseTransaction.pointsLog.create).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2])(
    'property: commits once after %i optimistic conflicts without partial logs',
    async (conflictCount) => {
      const databaseTransaction = transaction();
      databaseTransaction.user.updateMany.mockReset();
      for (let index = 0; index < conflictCount; index += 1) {
        databaseTransaction.user.updateMany.mockResolvedValueOnce({ count: 0 });
      }
      databaseTransaction.user.updateMany.mockResolvedValue({ count: 1 });
      const prisma = client(databaseTransaction);
      const work = vi.fn((_transaction, points) => points.earnCheckIn(input));
      const writer = new PrismaPointsTransactionWriter(prisma, {
        append: vi.fn().mockResolvedValue(undefined),
      });

      await expect(writer.run(work)).resolves.toEqual(pointsLog());
      expect(prisma.$transaction).toHaveBeenCalledTimes(conflictCount + 1);
      expect(databaseTransaction.pointsLog.create).toHaveBeenCalledOnce();
      expect(databaseTransaction.checkIn.updateMany).toHaveBeenCalledOnce();
    },
  );

  it('waits for a P2002 rollback, confirms the duplicate outside, and safely replays work', async () => {
    const databaseTransaction = transaction();
    databaseTransaction.pointsLog.create
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: '6.19.2',
        }),
      )
      .mockResolvedValue(pointsLog());
    databaseTransaction.pointsLog.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(pointsLog());
    const prisma = client(databaseTransaction);
    vi.mocked(prisma.pointsLog.findUnique).mockResolvedValue(pointsLog());
    const work = vi.fn((_transaction, points) => points.earnCheckIn(input));
    const writer = new PrismaPointsTransactionWriter(prisma, { append: vi.fn() });

    await expect(writer.run(work)).resolves.toEqual(pointsLog());
    expect(work).toHaveBeenCalledTimes(2);
    expect(prisma.pointsLog.findUnique).toHaveBeenCalledTimes(1);
  });

  it('propagates an outbox failure so the surrounding transaction rolls back', async () => {
    const databaseTransaction = transaction();
    const outboxError = new Error('outbox unavailable');
    const outbox: OutboxWriter<Prisma.TransactionClient> = {
      append: vi.fn().mockRejectedValue(outboxError),
    };
    const writer = new PrismaPointsTransactionWriter(client(databaseTransaction), outbox);

    await expect(writer.run((_transaction, points) => points.earnCheckIn(input))).rejects.toBe(
      outboxError,
    );
    expect(databaseTransaction.pointsLog.create).toHaveBeenCalledOnce();
  });

  it('does not reinterpret an outbox P2002 as a points idempotency race', async () => {
    const databaseTransaction = transaction();
    const outboxError = new Prisma.PrismaClientKnownRequestError('duplicate event', {
      code: 'P2002',
      clientVersion: '6.19.2',
    });
    const prisma = client(databaseTransaction);
    const writer = new PrismaPointsTransactionWriter(prisma, {
      append: vi.fn().mockRejectedValue(outboxError),
    });

    await expect(writer.run((_transaction, points) => points.earnCheckIn(input))).rejects.toBe(
      outboxError,
    );
    expect(prisma.pointsLog.findUnique).not.toHaveBeenCalled();
  });

  it('conditionally completes a collaboration round and awards every active snapshot once', async () => {
    const round = {
      id: '30000000-0000-4000-8000-000000000002',
      status: 'ACTIVE' as const,
      endDate: new Date('2026-07-31T00:00:00.000Z'),
      participants: [
        {
          id: '60000000-0000-4000-8000-000000000001',
          childId: '20000000-0000-4000-8000-000000000001',
          rewardPointsSnapshot: 5,
        },
        {
          id: '60000000-0000-4000-8000-000000000002',
          childId: '20000000-0000-4000-8000-000000000002',
          rewardPointsSnapshot: 10,
        },
      ],
      submissions: [
        { childId: '20000000-0000-4000-8000-000000000001', status: 'APPROVED' as const },
        { childId: '20000000-0000-4000-8000-000000000002', status: 'APPROVED' as const },
      ],
    };
    const databaseTransaction = {
      collaborationRound: {
        findFirst: vi.fn().mockResolvedValue(round),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      collaborationRoundParticipant: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      checkIn: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { checkDate: new Date('2026-07-29T00:00:00.000Z') },
            { checkDate: new Date('2026-07-30T00:00:00.000Z') },
          ]),
      },
      family: { findFirst: vi.fn().mockResolvedValue({ settings: {} }) },
      pointsLog: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(({ data }) =>
          Promise.resolve({
            id: `log-${data.userId}`,
            ...data,
            createdAt: input.occurredAt,
          }),
        ),
      },
      user: {
        findFirst: vi.fn().mockResolvedValue({
          pointsBalance: 0,
          pointsEarnedTotal: 0,
          currentLevel: 1,
          version: 0,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      levelConfig: {
        findMany: vi.fn().mockResolvedValue([{ level: 1, pointsRequired: 0 }]),
      },
    };
    const outbox = { append: vi.fn().mockResolvedValue(undefined) };
    const writer = new PrismaPointsTransactionWriter(
      client(databaseTransaction as unknown as ReturnType<typeof transaction>),
      outbox,
    );
    const completion = {
      familyId: input.familyId,
      roundId: round.id,
      actorId: input.actorId,
      occurredAt: input.occurredAt,
    };

    await expect(
      writer.run((_transaction, points) => points.completeCollaborationRound(completion)),
    ).resolves.toBe(true);
    expect(databaseTransaction.pointsLog.create).toHaveBeenCalledTimes(2);
    expect(databaseTransaction.pointsLog.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          businessType: 'collaboration_round',
          businessId: round.id,
          delta: 8,
        }),
      }),
    );
    expect(databaseTransaction.collaborationRoundParticipant.updateMany).toHaveBeenCalledTimes(2);
    expect(databaseTransaction.collaborationRoundParticipant.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: { pointsEarned: 8, streakMultiplier: new Prisma.Decimal(1.5) },
      }),
    );
    expect(outbox.append).toHaveBeenCalledTimes(3);
    expect(outbox.append).toHaveBeenNthCalledWith(
      1,
      databaseTransaction,
      expect.objectContaining({
        event_name: 'check-in.collaboration.completed.v1',
        correlation_id: round.id,
        payload: { round_id: round.id, participant_count: 2 },
      }),
    );

    databaseTransaction.collaborationRound.findFirst.mockResolvedValue({
      ...round,
      status: 'COMPLETED',
    });
    await expect(
      writer.run((_transaction, points) => points.completeCollaborationRound(completion)),
    ).resolves.toBe(false);
    expect(databaseTransaction.pointsLog.create).toHaveBeenCalledTimes(2);
    expect(outbox.append).toHaveBeenCalledTimes(3);

    const rollbackError = new Error('collaboration event unavailable');
    databaseTransaction.collaborationRound.findFirst.mockResolvedValue(round);
    outbox.append.mockRejectedValueOnce(rollbackError);
    await expect(
      writer.run((_transaction, points) => points.completeCollaborationRound(completion)),
    ).rejects.toBe(rollbackError);
  });

  it('keeps a collaboration round open when any active participant is pending', async () => {
    const databaseTransaction = {
      collaborationRound: {
        findFirst: vi.fn().mockResolvedValue({
          id: '30000000-0000-4000-8000-000000000002',
          status: 'ACTIVE',
          endDate: new Date('2026-07-31T00:00:00.000Z'),
          participants: [
            { id: 'participant-1', childId: 'child-1', rewardPointsSnapshot: 5 },
            { id: 'participant-2', childId: 'child-2', rewardPointsSnapshot: 5 },
          ],
          submissions: [
            { childId: 'child-1', status: 'APPROVED' },
            { childId: 'child-2', status: 'PENDING' },
          ],
        }),
        updateMany: vi.fn(),
      },
    };
    const writer = new PrismaPointsTransactionWriter(
      client(databaseTransaction as unknown as ReturnType<typeof transaction>),
      { append: vi.fn() },
    );

    await expect(
      writer.run((_transaction, points) =>
        points.completeCollaborationRound({
          familyId: input.familyId,
          roundId: '30000000-0000-4000-8000-000000000002',
          actorId: null,
          occurredAt: input.occurredAt,
        }),
      ),
    ).resolves.toBe(false);
    expect(databaseTransaction.collaborationRound.updateMany).not.toHaveBeenCalled();
  });

  it('replays the full transaction after a serialization conflict', async () => {
    const databaseTransaction = transaction();
    const serializationError = new Prisma.PrismaClientKnownRequestError('write conflict', {
      code: 'P2034',
      clientVersion: '6.19.2',
    });
    const prisma = client(databaseTransaction);
    vi.mocked(prisma.$transaction)
      .mockRejectedValueOnce(serializationError)
      .mockImplementation(async (operation) =>
        operation(databaseTransaction as unknown as Prisma.TransactionClient),
      );
    const writer = new PrismaPointsTransactionWriter(prisma, { append: vi.fn() });

    await expect(writer.run((_transaction, points) => points.earnCheckIn(input))).resolves.toEqual(
      pointsLog(),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });
});
