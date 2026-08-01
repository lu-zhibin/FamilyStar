import { describe, expect, it } from 'vitest';

import { deriveEligibleLevel, deriveLevelView } from './logic.js';
import type { LevelConfiguration, LevelSubject } from './types.js';

function level(level: number, pointsRequired: number): LevelConfiguration {
  return {
    level,
    name: `Level ${level}`,
    icon: `level-${level}`,
    pointsRequired,
    discount: level === 1 ? 1 : 0.8,
    autoApproveQuota: level * 10,
    wishSlots: level,
    extraDimensions: level === 3 ? [{ key: 'vote', value: '1' }] : null,
  };
}

const configurations = [level(1, 0), level(2, 30), level(3, 80), level(20, 100_000)];

function subject(overrides: Partial<LevelSubject> = {}): LevelSubject {
  return {
    userId: 'child-1',
    pointsEarnedTotal: 30,
    currentLevel: 1,
    familyAutoApproveQuota: 25,
    configurations,
    ...overrides,
  };
}

describe('level derivation', () => {
  it('uses inclusive thresholds and crosses multiple levels', () => {
    expect(deriveEligibleLevel(configurations, 29)).toBe(1);
    expect(deriveEligibleLevel(configurations, 30)).toBe(2);
    expect(deriveEligibleLevel(configurations, 99_999)).toBe(3);
    expect(deriveEligibleLevel(configurations, 100_000)).toBe(20);
  });

  it('keeps a cached higher level when earned eligibility is lower', () => {
    const result = deriveLevelView(subject({ pointsEarnedTotal: 10, currentLevel: 3 }));

    expect(result.current.level).toBe(3);
    expect(result.eligibleLevel).toBe(1);
    expect(result.next?.configuration.level).toBe(20);
    expect(result.next?.progressRatio).toBe(0);
  });

  it('calculates current benefits, family quota max, and next progress', () => {
    const result = deriveLevelView(subject({ pointsEarnedTotal: 55 }));

    expect(result.current.level).toBe(2);
    expect(result.benefits).toEqual({
      discount: 0.8,
      levelAutoApproveQuota: 20,
      effectiveAutoApproveQuota: 25,
      wishSlots: 2,
      extraDimensions: null,
    });
    expect(result.next).toMatchObject({ pointsRemaining: 25, progressRatio: 0.5 });
  });

  it('returns no next level at level 20', () => {
    const result = deriveLevelView(subject({ pointsEarnedTotal: 100_000, currentLevel: 20 }));

    expect(result.current.level).toBe(20);
    expect(result.next).toBeNull();
  });

  it('property: earned-point growth and cached levels are monotonic', () => {
    const completeConfigurations = Array.from({ length: 20 }, (_, index) =>
      level(index + 1, index * index * 300),
    );

    for (let cachedLevel = 1; cachedLevel <= 20; cachedLevel += 1) {
      let previousLevel = cachedLevel;
      for (let points = 0; points <= 120_000; points += 137) {
        const view = deriveLevelView(
          subject({
            pointsEarnedTotal: points,
            currentLevel: cachedLevel,
            configurations: completeConfigurations,
          }),
        );

        expect(view.current.level).toBeGreaterThanOrEqual(previousLevel);
        expect(view.current.level).toBeGreaterThanOrEqual(cachedLevel);
        previousLevel = view.current.level;
      }
    }
  });
});
