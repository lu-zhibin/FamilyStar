import type { ApiResponse } from '@familystar/shared';

export const childSections = [
  'home',
  'check-ins',
  'achievements',
  'rewards',
  'records',
  'profile',
] as const;

export type ChildSection = (typeof childSections)[number];

export const childSectionPaths: Record<ChildSection, string> = {
  home: '/child',
  'check-ins': '/child/check-ins',
  achievements: '/child/achievements',
  rewards: '/child/rewards',
  records: '/child/records',
  profile: '/child/profile',
};

export function isChildSection(value: string): value is ChildSection {
  return childSections.includes(value as ChildSection);
}

export function canAccessChildPortal(role: string | null): boolean {
  return role === null || role === 'child';
}

export class ChildApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ChildApiError';
  }
}

export async function childApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;

  if (!response.ok || !payload?.success) {
    const error = payload && !payload.success ? payload.error : undefined;
    throw new ChildApiError(
      error?.message ?? '服务暂时不可用，请稍后再试',
      response.status,
      error?.code,
      error?.details,
    );
  }

  return payload.data;
}

export function createIdempotencyKey(
  scope: string,
  randomUuid: () => string = () => crypto.randomUUID(),
): string {
  return `${scope}-${randomUuid()}`;
}

export function effectiveRewardCost(pointsCost: number, discount: number): number {
  return Math.max(1, Math.round(pointsCost * discount));
}

export function belongsToCurrentChild<T extends { child_id: string }>(
  records: readonly T[],
  childId: string,
): T[] {
  return records.filter((record) => record.child_id === childId);
}

export function currentCalendarDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}
