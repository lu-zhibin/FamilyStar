const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MILLISECONDS_PER_DAY = 86_400_000;

export const DEFAULT_MAX_FILTER_DATE_RANGE_DAYS = 366;

export type FamilyDateRange = Readonly<{
  startDate: string;
  endDate: string;
  startAt: Date;
  endAtExclusive: Date;
  dayCount: number;
}>;

export class InvalidQueryFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidQueryFilterError';
  }
}

type ZonedDateParts = Readonly<{
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}>;

function parseCalendarDate(value: string): Date {
  if (!CALENDAR_DATE_PATTERN.test(value)) {
    throw new InvalidQueryFilterError('The date must use YYYY-MM-DD.');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new InvalidQueryFilterError('The calendar date is invalid.');
  }
  return date;
}

function formatCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addCalendarDays(value: string, amount: number): string {
  const date = parseCalendarDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatCalendarDate(date);
}

function zonedParts(date: Date, timeZone: string): ZonedDateParts {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, Number(value)]),
  );
  const { year, month, day, hour, minute, second } = values;
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined
  ) {
    throw new InvalidQueryFilterError('The family time zone could not be resolved.');
  }
  return { year, month, day, hour, minute, second };
}

function startOfFamilyDate(value: string, timeZone: string): Date {
  const date = parseCalendarDate(value);
  const target = date.getTime();
  let candidate = target;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = zonedParts(new Date(candidate), timeZone);
    const represented = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const adjustment = target - represented;
    if (adjustment === 0) break;
    candidate += adjustment;
  }

  const result = new Date(candidate);
  const actual = zonedParts(result, timeZone);
  if (
    actual.year !== date.getUTCFullYear() ||
    actual.month !== date.getUTCMonth() + 1 ||
    actual.day !== date.getUTCDate() ||
    actual.hour !== 0 ||
    actual.minute !== 0 ||
    actual.second !== 0
  ) {
    throw new InvalidQueryFilterError('The family calendar date could not be resolved.');
  }
  return result;
}

export function isIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return value.length > 0;
  } catch {
    return false;
  }
}

export function familyCalendarDate(now: Date, timeZone: string): string {
  if (Number.isNaN(now.getTime())) {
    throw new InvalidQueryFilterError('The reference time is invalid.');
  }
  if (!isIanaTimeZone(timeZone)) {
    throw new InvalidQueryFilterError('The family time zone is invalid.');
  }
  const { year, month, day } = zonedParts(now, timeZone);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function familyDayBounds(
  date: string,
  timeZone: string,
): Readonly<{ startAt: Date; endAtExclusive: Date }> {
  if (!isIanaTimeZone(timeZone)) {
    throw new InvalidQueryFilterError('The family time zone is invalid.');
  }
  return {
    startAt: startOfFamilyDate(date, timeZone),
    endAtExclusive: startOfFamilyDate(addCalendarDays(date, 1), timeZone),
  };
}

export function parseFamilyDateRange(input: {
  startDate: string;
  endDate: string;
  timeZone: string;
  maxDays?: number;
}): FamilyDateRange {
  const start = parseCalendarDate(input.startDate);
  const end = parseCalendarDate(input.endDate);
  if (start.getTime() > end.getTime()) {
    throw new InvalidQueryFilterError('The date range is reversed.');
  }

  const maxDays = input.maxDays ?? DEFAULT_MAX_FILTER_DATE_RANGE_DAYS;
  if (!Number.isSafeInteger(maxDays) || maxDays < 1) {
    throw new InvalidQueryFilterError('The maximum date range is invalid.');
  }
  const dayCount = Math.floor((end.getTime() - start.getTime()) / MILLISECONDS_PER_DAY) + 1;
  if (dayCount > maxDays) {
    throw new InvalidQueryFilterError(`The date range cannot exceed ${maxDays} days.`);
  }

  const startBounds = familyDayBounds(input.startDate, input.timeZone);
  const endBounds = familyDayBounds(input.endDate, input.timeZone);
  return {
    startDate: input.startDate,
    endDate: input.endDate,
    startAt: startBounds.startAt,
    endAtExclusive: endBounds.endAtExclusive,
    dayCount,
  };
}

export function parseUuidFilter(value: string | undefined, fieldName: string): string | undefined {
  if (value === undefined) return undefined;
  if (!UUID_PATTERN.test(value)) {
    throw new InvalidQueryFilterError(`${fieldName} must be a UUID.`);
  }
  return value.toLowerCase();
}

export function parseEnumFilter<const TValue extends string>(
  value: string | undefined,
  allowedValues: readonly TValue[],
  fieldName: string,
): TValue | undefined {
  if (value === undefined) return undefined;
  if (!allowedValues.includes(value as TValue)) {
    throw new InvalidQueryFilterError(`${fieldName} has an invalid value.`);
  }
  return value as TValue;
}
