import { randomUUID } from 'node:crypto';

import { createDomainEvent } from '@familystar/shared';
import { Prisma } from '@prisma/client';
import type { PrismaClient, Redemption, Reward, Wish } from '@prisma/client';

import { PrismaOutboxWriter } from '../events/prisma-outbox.js';
import type { OutboxWriter } from '../events/outbox.js';
import { normalizeFamilySettings } from '../family-settings/service.js';
import { deriveLevelView } from '../levels/logic.js';
import { PointsTransactionRetryError } from '../points/types.js';
import type { PointsTransactionWriter } from '../points/types.js';
import { calculateRedemption, normalizePrerequisites, wishProgress } from './logic.js';
import { RewardAccessError, RewardConflictError, RewardEligibilityError } from './service.js';
import type {
  RedemptionLimits,
  RedemptionRecord,
  RewardInput,
  RewardPatch,
  RewardPrerequisites,
  RewardRecord,
  RewardRepository,
  WishRecord,
} from './types.js';

function prerequisiteJson(value: RewardPrerequisites): Prisma.InputJsonObject {
  return {
    ...(value.minLevel === undefined ? {} : { min_level: value.minLevel }),
    ...(value.redeemLimit === undefined
      ? {}
      : {
          redeem_limit: {
            ...(value.redeemLimit.perDay === undefined
              ? {}
              : { per_day: value.redeemLimit.perDay }),
            ...(value.redeemLimit.perWeek === undefined
              ? {}
              : { per_week: value.redeemLimit.perWeek }),
            ...(value.redeemLimit.perMonth === undefined
              ? {}
              : { per_month: value.redeemLimit.perMonth }),
          },
        }),
  };
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function prerequisites(value: unknown): RewardPrerequisites {
  const raw = object(value);
  const limits = object(raw.redeem_limit);
  return normalizePrerequisites({
    ...(typeof raw.min_level === 'number' ? { minLevel: raw.min_level } : {}),
    ...(Object.keys(limits).length === 0
      ? {}
      : {
          redeemLimit: {
            ...(typeof limits.per_day === 'number' ? { perDay: limits.per_day } : {}),
            ...(typeof limits.per_week === 'number' ? { perWeek: limits.per_week } : {}),
            ...(typeof limits.per_month === 'number' ? { perMonth: limits.per_month } : {}),
          },
        }),
  });
}

function rewardRecord(value: Reward): RewardRecord {
  return { ...value, prerequisites: prerequisites(value.prerequisites) };
}

function redemptionRecord(value: Redemption): RedemptionRecord {
  return { ...value, discount: value.discount.toNumber() };
}

type WishWithChild = Wish & { child?: { pointsBalance: number } };

function wishRecord(value: WishWithChild, knownBalance?: number): WishRecord {
  const pointsBalance = knownBalance ?? value.child?.pointsBalance ?? 0;
  wishProgress(pointsBalance, value.targetPoints);
  return { ...value, pointsBalance };
}

function familyDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function calendarDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function startDates(now: Date, timeZone: string) {
  const today = familyDate(now, timeZone);
  const day = calendarDate(today);
  const week = new Date(day);
  const weekday = week.getUTCDay() || 7;
  week.setUTCDate(week.getUTCDate() - weekday + 1);
  return {
    day: zonedMidnight(today, timeZone),
    week: zonedMidnight(formatDate(week), timeZone),
    month: zonedMidnight(`${today.slice(0, 7)}-01`, timeZone),
  };
}

function zonedParts(date: Date, timeZone: string): Record<string, number> {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, Number(value)]),
  );
}

function zonedMidnight(value: string, timeZone: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  const target = Date.UTC(year!, month! - 1, day!);
  const first = new Date(target);
  const actual = zonedParts(first, timeZone);
  const actualUtc = Date.UTC(
    actual.year!,
    actual.month! - 1,
    actual.day!,
    actual.hour!,
    actual.minute!,
    actual.second!,
  );
  return new Date(target + target - actualUtc);
}

export class PrismaRewardRepository implements RewardRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly pointsWriter: PointsTransactionWriter,
    private readonly outbox: OutboxWriter<Prisma.TransactionClient> = new PrismaOutboxWriter(),
    private readonly idFactory: () => string = randomUUID,
  ) {}

  async listRewards(familyId: string, activeOnly: boolean) {
    const values = await this.prisma.reward.findMany({
      where: { familyId, deletedAt: null, ...(activeOnly ? { status: 'ACTIVE' } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return values.map(rewardRecord);
  }

  async findReward(familyId: string, rewardId: string, activeOnly = false) {
    const value = await this.prisma.reward.findFirst({
      where: {
        id: rewardId,
        familyId,
        deletedAt: null,
        ...(activeOnly ? { status: 'ACTIVE' } : {}),
      },
    });
    return value ? rewardRecord(value) : null;
  }

  createReward(familyId: string, input: RewardInput) {
    return this.prisma.$transaction(
      async (transaction) => {
        await this.validateImage(transaction, familyId, input.imageMediaId);
        return rewardRecord(
          await transaction.reward.create({
            data: {
              familyId,
              name: input.name,
              description: input.description ?? null,
              imageMediaId: input.imageMediaId ?? null,
              pointsCost: input.pointsCost,
              type: input.type,
              stockTotal: input.stockTotal ?? null,
              prerequisites: prerequisiteJson(input.prerequisites ?? {}),
              status: input.status ?? 'ACTIVE',
            },
          }),
        );
      },
      { isolationLevel: 'Serializable' },
    );
  }

  updateReward(familyId: string, rewardId: string, input: RewardPatch) {
    return this.prisma.$transaction(
      async (transaction) => {
        const current = await transaction.reward.findFirst({
          where: { id: rewardId, familyId, deletedAt: null },
        });
        if (!current) return null;
        await this.validateImage(transaction, familyId, input.imageMediaId);
        const stockTotal = input.stockTotal === undefined ? current.stockTotal : input.stockTotal;
        if (stockTotal !== null && stockTotal < current.stockReserved + current.stockConsumed) {
          throw new RewardConflictError('Stock total is below reserved and consumed stock.');
        }
        if ((current.stockTotal === null) !== (stockTotal === null)) {
          const openRedemptions = await transaction.redemption.count({
            where: {
              familyId,
              rewardId: current.id,
              status: { in: ['PENDING', 'APPROVED'] },
            },
          });
          if (openRedemptions > 0 || current.stockReserved > 0) {
            throw new RewardConflictError(
              'Stock mode cannot change while redemptions are pending or reserved.',
            );
          }
        }
        return rewardRecord(
          await transaction.reward.update({
            where: { id: current.id },
            data: {
              ...input,
              ...(input.prerequisites === undefined
                ? {}
                : { prerequisites: prerequisiteJson(input.prerequisites) }),
            },
          }),
        );
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async softDeleteReward(familyId: string, rewardId: string): Promise<boolean> {
    const updated = await this.prisma.reward.updateMany({
      where: { id: rewardId, familyId, deletedAt: null },
      data: { status: 'INACTIVE', deletedAt: new Date() },
    });
    return updated.count === 1;
  }

  requestRedemption(input: Parameters<RewardRepository['requestRedemption']>[0]) {
    return this.pointsWriter.run(async (transaction, points) => {
      const repeated = await transaction.redemption.findUnique({
        where: {
          familyId_idempotencyKey: {
            familyId: input.familyId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (repeated) {
        if (repeated.requestFingerprint !== input.requestFingerprint) {
          throw new RewardConflictError('The idempotency key was used for another request.');
        }
        return redemptionRecord(repeated);
      }

      const [child, reward] = await Promise.all([
        transaction.user.findFirst({
          where: { id: input.childId, familyId: input.familyId, role: 'CHILD', deletedAt: null },
          select: {
            id: true,
            pointsBalance: true,
            pointsEarnedTotal: true,
            currentLevel: true,
            family: {
              select: { settings: true, levelConfigs: { orderBy: { level: 'asc' } } },
            },
          },
        }),
        transaction.reward.findFirst({
          where: {
            id: input.rewardId,
            familyId: input.familyId,
            status: 'ACTIVE',
            deletedAt: null,
          },
        }),
      ]);
      if (!child || !reward) {
        throw new RewardAccessError('NOT_FOUND', 'The child or reward was not found.');
      }
      const settings = normalizeFamilySettings(child.family.settings as Record<string, unknown>);
      const level = deriveLevelView({
        userId: child.id,
        pointsEarnedTotal: child.pointsEarnedTotal,
        currentLevel: child.currentLevel,
        familyAutoApproveQuota: settings.autoApproveQuota,
        configurations: child.family.levelConfigs.map((configuration) => ({
          level: configuration.level,
          name: configuration.name,
          icon: configuration.icon,
          pointsRequired: configuration.pointsRequired,
          discount: configuration.discount.toNumber(),
          autoApproveQuota: configuration.autoApproveQuota,
          wishSlots: configuration.wishSlots,
          extraDimensions: configuration.extraDimensions as never,
        })),
      });
      const rules = prerequisites(reward.prerequisites);
      if (rules.minLevel !== undefined && level.current.level < rules.minLevel) {
        throw new RewardEligibilityError('The required level has not been reached.');
      }
      const pricing = calculateRedemption(
        reward.pointsCost,
        level.benefits.discount,
        settings.autoApproveQuota,
        level.benefits.levelAutoApproveQuota,
      );
      if (child.pointsBalance < pricing.pointsSpent) {
        throw new RewardEligibilityError('The points balance is insufficient.');
      }
      await this.checkFrequency(
        transaction,
        input.familyId,
        reward.id,
        child.id,
        rules.redeemLimit,
        settings.timeZone,
        input.now,
      );
      if (reward.stockTotal !== null) {
        if (reward.stockReserved + reward.stockConsumed >= reward.stockTotal) {
          throw new RewardEligibilityError('The reward is out of stock.');
        }
        const reserved = await transaction.$executeRaw(Prisma.sql`
          UPDATE "rewards"
          SET "stock_reserved" = "stock_reserved" + 1,
              "updated_at" = ${input.now}
          WHERE "id" = ${reward.id}::uuid
            AND "family_id" = ${input.familyId}::uuid
            AND "deleted_at" IS NULL
            AND "stock_total" IS NOT NULL
            AND "stock_reserved" + "stock_consumed" < "stock_total"
        `);
        if (reserved !== 1) throw new RewardEligibilityError('The reward is out of stock.');
      }
      const id = this.idFactory();
      await points.redeem({
        familyId: input.familyId,
        childId: child.id,
        redemptionId: id,
        points: pricing.pointsSpent,
        actorId: child.id,
        occurredAt: input.now,
      });
      let redemption: Redemption;
      try {
        redemption = await transaction.redemption.create({
          data: {
            id,
            familyId: input.familyId,
            rewardId: reward.id,
            childId: child.id,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: input.requestFingerprint,
            listedPointsCost: reward.pointsCost,
            discount: new Prisma.Decimal(level.benefits.discount),
            pointsSpent: pricing.pointsSpent,
            status: pricing.autoApproved ? 'APPROVED' : 'PENDING',
            isAutoApproved: pricing.autoApproved,
            approvedAt: pricing.autoApproved ? input.now : null,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new PointsTransactionRetryError(error);
        }
        throw error;
      }
      await this.event(
        transaction,
        'rewards.redemption.requested.v1',
        redemption,
        child.id,
        input.now,
      );
      if (pricing.autoApproved) {
        await this.event(
          transaction,
          'rewards.redemption.approved.v1',
          redemption,
          child.id,
          input.now,
        );
      }
      return redemptionRecord(redemption);
    });
  }

  async listRedemptions(familyId: string, childId?: string) {
    const values = await this.prisma.redemption.findMany({
      where: { familyId, ...(childId === undefined ? {} : { childId }) },
      orderBy: { createdAt: 'desc' },
    });
    return values.map(redemptionRecord);
  }

  approveRedemption(input: Parameters<RewardRepository['approveRedemption']>[0]) {
    return this.pointsWriter.run(async (transaction) => {
      const current = await this.redemption(transaction, input.familyId, input.redemptionId);
      if (current.status === 'APPROVED') return redemptionRecord(current);
      if (current.status !== 'PENDING')
        throw new RewardConflictError('The redemption cannot be approved.');
      const value = await transaction.redemption.update({
        where: { id: current.id },
        data: { status: 'APPROVED', approvedById: input.parentId, approvedAt: input.now },
      });
      await this.event(
        transaction,
        'rewards.redemption.approved.v1',
        value,
        input.parentId,
        input.now,
      );
      return redemptionRecord(value);
    });
  }

  fulfillRedemption(input: Parameters<RewardRepository['fulfillRedemption']>[0]) {
    return this.pointsWriter.run(async (transaction) => {
      const current = await this.redemption(transaction, input.familyId, input.redemptionId);
      if (current.status === 'FULFILLED') return redemptionRecord(current);
      if (current.status !== 'APPROVED')
        throw new RewardConflictError('The redemption cannot be fulfilled.');
      const reward = await transaction.reward.findFirst({
        where: { id: current.rewardId, familyId: input.familyId },
      });
      if (!reward) throw new RewardAccessError('NOT_FOUND', 'The reward was not found.');
      if (reward.stockTotal !== null) {
        const updated = await transaction.reward.updateMany({
          where: { id: reward.id, familyId: input.familyId, stockReserved: { gt: 0 } },
          data: { stockReserved: { decrement: 1 }, stockConsumed: { increment: 1 } },
        });
        if (updated.count !== 1) throw new RewardConflictError('Reserved stock is unavailable.');
      }
      const value = await transaction.redemption.update({
        where: { id: current.id },
        data: { status: 'FULFILLED', fulfilledById: input.parentId, fulfilledAt: input.now },
      });
      await this.event(
        transaction,
        'rewards.redemption.fulfilled.v1',
        value,
        input.parentId,
        input.now,
      );
      return redemptionRecord(value);
    });
  }

  rejectRedemption(input: Parameters<RewardRepository['rejectRedemption']>[0]) {
    return this.pointsWriter.run(async (transaction, points) => {
      const current = await this.redemption(transaction, input.familyId, input.redemptionId);
      if (current.status === 'REJECTED') {
        await points.refund({
          familyId: input.familyId,
          childId: current.childId,
          redemptionId: current.id,
          points: current.pointsSpent,
          actorId: input.parentId,
          occurredAt: input.now,
        });
        return redemptionRecord(current);
      }
      if (current.status !== 'PENDING')
        throw new RewardConflictError('The redemption cannot be rejected.');
      const reward = await transaction.reward.findFirst({
        where: { id: current.rewardId, familyId: input.familyId },
      });
      if (!reward) throw new RewardAccessError('NOT_FOUND', 'The reward was not found.');
      if (reward.stockTotal !== null) {
        const updated = await transaction.reward.updateMany({
          where: { id: reward.id, familyId: input.familyId, stockReserved: { gt: 0 } },
          data: { stockReserved: { decrement: 1 } },
        });
        if (updated.count !== 1) throw new RewardConflictError('Reserved stock is unavailable.');
      }
      await points.refund({
        familyId: input.familyId,
        childId: current.childId,
        redemptionId: current.id,
        points: current.pointsSpent,
        actorId: input.parentId,
        occurredAt: input.now,
      });
      const value = await transaction.redemption.update({
        where: { id: current.id },
        data: {
          status: 'REJECTED',
          rejectedById: input.parentId,
          rejectedAt: input.now,
          rejectionReason: input.reason,
        },
      });
      await this.event(
        transaction,
        'rewards.redemption.rejected.v1',
        value,
        input.parentId,
        input.now,
      );
      return redemptionRecord(value);
    });
  }

  async listWishes(familyId: string, childId?: string) {
    const values = await this.prisma.wish.findMany({
      where: {
        familyId,
        deletedAt: null,
        child: { familyId, role: 'CHILD', deletedAt: null },
        ...(childId === undefined ? {} : { childId }),
      },
      include: { child: { select: { pointsBalance: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return values.map((value) => wishRecord(value));
  }

  createWish(input: Parameters<RewardRepository['createWish']>[0]) {
    return this.pointsWriter.run(async (transaction) => {
      const child = await transaction.user.findFirst({
        where: { id: input.childId, familyId: input.familyId, role: 'CHILD', deletedAt: null },
        select: {
          pointsBalance: true,
          pointsEarnedTotal: true,
          currentLevel: true,
          family: { select: { settings: true, levelConfigs: { orderBy: { level: 'asc' } } } },
        },
      });
      if (!child) throw new RewardAccessError('NOT_FOUND', 'The child was not found.');
      const settings = normalizeFamilySettings(child.family.settings as Record<string, unknown>);
      const level = deriveLevelView({
        userId: input.childId,
        pointsEarnedTotal: child.pointsEarnedTotal,
        currentLevel: child.currentLevel,
        familyAutoApproveQuota: settings.autoApproveQuota,
        configurations: child.family.levelConfigs.map((configuration) => ({
          level: configuration.level,
          name: configuration.name,
          icon: configuration.icon,
          pointsRequired: configuration.pointsRequired,
          discount: configuration.discount.toNumber(),
          autoApproveQuota: configuration.autoApproveQuota,
          wishSlots: configuration.wishSlots,
          extraDimensions: configuration.extraDimensions as never,
        })),
      });
      const active = await transaction.wish.count({
        where: {
          familyId: input.familyId,
          childId: input.childId,
          status: 'ACTIVE',
          deletedAt: null,
        },
      });
      if (active >= level.benefits.wishSlots) {
        throw new RewardEligibilityError('The active wish slot limit has been reached.');
      }
      const value = await transaction.wish.create({
        data: {
          familyId: input.familyId,
          childId: input.childId,
          title: input.title,
          description: input.description ?? null,
          targetPoints: input.targetPoints,
        },
      });
      return wishRecord(value, child.pointsBalance);
    });
  }

  cancelWish(input: Parameters<RewardRepository['cancelWish']>[0]) {
    return this.pointsWriter.run(async (transaction) => {
      const current = await transaction.wish.findFirst({
        where: {
          id: input.wishId,
          familyId: input.familyId,
          childId: input.childId,
          deletedAt: null,
        },
        include: { child: { select: { pointsBalance: true } } },
      });
      if (!current) throw new RewardAccessError('NOT_FOUND', 'The wish was not found.');
      if (current.status === 'CANCELLED') return wishRecord(current);
      if (current.status !== 'ACTIVE')
        throw new RewardConflictError('The wish cannot be cancelled.');
      const value = await transaction.wish.update({
        where: { id: current.id },
        data: { status: 'CANCELLED', cancelledAt: input.now },
        include: { child: { select: { pointsBalance: true } } },
      });
      return wishRecord(value);
    });
  }

  adoptWish(input: Parameters<RewardRepository['adoptWish']>[0]) {
    return this.pointsWriter.run(async (transaction) => {
      const wish = await transaction.wish.findFirst({
        where: { id: input.wishId, familyId: input.familyId, deletedAt: null },
        include: { child: { select: { pointsBalance: true } } },
      });
      if (!wish) throw new RewardAccessError('NOT_FOUND', 'The wish was not found.');
      if (wish.status !== 'ACTIVE') throw new RewardConflictError('The wish cannot be adopted.');
      await this.validateImage(transaction, input.familyId, input.reward.imageMediaId);
      const reward = await transaction.reward.create({
        data: {
          familyId: input.familyId,
          name: wish.title,
          description: wish.description,
          pointsCost: wish.targetPoints,
          imageMediaId: input.reward.imageMediaId ?? null,
          type: input.reward.type,
          stockTotal: input.reward.stockTotal ?? null,
          prerequisites: prerequisiteJson(input.reward.prerequisites ?? {}),
          status: input.reward.status ?? 'ACTIVE',
        },
      });
      const transition = await transaction.wish.updateMany({
        where: {
          id: wish.id,
          familyId: input.familyId,
          status: 'ACTIVE',
          deletedAt: null,
        },
        data: { status: 'ADOPTED', adoptedRewardId: reward.id, adoptedAt: input.now },
      });
      if (transition.count !== 1) throw new RewardConflictError('The wish cannot be adopted.');
      const adopted = await transaction.wish.findFirst({
        where: { id: wish.id, familyId: input.familyId, deletedAt: null },
        include: { child: { select: { pointsBalance: true } } },
      });
      if (!adopted) throw new RewardConflictError('The adopted wish could not be read.');
      return { wish: wishRecord(adopted), reward: rewardRecord(reward) };
    });
  }

  private async validateImage(
    transaction: Prisma.TransactionClient,
    familyId: string,
    imageMediaId: string | null | undefined,
  ): Promise<void> {
    if (!imageMediaId) return;
    const image = await transaction.mediaAsset.findFirst({
      where: {
        id: imageMediaId,
        familyId,
        type: 'IMAGE',
        uploadStatus: 'READY',
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!image) throw new RewardConflictError('The reward image must be a ready family image.');
  }

  private async redemption(
    transaction: Prisma.TransactionClient,
    familyId: string,
    redemptionId: string,
  ) {
    const value = await transaction.redemption.findFirst({ where: { id: redemptionId, familyId } });
    if (!value) throw new RewardAccessError('NOT_FOUND', 'The redemption was not found.');
    return value;
  }

  private async checkFrequency(
    transaction: Prisma.TransactionClient,
    familyId: string,
    rewardId: string,
    childId: string,
    limits: RedemptionLimits | undefined,
    timeZone: string,
    now: Date,
  ): Promise<void> {
    if (!limits) return;
    const starts = startDates(now, timeZone);
    for (const [period, maximum] of [
      ['day', limits.perDay],
      ['week', limits.perWeek],
      ['month', limits.perMonth],
    ] as const) {
      if (maximum === undefined) continue;
      const count = await transaction.redemption.count({
        where: {
          familyId,
          rewardId,
          childId,
          status: { not: 'REJECTED' },
          createdAt: { gte: starts[period] },
        },
      });
      if (count >= maximum)
        throw new RewardEligibilityError(`The ${period} redemption limit was reached.`);
    }
  }

  private event(
    transaction: Prisma.TransactionClient,
    eventName:
      | 'rewards.redemption.requested.v1'
      | 'rewards.redemption.approved.v1'
      | 'rewards.redemption.rejected.v1'
      | 'rewards.redemption.fulfilled.v1',
    redemption: Redemption,
    actorId: string,
    occurredAt: Date,
  ): Promise<void> {
    return this.outbox.append(
      transaction,
      createDomainEvent({
        event_id: this.idFactory(),
        event_name: eventName,
        occurred_at: occurredAt.toISOString(),
        family_id: redemption.familyId,
        actor_id: actorId,
        correlation_id: redemption.id,
        payload: {
          redemption_id: redemption.id,
          reward_id: redemption.rewardId,
          child_id: redemption.childId,
          points_spent: redemption.pointsSpent,
          status: redemption.status,
        },
      }),
    );
  }
}
