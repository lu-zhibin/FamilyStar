import { describe, expect, it } from 'vitest';

import { getCheckInWindow, isScheduledOnDate, normalizeFrequency } from './frequency.js';

describe('task frequency', () => {
  it('normalizes and validates supported frequency variants', () => {
    expect(normalizeFrequency({ kind: 'weekdays', weekdays: [5, 1, 5] })).toEqual({
      kind: 'weekdays',
      weekdays: [1, 5],
    });
    expect(() => normalizeFrequency({ kind: 'weekly_count', count: 8 })).toThrow();
    expect(() =>
      normalizeFrequency({ kind: 'date_range', startDate: '2026-02-30', endDate: '2026-03-01' }),
    ).toThrow();
  });

  it('calculates daily, weekly and date-range occurrences with Monday as week start', () => {
    expect(isScheduledOnDate({ kind: 'daily' }, '2026-07-31')).toBe(true);
    expect(isScheduledOnDate({ kind: 'weekly_count', count: 2 }, '2026-07-27')).toBe(true);
    expect(isScheduledOnDate({ kind: 'weekly_count', count: 2 }, '2026-07-29')).toBe(false);
    expect(isScheduledOnDate({ kind: 'weekdays', weekdays: [5] }, '2026-07-31')).toBe(true);
    expect(
      isScheduledOnDate(
        { kind: 'date_range', startDate: '2026-07-30', endDate: '2026-07-31' },
        '2026-08-01',
      ),
    ).toBe(false);
  });

  it('calculates the family deadline and inclusive makeup window', () => {
    const result = getCheckInWindow({
      dueDate: '2026-07-31',
      timeZone: 'Asia/Shanghai',
      deadline: '23:59',
      makeupDays: 3,
    });
    expect(result.makeupUntil).toBe('2026-08-03');
    expect(result.deadlineAt.toISOString()).toBe('2026-07-31T15:59:00.000Z');
  });
});
