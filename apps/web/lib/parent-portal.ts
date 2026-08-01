import type { ApiResponse } from '@familystar/shared';

export const parentSections = [
  'dashboard',
  'tasks',
  'reviews',
  'rewards',
  'levels',
  'stats',
  'records',
  'family',
  'settings',
] as const;

export type ParentSection = (typeof parentSections)[number];

export const parentSectionPaths: Record<ParentSection, string> = {
  dashboard: '/dashboard',
  tasks: '/tasks',
  reviews: '/reviews',
  rewards: '/rewards',
  levels: '/levels',
  stats: '/stats',
  records: '/records',
  family: '/family',
  settings: '/settings',
};

export function isParentSection(value: string): value is ParentSection {
  return parentSections.includes(value as ParentSection);
}

export function canAccessParentPortal(role: string | null): boolean {
  return role === null || role === 'parent';
}

export class ParentApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ParentApiError';
  }
}

export async function parentApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;

  if (!response.ok || !payload?.success) {
    const message = payload && !payload.success ? payload.error.message : '服务暂时不可用';
    throw new ParentApiError(message, response.status);
  }

  return payload.data;
}

export function formatFrequency(frequency: { kind: string; count?: number }): string {
  if (frequency.kind === 'daily') return '每天';
  if (frequency.kind === 'weekly_count') return `每周 ${frequency.count ?? 1} 次`;
  if (frequency.kind === 'weekdays') return '指定星期';
  return '日期范围';
}
