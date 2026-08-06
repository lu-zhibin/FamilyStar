import type { Prisma } from '@prisma/client';
import type { CursorPage } from '@familystar/shared';

import type { SessionStore } from '../family-auth/types.js';

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

export type PointsSummary = Readonly<{
  userId: string;
  pointsBalance: number;
  pointsEarnedTotal: number;
}>;

export type PointsLedgerEntry = Readonly<{
  id: string;
  type: PointsChangeType;
  businessType: string;
  businessId: string;
  delta: number;
  balanceBefore: number;
  balanceAfter: number;
  earnedTotalAfter: number;
  remark: string | null;
  createdAt: Date;
}>;

export type PointsCursorPosition = Readonly<{
  sortValue: string;
  id: string;
}>;

export type PointsLogPage = Readonly<{
  logs: readonly PointsLedgerEntry[];
  page: CursorPage;
}>;

export type PointsReadRepository = {
  findActiveChildSummary(familyId: string, childId: string): Promise<PointsSummary | null>;
  findChildLogs(input: {
    familyId: string;
    childId: string;
    cursor: Readonly<{ createdAt: Date; id: string }> | null;
    limit: number;
  }): Promise<readonly PointsLedgerEntry[]>;
};

export type PointsReadOperations = {
  getMe(input: { sessionToken?: string }): Promise<{ points: PointsSummary }>;
  getChild(input: { sessionToken?: string; childId: string }): Promise<{ points: PointsSummary }>;
  getMyLogs(input: {
    sessionToken?: string;
    cursor: PointsCursorPosition | null;
    limit: number;
  }): Promise<PointsLogPage>;
};

export type PointsReadServiceDependencies = Readonly<{
  repository: PointsReadRepository;
  sessions: SessionStore;
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
