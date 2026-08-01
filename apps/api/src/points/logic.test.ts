import { describe, expect, it } from 'vitest';

import {
  calculatePointsChange,
  calculateStreakAward,
  InvalidPointsChangeError,
  MAX_POINTS_VALUE,
} from './logic.js';

const tiers = [
  { days: 3, multiplier: 1.5 },
  { days: 7, multiplier: 2 },
];

describe('calculateStreakAward', () => {
  it('uses the highest reached tier and rounds half points upward', () => {
    expect(
      calculateStreakAward({
        basePoints: 5,
        awardDate: '2026-07-03',
        activityDates: ['2026-07-01', '2026-07-02'],
        tiers,
      }),
    ).toEqual({ streakDays: 3, multiplier: 1.5, points: 8 });
    expect(
      calculateStreakAward({
        basePoints: 5,
        awardDate: '2026-07-07',
        activityDates: Array.from({ length: 6 }, (_, index) => `2026-07-0${index + 1}`),
        tiers,
      }),
    ).toEqual({ streakDays: 7, multiplier: 2, points: 10 });
  });

  it('includes the award date, deduplicates dates, and stops at a gap', () => {
    expect(
      calculateStreakAward({
        basePoints: 5,
        awardDate: '2026-07-05',
        activityDates: ['2026-07-05', '2026-07-04', '2026-07-04', '2026-07-02'],
        tiers,
      }),
    ).toEqual({ streakDays: 2, multiplier: 1, points: 5 });
  });

  it('rejects an award that exceeds the database integer range', () => {
    expect(() =>
      calculateStreakAward({
        basePoints: MAX_POINTS_VALUE,
        awardDate: '2026-07-03',
        activityDates: ['2026-07-01', '2026-07-02'],
        tiers,
      }),
    ).toThrow(InvalidPointsChangeError);
  });

  it('property: selects the highest reached tier across streak boundaries', () => {
    const configuredTiers = [
      { days: 3, multiplier: 1.5 },
      { days: 7, multiplier: 2 },
      { days: 14, multiplier: 3 },
      { days: 30, multiplier: 5 },
      { days: 60, multiplier: 8 },
      { days: 100, multiplier: 10 },
    ];
    const awardDate = new Date('2026-07-31T00:00:00.000Z');

    for (let streakDays = 1; streakDays <= 120; streakDays += 1) {
      const activityDates = Array.from({ length: streakDays - 1 }, (_, index) => {
        const date = new Date(awardDate);
        date.setUTCDate(date.getUTCDate() - index - 1);
        return date.toISOString().slice(0, 10);
      });
      const expectedMultiplier = configuredTiers.reduce(
        (value, tier) => (tier.days <= streakDays ? tier.multiplier : value),
        1,
      );

      expect(
        calculateStreakAward({
          basePoints: 7,
          awardDate: '2026-07-31',
          activityDates,
          tiers: configuredTiers,
        }),
      ).toEqual({
        streakDays,
        multiplier: expectedMultiplier,
        points: Math.round(7 * expectedMultiplier),
      });
    }
  });
});

describe('calculatePointsChange', () => {
  it('adds earned points to both balance fields', () => {
    expect(calculatePointsChange({ type: 'EARN', balance: 12, earnedTotal: 30, delta: 8 })).toEqual(
      {
        balanceBefore: 12,
        balanceAfter: 20,
        earnedTotalBefore: 30,
        earnedTotalAfter: 38,
        delta: 8,
      },
    );
  });

  it('keeps earned total unchanged for redemption and refund', () => {
    expect(
      calculatePointsChange({ type: 'REDEEM', balance: 12, earnedTotal: 30, delta: -8 }),
    ).toMatchObject({ balanceAfter: 4, earnedTotalAfter: 30 });
    expect(
      calculatePointsChange({ type: 'REFUND', balance: 4, earnedTotal: 30, delta: 8 }),
    ).toMatchObject({ balanceAfter: 12, earnedTotalAfter: 30 });
  });

  it('rejects a negative resulting balance', () => {
    expect(() =>
      calculatePointsChange({ type: 'REDEEM', balance: 3, earnedTotal: 30, delta: -4 }),
    ).toThrow(InvalidPointsChangeError);
  });

  it('rejects invalid directions, zero deltas, and database integer overflow', () => {
    expect(() =>
      calculatePointsChange({ type: 'EARN', balance: 0, earnedTotal: 0, delta: -1 }),
    ).toThrow(InvalidPointsChangeError);
    expect(() =>
      calculatePointsChange({ type: 'EARN', balance: 0, earnedTotal: 0, delta: 0 }),
    ).toThrow(InvalidPointsChangeError);
    expect(() =>
      calculatePointsChange({
        type: 'EARN',
        balance: MAX_POINTS_VALUE,
        earnedTotal: 0,
        delta: 1,
      }),
    ).toThrow(InvalidPointsChangeError);
  });

  it('property: earning a positive delta preserves both balance invariants', () => {
    for (let seed = 1; seed <= 250; seed += 1) {
      const balance = (seed * 7_919) % 1_000_000;
      const earnedTotal = balance + ((seed * 104_729) % 1_000_000);
      const delta = ((seed * 65_537) % 10_000) + 1;
      const change = calculatePointsChange({ type: 'EARN', balance, earnedTotal, delta });

      expect(change.balanceAfter - change.balanceBefore).toBe(delta);
      expect(change.earnedTotalAfter - change.earnedTotalBefore).toBe(delta);
      expect(change.balanceAfter).toBeGreaterThanOrEqual(0);
    }
  });
});
