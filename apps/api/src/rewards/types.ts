import type { RedemptionStatus, RewardStatus, RewardType, WishStatus } from '@prisma/client';

import type { SessionStore } from '../family-auth/types.js';

export type RedemptionLimits = Readonly<{
  perDay?: number;
  perWeek?: number;
  perMonth?: number;
}>;

export type RewardPrerequisites = Readonly<{
  minLevel?: number;
  redeemLimit?: RedemptionLimits;
}>;

export type RewardRecord = Readonly<{
  id: string;
  familyId: string;
  name: string;
  description: string | null;
  imageMediaId: string | null;
  pointsCost: number;
  type: RewardType;
  stockTotal: number | null;
  stockReserved: number;
  stockConsumed: number;
  prerequisites: RewardPrerequisites;
  status: RewardStatus;
  createdAt: Date;
  updatedAt: Date;
}>;

export type RewardInput = Readonly<{
  name: string;
  description?: string | null;
  imageMediaId?: string | null;
  pointsCost: number;
  type: RewardType;
  stockTotal?: number | null;
  prerequisites?: RewardPrerequisites;
  status?: RewardStatus;
}>;

export type RewardPatch = Partial<RewardInput>;

export type RedemptionRecord = Readonly<{
  id: string;
  familyId: string;
  rewardId: string;
  childId: string;
  listedPointsCost: number;
  discount: number;
  pointsSpent: number;
  status: RedemptionStatus;
  isAutoApproved: boolean;
  approvedById: string | null;
  approvedAt: Date | null;
  rejectedById: string | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  fulfilledById: string | null;
  fulfilledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export type WishRecord = Readonly<{
  id: string;
  familyId: string;
  childId: string;
  title: string;
  description: string | null;
  targetPoints: number;
  pointsBalance: number;
  status: WishStatus;
  adoptedRewardId: string | null;
  cancelledAt: Date | null;
  adoptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export type RewardRepository = {
  listRewards(familyId: string, activeOnly: boolean): Promise<readonly RewardRecord[]>;
  findReward(
    familyId: string,
    rewardId: string,
    activeOnly?: boolean,
  ): Promise<RewardRecord | null>;
  createReward(familyId: string, input: RewardInput): Promise<RewardRecord>;
  updateReward(
    familyId: string,
    rewardId: string,
    input: RewardPatch,
  ): Promise<RewardRecord | null>;
  softDeleteReward(familyId: string, rewardId: string): Promise<boolean>;
  requestRedemption(input: {
    familyId: string;
    childId: string;
    rewardId: string;
    idempotencyKey: string;
    requestFingerprint: string;
    now: Date;
  }): Promise<RedemptionRecord>;
  listRedemptions(familyId: string, childId?: string): Promise<readonly RedemptionRecord[]>;
  approveRedemption(input: {
    familyId: string;
    redemptionId: string;
    parentId: string;
    now: Date;
  }): Promise<RedemptionRecord>;
  fulfillRedemption(input: {
    familyId: string;
    redemptionId: string;
    parentId: string;
    now: Date;
  }): Promise<RedemptionRecord>;
  rejectRedemption(input: {
    familyId: string;
    redemptionId: string;
    parentId: string;
    reason: string;
    now: Date;
  }): Promise<RedemptionRecord>;
  listWishes(familyId: string, childId?: string): Promise<readonly WishRecord[]>;
  createWish(input: {
    familyId: string;
    childId: string;
    title: string;
    description?: string | null;
    targetPoints: number;
    now: Date;
  }): Promise<WishRecord>;
  cancelWish(input: {
    familyId: string;
    childId: string;
    wishId: string;
    now: Date;
  }): Promise<WishRecord>;
  adoptWish(input: {
    familyId: string;
    parentId: string;
    wishId: string;
    reward: Omit<RewardInput, 'name' | 'description' | 'pointsCost'>;
    now: Date;
  }): Promise<{ wish: WishRecord; reward: RewardRecord }>;
};

export type RewardOperations = {
  listRewards(input: { sessionToken?: string }): Promise<{ rewards: readonly RewardRecord[] }>;
  getReward(input: { sessionToken?: string; rewardId: string }): Promise<{ reward: RewardRecord }>;
  createReward(input: {
    sessionToken?: string;
    reward: RewardInput;
  }): Promise<{ reward: RewardRecord }>;
  updateReward(input: {
    sessionToken?: string;
    rewardId: string;
    reward: RewardPatch;
  }): Promise<{ reward: RewardRecord }>;
  removeReward(input: { sessionToken?: string; rewardId: string }): Promise<void>;
  requestRedemption(input: {
    sessionToken?: string;
    rewardId: string;
    idempotencyKey: string;
  }): Promise<{ redemption: RedemptionRecord }>;
  listRedemptions(input: {
    sessionToken?: string;
  }): Promise<{ redemptions: readonly RedemptionRecord[] }>;
  approveRedemption(input: {
    sessionToken?: string;
    redemptionId: string;
  }): Promise<{ redemption: RedemptionRecord }>;
  fulfillRedemption(input: {
    sessionToken?: string;
    redemptionId: string;
  }): Promise<{ redemption: RedemptionRecord }>;
  rejectRedemption(input: {
    sessionToken?: string;
    redemptionId: string;
    reason: string;
  }): Promise<{ redemption: RedemptionRecord }>;
  listWishes(input: { sessionToken?: string }): Promise<{ wishes: readonly WishRecord[] }>;
  createWish(input: {
    sessionToken?: string;
    title: string;
    description?: string | null;
    targetPoints: number;
  }): Promise<{ wish: WishRecord }>;
  cancelWish(input: { sessionToken?: string; wishId: string }): Promise<{ wish: WishRecord }>;
  adoptWish(input: {
    sessionToken?: string;
    wishId: string;
    reward: Omit<RewardInput, 'name' | 'description' | 'pointsCost'>;
  }): Promise<{ wish: WishRecord; reward: RewardRecord }>;
};

export type RewardDependencies = Readonly<{
  repository: RewardRepository;
  sessions: SessionStore;
  now?: () => Date;
}>;
