import type { BadgeCondition, BadgeTemplateInput, BadgeTemplatePatch } from './types.js';

const CONDITION_TYPES = new Set<BadgeCondition['type']>([
  'TASK_COMPLETION_COUNT',
  'STREAK_DAYS',
  'TOTAL_POINTS',
  'LEVEL_REACHED',
  'COLLABORATION_COUNT',
  'MANUAL',
]);

const MAX_INTEGER = 2_147_483_647;

export class InvalidBadgeInputError extends Error {
  readonly code = 'INVALID_REQUEST' as const;

  constructor(message: string) {
    super(message);
    this.name = 'InvalidBadgeInputError';
  }
}

function text(value: string, max: number, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > max) {
    throw new InvalidBadgeInputError(`${label} is invalid.`);
  }
  return normalized;
}

function awardLevel(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_INTEGER) {
    throw new InvalidBadgeInputError('Badge award level is invalid.');
  }
  return value;
}

function description(value: string | null | undefined): string | null {
  const normalized = value?.trim() || null;
  if ((normalized?.length ?? 0) > 10_000) {
    throw new InvalidBadgeInputError('Badge description is invalid.');
  }
  return normalized;
}

export function normalizeBadgeCondition(value: BadgeCondition): BadgeCondition {
  if (!value || !CONDITION_TYPES.has(value.type)) {
    throw new InvalidBadgeInputError('Badge condition type is invalid.');
  }
  if (value.type === 'MANUAL') return Object.freeze({ type: 'MANUAL' });
  if (!Number.isSafeInteger(value.target) || value.target < 1 || value.target > MAX_INTEGER) {
    throw new InvalidBadgeInputError('Badge condition target is invalid.');
  }
  return Object.freeze({ type: value.type, target: value.target });
}

export function normalizeBadgeTemplate(input: BadgeTemplateInput): BadgeTemplateInput {
  const normalizedAwardLevel = awardLevel(input.awardLevel ?? 1);
  return Object.freeze({
    name: text(input.name, 120, 'Badge name'),
    description: description(input.description),
    icon: text(input.icon, 80, 'Badge icon'),
    category: text(input.category, 80, 'Badge category'),
    condition: normalizeBadgeCondition(input.condition),
    awardLevel: normalizedAwardLevel,
    isVisible: input.isVisible ?? true,
    isEnabled: input.isEnabled ?? true,
  });
}

export function normalizeBadgeTemplatePatch(input: BadgeTemplatePatch): BadgeTemplatePatch {
  if (Object.keys(input).length === 0) {
    throw new InvalidBadgeInputError('Badge template patch is empty.');
  }
  return Object.freeze({
    ...(input.name === undefined ? {} : { name: text(input.name, 120, 'Badge name') }),
    ...(input.description === undefined ? {} : { description: description(input.description) }),
    ...(input.icon === undefined ? {} : { icon: text(input.icon, 80, 'Badge icon') }),
    ...(input.category === undefined
      ? {}
      : { category: text(input.category, 80, 'Badge category') }),
    ...(input.condition === undefined
      ? {}
      : { condition: normalizeBadgeCondition(input.condition) }),
    ...(input.awardLevel === undefined ? {} : { awardLevel: awardLevel(input.awardLevel) }),
    ...(input.isVisible === undefined ? {} : { isVisible: input.isVisible }),
    ...(input.isEnabled === undefined ? {} : { isEnabled: input.isEnabled }),
  });
}

export function conditionProgress(condition: BadgeCondition, metrics: BadgeMetrics): number {
  switch (condition.type) {
    case 'TASK_COMPLETION_COUNT':
      return metrics.taskCompletionCount;
    case 'STREAK_DAYS':
      return metrics.streakDays;
    case 'TOTAL_POINTS':
      return metrics.totalPoints;
    case 'LEVEL_REACHED':
      return metrics.level;
    case 'COLLABORATION_COUNT':
      return metrics.collaborationCount;
    case 'MANUAL':
      return 0;
  }
}

export type BadgeMetrics = Readonly<{
  taskCompletionCount: number;
  streakDays: number;
  totalPoints: number;
  level: number;
  collaborationCount: number;
}>;

export function calculateStreakDays(values: readonly Date[]): number {
  const days = [...new Set(values.map((value) => value.toISOString().slice(0, 10)))]
    .sort()
    .reverse();
  if (days.length === 0) return 0;
  let streak = 1;
  let previous = new Date(`${days[0]}T00:00:00.000Z`);
  for (const value of days.slice(1)) {
    const current = new Date(`${value}T00:00:00.000Z`);
    if (previous.getTime() - current.getTime() !== 86_400_000) break;
    streak += 1;
    previous = current;
  }
  return streak;
}
