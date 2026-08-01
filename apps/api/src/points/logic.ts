import type { StreakMultiplier } from '../family-settings/types.js';
import type { PointsBalanceChange, PointsChangeType, StreakAward } from './types.js';

export const MAX_POINTS_VALUE = 2_147_483_647;

export class InvalidPointsChangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPointsChangeError';
  }
}

export function pointsInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || Math.abs(value) > MAX_POINTS_VALUE) {
    throw new InvalidPointsChangeError(`${label} must fit the database integer range.`);
  }
}

function calendarDate(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || parsed.toISOString().slice(0, 10) !== value) {
    throw new InvalidPointsChangeError('Invalid streak calendar date.');
  }
  return parsed;
}

function previousDate(value: string): string {
  const parsed = calendarDate(value);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

export function calculateStreakAward(input: {
  basePoints: number;
  awardDate: string;
  activityDates: readonly string[];
  tiers: readonly StreakMultiplier[];
}): StreakAward {
  pointsInteger(input.basePoints, 'Base points');
  if (input.basePoints <= 0) {
    throw new InvalidPointsChangeError('Base points must be positive.');
  }
  calendarDate(input.awardDate);
  const dates = new Set(input.activityDates);
  dates.add(input.awardDate);

  let streakDays = 0;
  let cursor = input.awardDate;
  while (dates.has(cursor)) {
    calendarDate(cursor);
    streakDays += 1;
    cursor = previousDate(cursor);
  }

  const multiplier = input.tiers.reduce(
    (selected, tier) =>
      Number.isSafeInteger(tier.days) &&
      tier.days > 0 &&
      Number.isFinite(tier.multiplier) &&
      tier.multiplier > 0 &&
      tier.days <= streakDays &&
      tier.days > selected.days
        ? tier
        : selected,
    { days: 0, multiplier: 1 },
  ).multiplier;
  const points = Math.round(input.basePoints * multiplier);
  pointsInteger(points, 'Awarded points');
  return Object.freeze({ streakDays, multiplier, points });
}

function add(left: number, right: number, label: string): number {
  const result = left + right;
  pointsInteger(result, label);
  return result;
}

export function calculatePointsChange(input: {
  type: PointsChangeType;
  balance: number;
  earnedTotal: number;
  delta: number;
}): PointsBalanceChange {
  pointsInteger(input.balance, 'Points balance');
  pointsInteger(input.earnedTotal, 'Earned points total');
  pointsInteger(input.delta, 'Points delta');
  if (input.balance < 0 || input.earnedTotal < 0) {
    throw new InvalidPointsChangeError('Points totals must be nonnegative.');
  }
  if (input.delta === 0) throw new InvalidPointsChangeError('Points delta must be nonzero.');

  const positive = input.type === 'EARN' || input.type === 'REFUND';
  if ((positive && input.delta < 0) || (input.type === 'REDEEM' && input.delta > 0)) {
    throw new InvalidPointsChangeError('Points delta direction does not match its type.');
  }

  const balanceAfter = add(input.balance, input.delta, 'Points balance');
  if (balanceAfter < 0) throw new InvalidPointsChangeError('Points balance cannot be negative.');
  const increasesEarnedTotal =
    input.type === 'EARN' || (input.type === 'MANUAL' && input.delta > 0);
  const earnedTotalAfter = increasesEarnedTotal
    ? add(input.earnedTotal, input.delta, 'Earned points total')
    : input.earnedTotal;

  return Object.freeze({
    balanceBefore: input.balance,
    balanceAfter,
    earnedTotalBefore: input.earnedTotal,
    earnedTotalAfter,
    delta: input.delta,
  });
}
