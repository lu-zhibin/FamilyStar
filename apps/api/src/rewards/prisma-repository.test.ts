import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { PointsTransactionRetryError } from '../points/types.js';
import type { PointsAwardPort, PointsTransactionWriter } from '../points/types.js';
import { PrismaRewardRepository } from './prisma-repository.js';
import { RewardAccessError, RewardConflictError, RewardEligibilityError } from './service.js';

const now = new Date('2026-07-31T12:00:00.000Z');
const familyId = '10000000-0000-4000-8000-000000000001';
const childId = '20000000-0000-4000-8000-000000000001';
const rewardId = '30000000-0000-4000-8000-000000000001';
const redemptionId = '40000000-0000-4000-8000-000000000001';
const parentId = '50000000-0000-4000-8000-000000000001';

function redemption(overrides: Record<string, unknown> = {}) {
  return {
    id: redemptionId,
    familyId,
    rewardId,
    childId,
    idempotencyKey: 'request-1',
    requestFingerprint: 'fingerprint-1',
    listedPointsCost: 30,
    discount: new Prisma.Decimal(0.8),
    pointsSpent: 24,
    status: 'APPROVED' as const,
    isAutoApproved: true,
    approvedById: null,
    approvedAt: now,
    rejectedById: null,
    rejectedAt: null,
    rejectionReason: null,
    fulfilledById: null,
    fulfilledAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function reward(overrides: Record<string, unknown> = {}) {
  return {
    id: rewardId,
    familyId,
    name: 'Book',
    description: null,
    imageMediaId: null,
    pointsCost: 30,
    type: 'PHYSICAL' as const,
    stockTotal: 2,
    stockReserved: 0,
    stockConsumed: 0,
    prerequisites: { min_level: 2, redeem_limit: { per_day: 1 } },
    status: 'ACTIVE' as const,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function child(overrides: Record<string, unknown> = {}) {
  return {
    id: childId,
    pointsBalance: 100,
    pointsEarnedTotal: 50,
    currentLevel: 2,
    family: {
      settings: { timeZone: 'Asia/Shanghai', autoApproveQuota: 20 },
      levelConfigs: [
        {
          level: 1,
          name: 'One',
          icon: 'one',
          pointsRequired: 0,
          discount: new Prisma.Decimal(1),
          autoApproveQuota: 0,
          wishSlots: 1,
          extraDimensions: null,
        },
        {
          level: 2,
          name: 'Two',
          icon: 'two',
          pointsRequired: 30,
          discount: new Prisma.Decimal(0.8),
          autoApproveQuota: 30,
          wishSlots: 2,
          extraDimensions: null,
        },
      ],
    },
    ...overrides,
  };
}

function setup(transactionOverrides: Record<string, unknown> = {}) {
  const transaction = {
    redemption: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve(redemption(data))),
      update: vi.fn(),
    },
    reward: {
      findFirst: vi.fn().mockResolvedValue(reward()),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: { findFirst: vi.fn().mockResolvedValue(child()) },
    wish: {
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    mediaAsset: { findFirst: vi.fn() },
    $executeRaw: vi.fn().mockResolvedValue(1),
    ...transactionOverrides,
  };
  const points: PointsAwardPort = {
    earnCheckIn: vi.fn(),
    completeCollaborationRound: vi.fn(),
    redeem: vi.fn().mockResolvedValue({}),
    refund: vi.fn().mockResolvedValue({}),
  } as unknown as PointsAwardPort;
  const writer: PointsTransactionWriter = {
    run: vi.fn((work) => work(transaction as never, points)),
  };
  const prisma = {
    reward: transaction.reward,
    redemption: transaction.redemption,
    wish: transaction.wish,
    $transaction: vi.fn((work) => work(transaction)),
  } as unknown as PrismaClient;
  const outbox = { append: vi.fn().mockResolvedValue(undefined) };
  const repository = new PrismaRewardRepository(prisma, writer, outbox, () => redemptionId);
  return { transaction, points, outbox, repository };
}

describe('PrismaRewardRepository reward catalog', () => {
  it('scopes CRUD operations to the family and accepts ready family images', async () => {
    const { transaction, repository } = setup();
    transaction.reward.findMany.mockResolvedValue([reward()]);
    transaction.reward.findFirst.mockResolvedValue(reward());
    transaction.reward.create.mockResolvedValue(reward({ stockTotal: 0 }));
    transaction.reward.update.mockResolvedValue(reward({ status: 'INACTIVE' }));
    transaction.mediaAsset.findFirst.mockResolvedValue({ id: 'image-1' });

    await expect(repository.listRewards(familyId, true)).resolves.toHaveLength(1);
    await expect(repository.findReward(familyId, rewardId, true)).resolves.toMatchObject({
      id: rewardId,
    });
    await expect(
      repository.createReward(familyId, {
        name: 'Book',
        imageMediaId: 'image-1',
        pointsCost: 30,
        type: 'PHYSICAL',
        stockTotal: 0,
      }),
    ).resolves.toMatchObject({ stockTotal: 0 });
    await expect(
      repository.updateReward(familyId, rewardId, { status: 'INACTIVE' }),
    ).resolves.toMatchObject({ status: 'INACTIVE' });
    await expect(repository.softDeleteReward(familyId, rewardId)).resolves.toBe(true);

    expect(transaction.reward.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId, deletedAt: null, status: 'ACTIVE' } }),
    );
    expect(transaction.mediaAsset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ familyId, type: 'IMAGE', uploadStatus: 'READY' }),
      }),
    );
  });

  it('blocks inventory mode changes while a redemption remains open', async () => {
    const { transaction, repository } = setup();
    transaction.reward.findFirst.mockResolvedValue(reward({ stockTotal: null }));
    transaction.redemption.count.mockResolvedValue(1);

    await expect(repository.updateReward(familyId, rewardId, { stockTotal: 3 })).rejects.toThrow(
      'Stock mode cannot change',
    );
    expect(transaction.reward.update).not.toHaveBeenCalled();
  });

  it('allows inventory mode changes after all redemptions reach a terminal state', async () => {
    const { transaction, repository } = setup();
    transaction.reward.findFirst.mockResolvedValue(reward({ stockTotal: null }));
    transaction.redemption.count.mockResolvedValue(0);
    transaction.reward.update.mockResolvedValue(reward({ stockTotal: 3 }));

    await expect(
      repository.updateReward(familyId, rewardId, { stockTotal: 3 }),
    ).resolves.toMatchObject({ stockTotal: 3 });
  });
});

describe('PrismaRewardRepository redemption transactions', () => {
  it('atomically reserves finite stock, redeems points and creates an auto-approved redemption', async () => {
    const { transaction, points, outbox, repository } = setup();

    const result = await repository.requestRedemption({
      familyId,
      childId,
      rewardId,
      idempotencyKey: 'request-1',
      requestFingerprint: 'fingerprint-1',
      now,
    });

    expect(transaction.redemption.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          familyId,
          rewardId,
          childId,
          status: { not: 'REJECTED' },
        }),
      }),
    );
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(points.redeem).toHaveBeenCalledWith({
      familyId,
      childId,
      redemptionId,
      points: 24,
      actorId: childId,
      occurredAt: now,
    });
    expect(transaction.redemption.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        pointsSpent: 24,
        status: 'APPROVED',
        isAutoApproved: true,
        approvedAt: now,
      }),
    });
    expect(outbox.append).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('APPROVED');
  });

  it('replays the same fingerprint without repeating eligibility or balance work', async () => {
    const { transaction, points, repository } = setup();
    transaction.redemption.findUnique.mockResolvedValue(redemption());

    await expect(
      repository.requestRedemption({
        familyId,
        childId,
        rewardId,
        idempotencyKey: 'request-1',
        requestFingerprint: 'fingerprint-1',
        now,
      }),
    ).resolves.toMatchObject({ id: redemptionId });
    expect(transaction.user.findFirst).not.toHaveBeenCalled();
    expect(points.redeem).not.toHaveBeenCalled();
  });

  it('marks a concurrent idempotency-key conflict for transaction replay', async () => {
    const { transaction, repository } = setup();
    transaction.redemption.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      repository.requestRedemption({
        familyId,
        childId,
        rewardId,
        idempotencyKey: 'request-1',
        requestFingerprint: 'fingerprint-1',
        now,
      }),
    ).rejects.toBeInstanceOf(PointsTransactionRetryError);
  });

  it('propagates an outbox failure from the redemption transaction', async () => {
    const { outbox, repository } = setup();
    vi.mocked(outbox.append).mockRejectedValue(new Error('outbox unavailable'));

    await expect(
      repository.requestRedemption({
        familyId,
        childId,
        rewardId,
        idempotencyKey: 'request-1',
        requestFingerprint: 'fingerprint-1',
        now,
      }),
    ).rejects.toThrow('outbox unavailable');
  });

  it('rejects reuse of an idempotency key for another request fingerprint', async () => {
    const { transaction, repository } = setup();
    transaction.redemption.findUnique.mockResolvedValue(redemption());

    await expect(
      repository.requestRedemption({
        familyId,
        childId,
        rewardId: 'another-reward',
        idempotencyKey: 'request-1',
        requestFingerprint: 'another-fingerprint',
        now,
      }),
    ).rejects.toBeInstanceOf(RewardConflictError);
  });

  it.each([
    ['balance', child({ pointsBalance: 10 }), reward(), 'insufficient'],
    ['level', child({ currentLevel: 1, pointsEarnedTotal: 0 }), reward(), 'level'],
    ['stock', child(), reward({ stockTotal: 1, stockReserved: 1 }), 'stock'],
  ])('rejects ineligible redemption by %s', async (_case, childValue, rewardValue, message) => {
    const { transaction, repository } = setup();
    transaction.user.findFirst.mockResolvedValue(childValue);
    transaction.reward.findFirst.mockResolvedValue(rewardValue);

    await expect(
      repository.requestRedemption({
        familyId,
        childId,
        rewardId,
        idempotencyKey: 'request-1',
        requestFingerprint: 'fingerprint-1',
        now,
      }),
    ).rejects.toEqual(expect.objectContaining({ message: expect.stringContaining(message) }));
  });

  it('enforces a family-calendar frequency limit', async () => {
    const { transaction, repository } = setup();
    transaction.redemption.count.mockResolvedValue(1);

    await expect(
      repository.requestRedemption({
        familyId,
        childId,
        rewardId,
        idempotencyKey: 'request-1',
        requestFingerprint: 'fingerprint-1',
        now,
      }),
    ).rejects.toBeInstanceOf(RewardEligibilityError);
  });

  it('rejects once, releases finite stock and issues one idempotent refund', async () => {
    const pending = redemption({
      status: 'PENDING',
      isAutoApproved: false,
      approvedAt: null,
    });
    const rejected = redemption({
      status: 'REJECTED',
      isAutoApproved: false,
      approvedAt: null,
      rejectedById: parentId,
      rejectedAt: now,
      rejectionReason: 'Unavailable',
    });
    const { transaction, points, outbox, repository } = setup();
    transaction.redemption.findFirst.mockResolvedValue(pending);
    transaction.redemption.update.mockResolvedValue(rejected);

    await expect(
      repository.rejectRedemption({
        familyId,
        redemptionId,
        parentId,
        reason: 'Unavailable',
        now,
      }),
    ).resolves.toMatchObject({ status: 'REJECTED' });
    expect(transaction.reward.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stockReserved: { decrement: 1 } } }),
    );
    expect(points.refund).toHaveBeenCalledTimes(1);
    expect(outbox.append).toHaveBeenCalledTimes(1);

    transaction.redemption.findFirst.mockResolvedValue(rejected);
    await repository.rejectRedemption({
      familyId,
      redemptionId,
      parentId,
      reason: 'Unavailable',
      now,
    });
    expect(points.refund).toHaveBeenCalledTimes(2);
    expect(transaction.redemption.update).toHaveBeenCalledTimes(1);
  });

  it('moves reserved stock to consumed when fulfilling and replays the terminal result', async () => {
    const fulfilled = redemption({
      status: 'FULFILLED',
      fulfilledById: parentId,
      fulfilledAt: now,
    });
    const { transaction, repository } = setup();
    transaction.redemption.findFirst
      .mockResolvedValueOnce(redemption())
      .mockResolvedValue(fulfilled);
    transaction.redemption.update.mockResolvedValue(fulfilled);

    await repository.fulfillRedemption({
      familyId,
      redemptionId,
      parentId,
      now,
    });
    expect(transaction.reward.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { stockReserved: { decrement: 1 }, stockConsumed: { increment: 1 } },
      }),
    );
    await repository.fulfillRedemption({
      familyId,
      redemptionId,
      parentId,
      now,
    });
    expect(transaction.redemption.update).toHaveBeenCalledTimes(1);
  });

  it('approves a pending request once and emits the approval event', async () => {
    const pending = redemption({ status: 'PENDING', isAutoApproved: false, approvedAt: null });
    const approved = redemption({ isAutoApproved: false, approvedById: parentId });
    const { transaction, outbox, repository } = setup();
    transaction.redemption.findFirst.mockResolvedValue(pending);
    transaction.redemption.update.mockResolvedValue(approved);

    await expect(
      repository.approveRedemption({ familyId, redemptionId, parentId, now }),
    ).resolves.toMatchObject({ status: 'APPROVED', approvedById: parentId });
    expect(outbox.append).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({ event_name: 'rewards.redemption.approved.v1' }),
    );
  });
});

describe('PrismaRewardRepository wish transactions', () => {
  it('enforces current-level active wish slots', async () => {
    const { transaction, repository } = setup();
    transaction.wish.count.mockResolvedValue(2);

    await expect(
      repository.createWish({
        familyId,
        childId,
        title: 'Telescope',
        targetPoints: 100,
        now,
      }),
    ).rejects.toBeInstanceOf(RewardEligibilityError);
  });

  it('adopts an active wish as a reward in the same transaction', async () => {
    const wish = {
      id: 'wish-1',
      familyId,
      childId,
      title: 'Telescope',
      description: 'See stars',
      targetPoints: 100,
      status: 'ACTIVE' as const,
      adoptedRewardId: null,
      cancelledAt: null,
      adoptedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      child: { pointsBalance: 40 },
    };
    const adopted = {
      ...wish,
      status: 'ADOPTED' as const,
      adoptedRewardId: rewardId,
      adoptedAt: now,
    };
    const { transaction, outbox, repository } = setup();
    transaction.wish.findFirst.mockResolvedValueOnce(wish).mockResolvedValueOnce(adopted);
    transaction.reward.create.mockResolvedValue(reward({ name: wish.title, pointsCost: 100 }));

    const result = await repository.adoptWish({
      familyId,
      parentId,
      wishId: wish.id,
      reward: { type: 'EXPERIENCE' },
      now,
    });

    expect(transaction.reward.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Telescope', pointsCost: 100, type: 'EXPERIENCE' }),
    });
    expect(transaction.wish.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ familyId, status: 'ACTIVE', deletedAt: null }),
        data: { status: 'ADOPTED', adoptedRewardId: rewardId, adoptedAt: now },
      }),
    );
    expect(result.wish.pointsBalance).toBe(40);
    expect(outbox.append).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        event_name: 'rewards.wish.adopted.v1',
        payload: expect.objectContaining({ wish_id: wish.id, child_id: childId }),
      }),
    );
  });

  it('rejects cross-family adoption before creating a reward', async () => {
    const { transaction, repository } = setup();
    transaction.wish.findFirst.mockResolvedValue(null);

    await expect(
      repository.adoptWish({
        familyId: '10000000-0000-4000-8000-000000000002',
        parentId,
        wishId: 'wish-1',
        reward: { type: 'EXPERIENCE' },
        now,
      }),
    ).rejects.toBeInstanceOf(RewardAccessError);

    expect(transaction.reward.create).not.toHaveBeenCalled();
    expect(transaction.wish.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a concurrent adoption so the transaction rolls back its reward', async () => {
    const activeWish = {
      id: 'wish-1',
      familyId,
      childId,
      title: 'Telescope',
      description: null,
      targetPoints: 100,
      status: 'ACTIVE' as const,
      adoptedRewardId: null,
      cancelledAt: null,
      adoptedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      child: { pointsBalance: 40 },
    };
    const { transaction, repository } = setup();
    transaction.wish.findFirst.mockResolvedValue(activeWish);
    transaction.reward.create.mockResolvedValue(reward({ name: activeWish.title }));
    transaction.wish.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.adoptWish({
        familyId,
        parentId,
        wishId: activeWish.id,
        reward: { type: 'EXPERIENCE' },
        now,
      }),
    ).rejects.toBeInstanceOf(RewardConflictError);

    expect(transaction.wish.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ familyId, status: 'ACTIVE', deletedAt: null }),
      }),
    );
    expect(transaction.wish.findFirst).toHaveBeenCalledTimes(1);
  });

  it('creates and cancels a wish while preserving live balance progress', async () => {
    const activeWish = {
      id: 'wish-1',
      familyId,
      childId,
      title: 'Telescope',
      description: null,
      targetPoints: 100,
      status: 'ACTIVE' as const,
      adoptedRewardId: null,
      cancelledAt: null,
      adoptedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      child: { pointsBalance: 40 },
    };
    const cancelled = { ...activeWish, status: 'CANCELLED' as const, cancelledAt: now };
    const { transaction, outbox, repository } = setup();
    transaction.wish.count.mockResolvedValue(0);
    transaction.wish.create.mockResolvedValue(activeWish);
    transaction.wish.findFirst.mockResolvedValue(activeWish);
    transaction.wish.update.mockResolvedValue(cancelled);

    await expect(
      repository.createWish({ familyId, childId, title: 'Telescope', targetPoints: 100, now }),
    ).resolves.toMatchObject({ pointsBalance: 100, status: 'ACTIVE' });
    await expect(
      repository.cancelWish({ familyId, childId, wishId: 'wish-1', now }),
    ).resolves.toMatchObject({ pointsBalance: 40, status: 'CANCELLED', cancelledAt: now });
    expect(outbox.append).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        event_name: 'rewards.wish.cancelled.v1',
        payload: expect.objectContaining({ wish_id: 'wish-1', child_id: childId }),
      }),
    );
  });
});
