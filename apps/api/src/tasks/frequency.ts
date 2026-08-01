import type { TaskFrequency } from './types.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: string): Date {
  if (!DATE_PATTERN.test(value)) throw new Error('Invalid calendar date.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Invalid calendar date.');
  }
  return date;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, amount: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatDate(date);
}

function mondayBasedDay(value: string): number {
  const day = parseDate(value).getUTCDay();
  return day === 0 ? 7 : day;
}

export function normalizeFrequency(value: TaskFrequency): TaskFrequency {
  switch (value.kind) {
    case 'daily':
      return { kind: 'daily' };
    case 'weekly_count':
      if (!Number.isSafeInteger(value.count) || value.count < 1 || value.count > 7) {
        throw new Error('Weekly frequency count must be between 1 and 7.');
      }
      return { kind: 'weekly_count', count: value.count };
    case 'weekdays': {
      const weekdays = [...new Set(value.weekdays)].sort((a, b) => a - b);
      if (
        weekdays.length === 0 ||
        weekdays.some((day) => !Number.isSafeInteger(day) || day < 1 || day > 7)
      ) {
        throw new Error('Weekdays must contain unique values from 1 to 7.');
      }
      return { kind: 'weekdays', weekdays };
    }
    case 'date_range':
      parseDate(value.startDate);
      parseDate(value.endDate);
      if (value.startDate > value.endDate) throw new Error('Date range is reversed.');
      return { kind: 'date_range', startDate: value.startDate, endDate: value.endDate };
  }
}

export function isScheduledOnDate(frequency: TaskFrequency, date: string): boolean {
  parseDate(date);
  switch (frequency.kind) {
    case 'daily':
      return true;
    case 'weekly_count':
      return mondayBasedDay(date) <= frequency.count;
    case 'weekdays':
      return frequency.weekdays.includes(mondayBasedDay(date));
    case 'date_range':
      return date >= frequency.startDate && date <= frequency.endDate;
  }
}

function dateParts(date: Date, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(
    parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, Number(value)]),
  );
}

function zonedDeadline(date: string, deadline: string, timeZone: string): Date {
  const [hour, minute] = deadline.split(':').map(Number);
  const [year, month, day] = date.split('-').map(Number);
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined
  ) {
    throw new Error('Invalid deadline.');
  }
  const target = Date.UTC(year, month - 1, day, hour, minute);
  const first = new Date(target);
  const actual = dateParts(first, timeZone);
  if (
    actual.year === undefined ||
    actual.month === undefined ||
    actual.day === undefined ||
    actual.hour === undefined ||
    actual.minute === undefined ||
    actual.second === undefined
  ) {
    throw new Error('Could not resolve the family deadline.');
  }
  const actualUtc = Date.UTC(
    actual.year,
    actual.month - 1,
    actual.day,
    actual.hour,
    actual.minute,
    actual.second,
  );
  return new Date(target + (target - actualUtc));
}

export function getCheckInWindow(input: {
  dueDate: string;
  timeZone: string;
  deadline: string;
  makeupDays: number;
}): Readonly<{ dueDate: string; deadlineAt: Date; makeupUntil: string }> {
  parseDate(input.dueDate);
  if (!Number.isSafeInteger(input.makeupDays) || input.makeupDays < 0) {
    throw new Error('Makeup days must be a non-negative integer.');
  }
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.deadline)) {
    throw new Error('Deadline must use HH:mm.');
  }
  return {
    dueDate: input.dueDate,
    deadlineAt: zonedDeadline(input.dueDate, input.deadline, input.timeZone),
    makeupUntil: addDays(input.dueDate, input.makeupDays),
  };
}
