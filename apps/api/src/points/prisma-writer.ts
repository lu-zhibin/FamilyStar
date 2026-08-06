import { randomUUID } from 'node:crypto';

import { createDomainEvent } from '@familystar/shared';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

import { CHECK_IN_APPROVED_EVENT, type CheckInApprovedEventPayload } from '../check-ins/events.js';
import { PrismaOutboxWriter } from '../events/prisma-outbox.js';
import type { OutboxWriter } from '../events/outbox.js';
import { normalizeFamilySettings } from '../family-settings/service.js';
import { deriveEligibleLevel } from '../levels/logic.js';
import { calculatePointsChange, calculateStreakAward } from './logic.js';
import { PointsTransactionRetryError } from './types.js';
import type {
  CheckInPointsInput,
  CollaborationRoundPointsInput,
  PointsAwardPort,
  PointsLogRecord,
  PointsTransactionWriter,
  RedemptionPointsInput,
} from './types.js';

const MAX_TRANSACTION_ATTEMPTS = 3;

class PointsVersionConflictError extends Error {
  constructor() {
    super('Points balance version changed.');
    this.name = 'PointsVersionConflictError';
  }
}

class PointsBusinessKeyConflictError extends Error {
  constructor(
    readonly key: PointsBusinessKey,
    readonly originalError: unknown,
  ) {
    super('Points business key already exists.');
    this.name = 'PointsBusinessKeyConflictError';
  }
}

type PointsBusinessKey = Readonly<{
  familyId: string;
  userId: string;
  type: 'EARN' | 'REDEEM' | 'REFUND';
  businessType: 'check_in' | 'collaboration_round' | 'redemption';
  businessId: string;
}>;

type EarnInput = PointsBusinessKey &
  Readonly<{
    basePoints: number;
    awardDate: string;
    actorId: string | null;
    occurredAt: Date;
    snapshot(points: number, multiplier: number): Promise<boolean>;
  }>;

export class PointsTransactionConflictError extends Error {
  readonly code = 'CONFLICT' as const;
  readonly retryable = true;

  constructor() {
    super('Points balance changed repeatedly. Retry the operation.');
    this.name = 'PointsTransactionConflictError';
  }
}

function record(value: {
  id: string;
  familyId: string;
  userId: string;
  type: 'EARN' | 'REDEEM' | 'REFUND' | 'MANUAL';
  businessType: string;
  businessId: string;
  delta: number;
  balanceBefore: number;
  balanceAfter: number;
  earnedTotalAfter: number;
  createdAt: Date;
}): PointsLogRecord {
  return value;
}

export class PrismaPointsTransactionWriter implements PointsTransactionWriter {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly outbox: OutboxWriter<Prisma.TransactionClient> = new PrismaOutboxWriter(),
    private readonly eventIdFactory: () => string = randomUUID,
  ) {}

  async run<Result>(
    work: (transaction: Prisma.TransactionClient, points: PointsAwardPort) => Promise<Result>,
  ): Promise<Result> {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          (transaction) =>
            work(transaction, {
              earnCheckIn: (input) => this.earnCheckIn(transaction, input),
              completeCollaborationRound: (input) =>
                this.completeCollaborationRound(transaction, input),
              redeem: (input) => this.changeRedemption(transaction, input, 'REDEEM'),
              refund: (input) => this.changeRedemption(transaction, input, 'REFUND'),
            }),
          { isolationLevel: 'Serializable' },
        );
      } catch (error) {
        if (error instanceof PointsBusinessKeyConflictError) {
          const duplicate = await this.findChange(error.key);
          if (!duplicate) throw error.originalError;
          if (attempt < MAX_TRANSACTION_ATTEMPTS) continue;
          throw new PointsTransactionConflictError();
        }
        if (error instanceof PointsVersionConflictError) {
          if (attempt < MAX_TRANSACTION_ATTEMPTS) continue;
          throw new PointsTransactionConflictError();
        }
        if (error instanceof PointsTransactionRetryError) {
          if (attempt < MAX_TRANSACTION_ATTEMPTS) continue;
          throw new PointsTransactionConflictError();
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          if (attempt < MAX_TRANSACTION_ATTEMPTS) continue;
          throw new PointsTransactionConflictError();
        }
        throw error;
      }
    }
    throw new PointsTransactionConflictError();
  }

  private async earnCheckIn(
    transaction: Prisma.TransactionClient,
    input: CheckInPointsInput,
  ): Promise<PointsLogRecord> {
    return this.earn(transaction, {
      familyId: input.familyId,
      userId: input.userId,
      type: 'EARN',
      businessType: 'check_in',
      businessId: input.checkInId,
      basePoints: input.basePoints,
      awardDate: input.awardDate,
      actorId: input.actorId,
      occurredAt: input.occurredAt,
      snapshot: async (points, multiplier) => {
        const updated = await transaction.checkIn.updateMany({
          where: {
            id: input.checkInId,
            familyId: input.familyId,
            childId: input.userId,
            deletedAt: null,
          },
          data: { pointsEarned: points, streakMultiplier: new Prisma.Decimal(multiplier) },
        });
        return updated.count === 1;
      },
    });
  }

  private async completeCollaborationRound(
    transaction: Prisma.TransactionClient,
    input: CollaborationRoundPointsInput,
  ): Promise<boolean> {
    const round = await transaction.collaborationRound.findFirst({
      where: { id: input.roundId, familyId: input.familyId },
      select: {
        id: true,
        status: true,
        endDate: true,
        participants: {
          where: { status: 'ACTIVE' },
          select: { id: true, childId: true, rewardPointsSnapshot: true },
        },
        submissions: { select: { childId: true, status: true } },
      },
    });
    if (!round || round.status === 'COMPLETED' || round.participants.length === 0) return false;
    const statuses = new Map(round.submissions.map(({ childId, status }) => [childId, status]));
    if (!round.participants.every(({ childId }) => statuses.get(childId) === 'APPROVED')) {
      return false;
    }

    const completed = await transaction.collaborationRound.updateMany({
      where: { id: round.id, familyId: input.familyId, status: { not: 'COMPLETED' } },
      data: { status: 'COMPLETED' },
    });
    if (completed.count !== 1) return false;

    await this.outbox.append(
      transaction,
      createDomainEvent({
        event_id: this.eventIdFactory(),
        event_name: 'check-in.collaboration.completed.v1',
        occurred_at: input.occurredAt.toISOString(),
        family_id: input.familyId,
        actor_id: input.actorId,
        correlation_id: round.id,
        payload: {
          round_id: round.id,
          participant_count: round.participants.length,
        },
      }),
    );

    const awardDate = round.endDate.toISOString().slice(0, 10);
    for (const participant of round.participants) {
      await this.earn(transaction, {
        familyId: input.familyId,
        userId: participant.childId,
        type: 'EARN',
        businessType: 'collaboration_round',
        businessId: round.id,
        basePoints: participant.rewardPointsSnapshot,
        awardDate,
        actorId: input.actorId,
        occurredAt: input.occurredAt,
        snapshot: async (points, multiplier) => {
          const updated = await transaction.collaborationRoundParticipant.updateMany({
            where: {
              id: participant.id,
              familyId: input.familyId,
              roundId: round.id,
              childId: participant.childId,
              status: 'ACTIVE',
            },
            data: { pointsEarned: points, streakMultiplier: new Prisma.Decimal(multiplier) },
          });
          return updated.count === 1;
        },
      });
    }
    return true;
  }

  private async earn(
    transaction: Prisma.TransactionClient,
    input: EarnInput,
  ): Promise<PointsLogRecord> {
    const existing = await transaction.pointsLog.findUnique({
      where: {
        type_businessType_businessId_userId: {
          type: 'EARN',
          businessType: input.businessType,
          businessId: input.businessId,
          userId: input.userId,
        },
      },
    });
    if (existing) return record(existing);

    const award = await this.streakAward(transaction, input);

    const user = await transaction.user.findFirst({
      where: { id: input.userId, familyId: input.familyId, role: 'CHILD', deletedAt: null },
      select: {
        pointsBalance: true,
        pointsEarnedTotal: true,
        currentLevel: true,
        version: true,
      },
    });
    if (!user) throw new Error('The points recipient was not found.');
    const change = calculatePointsChange({
      type: 'EARN',
      balance: user.pointsBalance,
      earnedTotal: user.pointsEarnedTotal,
      delta: award.points,
    });
    const configurations = await transaction.levelConfig.findMany({
      where: { familyId: input.familyId },
      select: { level: true, pointsRequired: true },
      orderBy: { level: 'asc' },
    });
    const levelAfter = Math.max(
      user.currentLevel,
      deriveEligibleLevel(configurations, change.earnedTotalAfter),
    );
    const updated = await transaction.user.updateMany({
      where: {
        id: input.userId,
        familyId: input.familyId,
        role: 'CHILD',
        version: user.version,
        deletedAt: null,
      },
      data: {
        pointsBalance: change.balanceAfter,
        pointsEarnedTotal: change.earnedTotalAfter,
        currentLevel: levelAfter,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new PointsVersionConflictError();

    let pointsLog;
    try {
      pointsLog = await transaction.pointsLog.create({
        data: {
          familyId: input.familyId,
          userId: input.userId,
          type: 'EARN',
          businessType: input.businessType,
          businessId: input.businessId,
          delta: change.delta,
          balanceBefore: change.balanceBefore,
          balanceAfter: change.balanceAfter,
          earnedTotalAfter: change.earnedTotalAfter,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new PointsBusinessKeyConflictError(input, error);
      }
      throw error;
    }
    if (!(await input.snapshot(change.delta, award.multiplier))) {
      throw new Error('The points award target was not found.');
    }
    await this.outbox.append(
      transaction,
      createDomainEvent({
        event_id: this.eventIdFactory(),
        event_name: 'points.balance.changed.v1',
        occurred_at: input.occurredAt.toISOString(),
        family_id: input.familyId,
        actor_id: input.actorId,
        correlation_id: input.businessId,
        payload: {
          user_id: input.userId,
          business_type: input.businessType,
          business_id: input.businessId,
          delta: change.delta,
          balance_after: change.balanceAfter,
          earned_total_after: change.earnedTotalAfter,
        },
      }),
    );
    if (input.businessType === 'check_in' || input.businessType === 'collaboration_round') {
      await this.appendApprovalEvent(transaction, input, change.delta);
    }
    if (levelAfter > user.currentLevel) {
      await this.outbox.append(
        transaction,
        createDomainEvent({
          event_id: this.eventIdFactory(),
          event_name: 'levels.level.advanced.v1',
          occurred_at: input.occurredAt.toISOString(),
          family_id: input.familyId,
          actor_id: input.actorId,
          correlation_id: input.businessId,
          payload: {
            user_id: input.userId,
            previous_level: user.currentLevel,
            current_level: levelAfter,
            earned_total: change.earnedTotalAfter,
          },
        }),
      );
    }
    return record(pointsLog);
  }

  private async appendApprovalEvent(
    transaction: Prisma.TransactionClient,
    input: EarnInput,
    pointsEarned: number,
  ): Promise<void> {
    const payload = await this.approvalSnapshot(transaction, input, pointsEarned);
    await this.outbox.append(
      transaction,
      createDomainEvent({
        event_id: this.eventIdFactory(),
        event_name: CHECK_IN_APPROVED_EVENT,
        occurred_at: input.occurredAt.toISOString(),
        family_id: input.familyId,
        actor_id: input.actorId,
        correlation_id: payload.source_id,
        payload,
      }),
    );
  }

  private async approvalSnapshot(
    transaction: Prisma.TransactionClient,
    input: EarnInput,
    pointsEarned: number,
  ): Promise<CheckInApprovedEventPayload> {
    if (input.businessType === 'check_in') {
      const source = await transaction.checkIn.findFirst({
        where: {
          id: input.businessId,
          familyId: input.familyId,
          childId: input.userId,
          status: 'APPROVED',
        },
        select: {
          id: true,
          childId: true,
          contentText: true,
          checkDate: true,
          task: { select: { id: true, name: true } },
          media: { orderBy: { sortOrder: 'asc' }, select: { mediaAssetId: true } },
        },
      });
      if (!source) throw new Error('The approved check-in snapshot was not found.');
      return {
        source_type: 'CHECK_IN',
        source_id: source.id,
        child_id: source.childId,
        task_id: source.task.id,
        task_name: source.task.name,
        content_text: source.contentText,
        occurred_on: source.checkDate.toISOString().slice(0, 10),
        points_earned: pointsEarned,
        media_ids: source.media.map(({ mediaAssetId }) => mediaAssetId),
      };
    }

    const source = await transaction.collaborationSubmission.findFirst({
      where: {
        familyId: input.familyId,
        childId: input.userId,
        roundId: input.businessId,
        status: 'APPROVED',
      },
      select: {
        id: true,
        childId: true,
        contentText: true,
        round: { select: { endDate: true, task: { select: { id: true, name: true } } } },
        media: { orderBy: { sortOrder: 'asc' }, select: { mediaAssetId: true } },
      },
    });
    if (!source) throw new Error('The approved collaboration snapshot was not found.');
    return {
      source_type: 'COLLABORATION_SUBMISSION',
      source_id: source.id,
      child_id: source.childId,
      task_id: source.round.task.id,
      task_name: source.round.task.name,
      content_text: source.contentText,
      occurred_on: source.round.endDate.toISOString().slice(0, 10),
      points_earned: pointsEarned,
      media_ids: source.media.map(({ mediaAssetId }) => mediaAssetId),
    };
  }

  private async changeRedemption(
    transaction: Prisma.TransactionClient,
    input: RedemptionPointsInput,
    type: 'REDEEM' | 'REFUND',
  ): Promise<PointsLogRecord> {
    const key: PointsBusinessKey = {
      familyId: input.familyId,
      userId: input.childId,
      type,
      businessType: 'redemption',
      businessId: input.redemptionId,
    };
    const existing = await transaction.pointsLog.findUnique({
      where: {
        type_businessType_businessId_userId: {
          type,
          businessType: key.businessType,
          businessId: key.businessId,
          userId: key.userId,
        },
      },
    });
    if (existing) return record(existing);

    const user = await transaction.user.findFirst({
      where: { id: input.childId, familyId: input.familyId, role: 'CHILD', deletedAt: null },
      select: { pointsBalance: true, pointsEarnedTotal: true, version: true },
    });
    if (!user) throw new Error('The redemption child was not found.');
    const change = calculatePointsChange({
      type,
      balance: user.pointsBalance,
      earnedTotal: user.pointsEarnedTotal,
      delta: type === 'REDEEM' ? -input.points : input.points,
    });
    const updated = await transaction.user.updateMany({
      where: {
        id: input.childId,
        familyId: input.familyId,
        role: 'CHILD',
        version: user.version,
        deletedAt: null,
      },
      data: { pointsBalance: change.balanceAfter, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new PointsVersionConflictError();

    let pointsLog;
    try {
      pointsLog = await transaction.pointsLog.create({
        data: {
          familyId: input.familyId,
          userId: input.childId,
          type,
          businessType: 'redemption',
          businessId: input.redemptionId,
          delta: change.delta,
          balanceBefore: change.balanceBefore,
          balanceAfter: change.balanceAfter,
          earnedTotalAfter: change.earnedTotalAfter,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new PointsBusinessKeyConflictError(key, error);
      }
      throw error;
    }
    await this.outbox.append(
      transaction,
      createDomainEvent({
        event_id: this.eventIdFactory(),
        event_name: 'points.balance.changed.v1',
        occurred_at: input.occurredAt.toISOString(),
        family_id: input.familyId,
        actor_id: input.actorId,
        correlation_id: input.redemptionId,
        payload: {
          user_id: input.childId,
          business_type: 'redemption',
          business_id: input.redemptionId,
          delta: change.delta,
          balance_after: change.balanceAfter,
          earned_total_after: change.earnedTotalAfter,
        },
      }),
    );
    return record(pointsLog);
  }

  private async streakAward(
    transaction: Prisma.TransactionClient,
    input: Pick<EarnInput, 'familyId' | 'userId' | 'basePoints' | 'awardDate'>,
  ) {
    const family = await transaction.family.findFirst({
      where: { id: input.familyId, deletedAt: null },
      select: { settings: true },
    });
    if (!family) throw new Error('The points recipient family was not found.');
    const [checkIns, collaborations] = await Promise.all([
      transaction.checkIn.findMany({
        where: {
          familyId: input.familyId,
          childId: input.userId,
          status: 'APPROVED',
          checkDate: { lte: new Date(`${input.awardDate}T00:00:00.000Z`) },
          deletedAt: null,
        },
        select: { checkDate: true },
      }),
      transaction.collaborationRoundParticipant.findMany({
        where: {
          familyId: input.familyId,
          childId: input.userId,
          status: 'ACTIVE',
          round: {
            status: 'COMPLETED',
            endDate: { lte: new Date(`${input.awardDate}T00:00:00.000Z`) },
          },
        },
        select: { round: { select: { endDate: true } } },
      }),
    ]);
    const settings = normalizeFamilySettings(family.settings as Record<string, unknown>);
    return calculateStreakAward({
      basePoints: input.basePoints,
      awardDate: input.awardDate,
      activityDates: [
        ...checkIns.map(({ checkDate }) => checkDate.toISOString().slice(0, 10)),
        ...collaborations.map(({ round }) => round.endDate.toISOString().slice(0, 10)),
      ],
      tiers: settings.streakMultipliers,
    });
  }

  private async findChange(input: PointsBusinessKey): Promise<PointsLogRecord | null> {
    const value = await this.prisma.pointsLog.findUnique({
      where: {
        type_businessType_businessId_userId: {
          type: input.type,
          businessType: input.businessType,
          businessId: input.businessId,
          userId: input.userId,
        },
      },
    });
    return value ? record(value) : null;
  }
}
