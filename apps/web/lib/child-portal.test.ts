import { describe, expect, it } from 'vitest';

import {
  belongsToCurrentChild,
  canAccessChildPortal,
  childSectionPaths,
  childSections,
  createIdempotencyKey,
  currentCalendarDate,
  effectiveRewardCost,
  formatCountdown,
  isChildSection,
} from './child-portal';

describe('child portal routing and isolation', () => {
  it('defines six unique child routes and guards parent sessions', () => {
    expect(childSections).toHaveLength(6);
    expect(new Set(Object.values(childSectionPaths))).toHaveLength(6);
    expect(childSections.every((section) => isChildSection(section))).toBe(true);
    expect(isChildSection('settings')).toBe(false);
    expect(canAccessChildPortal('parent')).toBe(false);
    expect(canAccessChildPortal('child')).toBe(true);
    expect(canAccessChildPortal(null)).toBe(true);
  });

  it('keeps only records owned by the current child', () => {
    const records = [
      { id: 'one', child_id: 'child-1' },
      { id: 'two', child_id: 'child-2' },
      { id: 'three', child_id: 'child-1' },
    ];

    expect(belongsToCurrentChild(records, 'child-1').map((record) => record.id)).toEqual([
      'one',
      'three',
    ]);
  });
});

describe('child portal business helpers', () => {
  it('calculates rounded discounted costs with a one-star floor', () => {
    expect(effectiveRewardCost(50, 0.9)).toBe(45);
    expect(effectiveRewardCost(1, 0.1)).toBe(1);
  });

  it('creates scoped idempotency keys and formats lock countdowns', () => {
    expect(createIdempotencyKey('check-in', () => 'request-id')).toBe('check-in-request-id');
    expect(formatCountdown(654)).toBe('10:54');
    expect(formatCountdown(-1)).toBe('00:00');
  });

  it('formats the browser-local date used for current assignments', () => {
    expect(currentCalendarDate(new Date(2026, 7, 2, 23, 30))).toBe('2026-08-02');
  });
});
