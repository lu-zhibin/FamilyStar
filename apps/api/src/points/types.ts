import type { Prisma } from '@prisma/client';

export type PointsChangeType = 'EARN' | 'REDEEM' | 'REFUND' | 'MANUAL';

export type PointsBalanceChange = Readonly<{
  balanceBefore: number;
  balanceAfter: number;
  earnedTotalBefore: number;
  earnedTotalAfter: number;
  delta: number;
}>;

export type PointsLogRecord = Readonly<{
  id: string;
  familyId: string;
  userId: string;
  type: PointsChangeType;
  businessType: string;
  businessId: string;
  delta: number;
  balanceBefore: number;
  balanceAfter: number;
  earnedTotalAfter: number;
  createdAt: Date;
}>;

export type StreakAward = Readonly<{
  streakDays: number;
  multiplier: number;
  points: number;
}>;

export type CheckInPointsInput = Readonly<{
  familyId: string;
  userId: string;
  checkInId: string;
  basePoints: number;
  awardDate: string;
  actorId: string | null;
  occurredAt: Date;
}>;

export type CollaborationRoundPointsInput = Readonly<{
  familyId: string;
  roundId: string;
  actorId: string | null;
  occurredAt: Date;
}>;

export type RedemptionPointsInput = Readonly<{
  familyId: string;
  childId: string;
  redemptionId: string;
  points: number;
  actorId: string | null;
  occurredAt: Date;
}>;

export class PointsTransactionRetryError extends Error {
  constructor(readonly originalError: unknown) {
    super('The transaction must be retried.');
    this.name = 'PointsTransactionRetryError';
  }
}

export type PointsAwardPort = {
  earnCheckIn(input: CheckInPointsInput): Promise<PointsLogRecord>;
  completeCollaborationRound(input: CollaborationRoundPointsInput): Promise<boolean>;
  redeem(input: RedemptionPointsInput): Promise<PointsLogRecord>;
  refund(input: RedemptionPointsInput): Promise<PointsLogRecord>;
};

export type PointsTransactionWriter = {
  run<Result>(
    work: (transaction: Prisma.TransactionClient, points: PointsAwardPort) => Promise<Result>,
  ): Promise<Result>;
};
