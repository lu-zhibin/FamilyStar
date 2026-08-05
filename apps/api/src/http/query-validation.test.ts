import { describe, expect, it } from 'vitest';

import {
  familyCalendarDate,
  familyDayBounds,
  InvalidQueryFilterError,
  isIanaTimeZone,
  parseEnumFilter,
  parseFamilyDateRange,
  parseUuidFilter,
} from './query-validation.js';

describe('query validation', () => {
  it('formats the same instant as each family natural date', () => {
    const now = new Date('2026-08-05T16:30:00.000Z');

    expect(familyCalendarDate(now, 'Asia/Shanghai')).toBe('2026-08-06');
    expect(familyCalendarDate(now, 'America/New_York')).toBe('2026-08-05');
  });

  it('resolves an ordinary family day as an inclusive-exclusive UTC range', () => {
    expect(familyDayBounds('2026-08-06', 'Asia/Shanghai')).toEqual({
      startAt: new Date('2026-08-05T16:00:00.000Z'),
      endAtExclusive: new Date('2026-08-06T16:00:00.000Z'),
    });
  });

  it('resolves spring daylight saving time as a 23 hour family day', () => {
    const bounds = familyDayBounds('2026-03-08', 'America/New_York');

    expect(bounds.startAt).toEqual(new Date('2026-03-08T05:00:00.000Z'));
    expect(bounds.endAtExclusive).toEqual(new Date('2026-03-09T04:00:00.000Z'));
    expect(bounds.endAtExclusive.getTime() - bounds.startAt.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it('resolves autumn daylight saving time as a 25 hour family day', () => {
    const bounds = familyDayBounds('2026-11-01', 'America/New_York');

    expect(bounds.startAt).toEqual(new Date('2026-11-01T04:00:00.000Z'));
    expect(bounds.endAtExclusive).toEqual(new Date('2026-11-02T05:00:00.000Z'));
    expect(bounds.endAtExclusive.getTime() - bounds.startAt.getTime()).toBe(25 * 60 * 60 * 1000);
  });

  it('creates an inclusive calendar range with an exclusive UTC end', () => {
    expect(
      parseFamilyDateRange({
        startDate: '2026-03-07',
        endDate: '2026-03-09',
        timeZone: 'America/New_York',
        maxDays: 3,
      }),
    ).toEqual({
      startDate: '2026-03-07',
      endDate: '2026-03-09',
      startAt: new Date('2026-03-07T05:00:00.000Z'),
      endAtExclusive: new Date('2026-03-10T04:00:00.000Z'),
      dayCount: 3,
    });
  });

  it.each([
    ['2026-02-29', '2026-03-01'],
    ['2026-02-01', '2026-01-31'],
  ])('rejects invalid or reversed range %s through %s', (startDate, endDate) => {
    expect(() => parseFamilyDateRange({ startDate, endDate, timeZone: 'UTC' })).toThrow(
      InvalidQueryFilterError,
    );
  });

  it('rejects a date range over the domain maximum', () => {
    expect(() =>
      parseFamilyDateRange({
        startDate: '2026-01-01',
        endDate: '2026-01-08',
        timeZone: 'UTC',
        maxDays: 7,
      }),
    ).toThrow('The date range cannot exceed 7 days.');
  });

  it('validates IANA time zones and invalid reference times', () => {
    expect(isIanaTimeZone('Pacific/Kiritimati')).toBe(true);
    expect(isIanaTimeZone('Mars/Olympus')).toBe(false);
    expect(() => familyCalendarDate(new Date(Number.NaN), 'UTC')).toThrow(InvalidQueryFilterError);
    expect(() => familyDayBounds('2026-08-05', 'Mars/Olympus')).toThrow(InvalidQueryFilterError);
  });

  it('parses and normalizes an optional UUID filter', () => {
    expect(parseUuidFilter(undefined, 'child_id')).toBeUndefined();
    expect(parseUuidFilter('01989A58-C542-7ABC-8DEF-0123456789AB', 'child_id')).toBe(
      '01989a58-c542-7abc-8def-0123456789ab',
    );
    expect(() => parseUuidFilter('child-1', 'child_id')).toThrow('child_id must be a UUID.');
  });

  it('parses an optional value from a controlled enum', () => {
    const metrics = ['balance', 'earned', 'level'] as const;

    expect(parseEnumFilter(undefined, metrics, 'metric')).toBeUndefined();
    expect(parseEnumFilter('earned', metrics, 'metric')).toBe('earned');
    expect(() => parseEnumFilter('unknown', metrics, 'metric')).toThrow(
      'metric has an invalid value.',
    );
  });
});
