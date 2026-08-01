import type { RedemptionLimits, RewardInput, RewardPatch, RewardPrerequisites } from './types.js';

const MAX_DATABASE_INTEGER = 2_147_483_647;

export class InvalidRewardInputError extends Error {
  readonly code = 'INVALID_REQUEST' as const;

  constructor(message = 'Invalid reward input.') {
    super(message);
    this.name = 'InvalidRewardInputError';
  }
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= MAX_DATABASE_INTEGER;
}

function nonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= MAX_DATABASE_INTEGER;
}

function limit(value: unknown): value is number | undefined {
  return value === undefined || positiveInteger(value);
}

export function normalizePrerequisites(
  value: RewardPrerequisites | undefined,
): RewardPrerequisites {
  const input = value ?? {};
  if (
    (input.minLevel !== undefined &&
      (!Number.isSafeInteger(input.minLevel) || input.minLevel < 1 || input.minLevel > 20)) ||
    !limit(input.redeemLimit?.perDay) ||
    !limit(input.redeemLimit?.perWeek) ||
    !limit(input.redeemLimit?.perMonth)
  ) {
    throw new InvalidRewardInputError('Invalid reward prerequisites.');
  }
  const redeemLimit: RedemptionLimits = {
    ...(input.redeemLimit?.perDay === undefined ? {} : { perDay: input.redeemLimit.perDay }),
    ...(input.redeemLimit?.perWeek === undefined ? {} : { perWeek: input.redeemLimit.perWeek }),
    ...(input.redeemLimit?.perMonth === undefined ? {} : { perMonth: input.redeemLimit.perMonth }),
  };
  return {
    ...(input.minLevel === undefined ? {} : { minLevel: input.minLevel }),
    ...(Object.keys(redeemLimit).length === 0 ? {} : { redeemLimit }),
  };
}

export function normalizeReward(input: RewardInput): RewardInput {
  const name = input.name.trim();
  const description = input.description?.trim() || null;
  if (
    name.length === 0 ||
    name.length > 120 ||
    (description?.length ?? 0) > 10_000 ||
    !positiveInteger(input.pointsCost) ||
    (input.stockTotal !== undefined &&
      input.stockTotal !== null &&
      !nonnegativeInteger(input.stockTotal))
  ) {
    throw new InvalidRewardInputError();
  }
  return {
    name,
    description,
    imageMediaId: input.imageMediaId ?? null,
    pointsCost: input.pointsCost,
    type: input.type,
    stockTotal: input.stockTotal ?? null,
    prerequisites: normalizePrerequisites(input.prerequisites),
    status: input.status ?? 'ACTIVE',
  };
}

export function normalizeRewardPatch(input: RewardPatch): RewardPatch {
  if (Object.keys(input).length === 0) throw new InvalidRewardInputError();
  if (
    input.name !== undefined &&
    (input.name.trim().length === 0 || input.name.trim().length > 120)
  ) {
    throw new InvalidRewardInputError();
  }
  if (input.description !== undefined && (input.description?.trim().length ?? 0) > 10_000) {
    throw new InvalidRewardInputError();
  }
  if (input.pointsCost !== undefined && !positiveInteger(input.pointsCost)) {
    throw new InvalidRewardInputError();
  }
  if (
    input.stockTotal !== undefined &&
    input.stockTotal !== null &&
    !nonnegativeInteger(input.stockTotal)
  ) {
    throw new InvalidRewardInputError();
  }
  return {
    ...input,
    ...(input.name === undefined ? {} : { name: input.name.trim() }),
    ...(input.description === undefined ? {} : { description: input.description?.trim() || null }),
    ...(input.prerequisites === undefined
      ? {}
      : { prerequisites: normalizePrerequisites(input.prerequisites) }),
  };
}

export function calculateRedemption(
  pointsCost: number,
  discount: number,
  familyQuota: number,
  levelQuota: number,
) {
  if (!positiveInteger(pointsCost) || !Number.isFinite(discount) || discount <= 0 || discount > 1) {
    throw new InvalidRewardInputError('Invalid redemption pricing.');
  }
  const pointsSpent = Math.max(1, Math.round(pointsCost * discount));
  const effectiveAutoApproveQuota = Math.max(familyQuota, levelQuota);
  return {
    pointsSpent,
    effectiveAutoApproveQuota,
    autoApproved: pointsSpent <= effectiveAutoApproveQuota,
  } as const;
}

export function wishProgress(pointsBalance: number, targetPoints: number) {
  if (!Number.isSafeInteger(pointsBalance) || pointsBalance < 0 || !positiveInteger(targetPoints)) {
    throw new InvalidRewardInputError('Invalid wish progress values.');
  }
  return {
    points: Math.min(pointsBalance, targetPoints),
    remaining: Math.max(0, targetPoints - pointsBalance),
    ratio: Math.min(1, pointsBalance / targetPoints),
  } as const;
}
