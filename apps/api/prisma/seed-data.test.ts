import { describe, expect, it } from 'vitest';

import {
  assertDevelopmentSeedAllowed,
  DEVELOPMENT_SEED,
  DEVELOPMENT_SEED_CREDENTIALS,
  seedId,
} from './seed-data.js';

describe('development seed plan', () => {
  it('provides two families with dual parents and multiple children', () => {
    expect(DEVELOPMENT_SEED.families).toHaveLength(2);
    expect(DEVELOPMENT_SEED.families.every((family) => family.parents.length === 2)).toBe(true);
    expect(DEVELOPMENT_SEED.families.every((family) => family.children.length >= 2)).toBe(true);
    expect(
      new Set(
        DEVELOPMENT_SEED.families.flatMap((family) => family.parents.map(({ email }) => email)),
      ).size,
    ).toBe(4);
  });

  it('contains the complete task type and level baselines', () => {
    expect(DEVELOPMENT_SEED.templates.map(({ code }) => code)).toEqual([
      'study',
      'sport',
      'chore',
      'habit',
      'custom',
    ]);
    expect(DEVELOPMENT_SEED.levels).toHaveLength(20);
    expect(DEVELOPMENT_SEED.levels[0]?.pointsRequired).toBe(0);
    expect(DEVELOPMENT_SEED.levels[19]?.pointsRequired).toBe(100_000);
  });

  it('uses deterministic identifiers and valid development credentials', () => {
    expect(seedId(5, 0, 0)).toBe('00000005-0000-4000-8000-000000000001');
    expect(seedId(5, 0, 0)).not.toBe(seedId(5, 1, 0));
    expect(DEVELOPMENT_SEED_CREDENTIALS.parentPassword.length).toBeGreaterThanOrEqual(12);
    expect(DEVELOPMENT_SEED_CREDENTIALS.childPins.every((pin) => /^\d{4,6}$/.test(pin))).toBe(true);
  });

  it('rejects production execution', () => {
    expect(() => assertDevelopmentSeedAllowed('production')).toThrow(
      'Development seed is disabled in production.',
    );
    expect(() => assertDevelopmentSeedAllowed('development')).not.toThrow();
  });
});
