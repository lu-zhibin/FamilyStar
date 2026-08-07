import { describe, expect, it } from 'vitest';

import {
  calculateStreakDays,
  conditionProgress,
  InvalidBadgeInputError,
  normalizeBadgeCondition,
  normalizeBadgeTemplate,
} from './logic.js';

describe('badge logic', () => {
  const metrics = {
    taskCompletionCount: 7,
    streakDays: 5,
    totalPoints: 120,
    level: 3,
    collaborationCount: 2,
  };

  it.each([
    [{ type: 'TASK_COMPLETION_COUNT', target: 7 } as const, 7],
    [{ type: 'STREAK_DAYS', target: 7 } as const, 5],
    [{ type: 'TOTAL_POINTS', target: 100 } as const, 120],
    [{ type: 'LEVEL_REACHED', target: 3 } as const, 3],
    [{ type: 'COLLABORATION_COUNT', target: 1 } as const, 2],
    [{ type: 'MANUAL' } as const, 0],
  ])('evaluates %o against the matching metric', (condition, expected) => {
    expect(conditionProgress(condition, metrics)).toBe(expected);
  });

  it('counts a descending consecutive sequence once per calendar date', () => {
    expect(
      calculateStreakDays([
        new Date('2026-08-05T00:00:00.000Z'),
        new Date('2026-08-04T00:00:00.000Z'),
        new Date('2026-08-04T12:00:00.000Z'),
        new Date('2026-08-03T00:00:00.000Z'),
        new Date('2026-08-01T00:00:00.000Z'),
      ]),
    ).toBe(3);
  });

  it('rejects unknown, zero, fractional, and oversized thresholds', () => {
    for (const condition of [
      { type: 'UNKNOWN', target: 1 },
      { type: 'TOTAL_POINTS', target: 0 },
      { type: 'TOTAL_POINTS', target: 1.5 },
      { type: 'TOTAL_POINTS', target: 2_147_483_648 },
    ]) {
      expect(() => normalizeBadgeCondition(condition as never)).toThrow(InvalidBadgeInputError);
    }
  });

  it('property: every automatic condition changes eligibility exactly at its generated boundary', () => {
    const conditionTypes = [
      ['TASK_COMPLETION_COUNT', 'taskCompletionCount'],
      ['STREAK_DAYS', 'streakDays'],
      ['TOTAL_POINTS', 'totalPoints'],
      ['LEVEL_REACHED', 'level'],
      ['COLLABORATION_COUNT', 'collaborationCount'],
    ] as const;

    for (const [type, metric] of conditionTypes) {
      for (let seed = 1; seed <= 64; seed += 1) {
        const target = ((seed * 104_729) % 10_000) + 1;
        const condition = normalizeBadgeCondition({ type, target });

        for (const currentValue of [target - 1, target, target + 1]) {
          const generatedMetrics = { ...metrics, [metric]: currentValue };
          const progress = conditionProgress(condition, generatedMetrics);

          expect(progress).toBe(currentValue);
          expect(progress >= target).toBe(currentValue >= target);
        }
      }
    }

    for (const target of [1, 2_147_483_647]) {
      expect(normalizeBadgeCondition({ type: 'TOTAL_POINTS', target })).toEqual({
        type: 'TOTAL_POINTS',
        target,
      });
    }
  });

  it('normalizes template text and defaults visibility, status, and award level', () => {
    expect(
      normalizeBadgeTemplate({
        name: '  Helper  ',
        description: '  First collaboration  ',
        icon: ' star ',
        category: ' teamwork ',
        condition: { type: 'COLLABORATION_COUNT', target: 1 },
      }),
    ).toEqual({
      name: 'Helper',
      description: 'First collaboration',
      icon: 'star',
      category: 'teamwork',
      condition: { type: 'COLLABORATION_COUNT', target: 1 },
      awardLevel: 1,
      isVisible: true,
      isEnabled: true,
    });
  });
});
