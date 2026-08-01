import { describe, expect, it } from 'vitest';

import {
  calculateRedemption,
  InvalidRewardInputError,
  normalizePrerequisites,
  normalizeReward,
  wishProgress,
} from './logic.js';

describe('reward domain logic', () => {
  it.each([
    [1, 0.1, 1],
    [5, 0.5, 3],
    [99, 0.85, 84],
    [100, 0.75, 75],
  ])('calculates a positive rounded discounted price', (cost, discount, expected) => {
    expect(calculateRedemption(cost, discount, 0, 0).pointsSpent).toBe(expected);
  });

  it('uses the larger family and level quota for automatic approval', () => {
    expect(calculateRedemption(50, 0.8, 20, 40)).toEqual({
      pointsSpent: 40,
      effectiveAutoApproveQuota: 40,
      autoApproved: true,
    });
    expect(calculateRedemption(51, 0.8, 40, 20).autoApproved).toBe(false);
  });

  it('normalizes all supported MVP prerequisites', () => {
    expect(
      normalizePrerequisites({
        minLevel: 3,
        redeemLimit: { perDay: 1, perWeek: 2, perMonth: 3 },
      }),
    ).toEqual({
      minLevel: 3,
      redeemLimit: { perDay: 1, perWeek: 2, perMonth: 3 },
    });
  });

  it.each([
    { name: '', pointsCost: 1, type: 'CUSTOM' as const },
    { name: 'x', pointsCost: 0, type: 'CUSTOM' as const },
    { name: 'x', pointsCost: 1, type: 'CUSTOM' as const, stockTotal: -1 },
    {
      name: 'x',
      pointsCost: 1,
      type: 'CUSTOM' as const,
      prerequisites: { minLevel: 21 },
    },
  ])('rejects invalid reward values', (input) => {
    expect(() => normalizeReward(input)).toThrow(InvalidRewardInputError);
  });

  it('allows zero finite stock to represent an unavailable reward', () => {
    expect(
      normalizeReward({ name: 'Book', pointsCost: 1, type: 'PHYSICAL', stockTotal: 0 }),
    ).toMatchObject({ stockTotal: 0 });
  });

  it('returns live capped wish progress', () => {
    expect(wishProgress(30, 100)).toEqual({ points: 30, remaining: 70, ratio: 0.3 });
    expect(wishProgress(120, 100)).toEqual({ points: 100, remaining: 0, ratio: 1 });
  });
});
