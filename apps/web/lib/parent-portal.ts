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
export type ReviewTargetType = 'CHECK_IN' | 'COLLABORATION_SUBMISSION';

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

export function buildSoloTaskDraft(form: Pick<FormData, 'get'>, startDate: string) {
  const description = String(form.get('description') ?? '').trim();

  return {
    task_type_id: String(form.get('task_type_id') ?? ''),
    name: String(form.get('name') ?? ''),
    ...(description ? { description } : {}),
    check_type: String(form.get('check_type') ?? ''),
    verify_mode: String(form.get('verify_mode') ?? ''),
    collaboration_mode: 'SOLO',
    frequency: { kind: 'daily' },
    base_points: Number(form.get('base_points')),
    assignments: [
      {
        child_id: String(form.get('child_id') ?? ''),
        start_date: startDate,
      },
    ],
  };
}

export function buildSubmissionReviewRequest(
  target: { target_type: ReviewTargetType; target_id: string; attempt_id: string },
  status: 'APPROVED' | 'REJECTED',
  reason?: string,
) {
  const normalizedReason = reason?.trim();
  return {
    path:
      target.target_type === 'CHECK_IN'
        ? `/check-ins/${target.target_id}/reviews`
        : `/collaboration-submissions/${target.target_id}/reviews`,
    idempotencyKey: `review:${target.attempt_id}:${status}`,
    body: {
      status,
      ...(normalizedReason ? { reason: normalizedReason } : {}),
    },
  };
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

type ClipboardWriter = { writeText: (text: string) => Promise<void> };

export async function copyTextToClipboard(
  text: string,
  options: {
    clipboard?: ClipboardWriter | null;
    legacyCopy?: (value: string) => boolean;
  } = {},
): Promise<void> {
  const clipboard =
    options.clipboard === undefined
      ? typeof navigator === 'undefined'
        ? undefined
        : navigator.clipboard
      : options.clipboard;

  if (clipboard) {
    await clipboard.writeText(text);
    return;
  }

  const copied = (options.legacyCopy ?? copyTextUsingSelection)(text);
  if (!copied) throw new Error('Clipboard access is unavailable.');
}

function copyTextUsingSelection(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand('copy');
  } finally {
    textarea.remove();
  }
}

export function formatFrequency(frequency: { kind: string; count?: number }): string {
  if (frequency.kind === 'daily') return '每天';
  if (frequency.kind === 'weekly_count') return `每周 ${frequency.count ?? 1} 次`;
  if (frequency.kind === 'weekdays') return '指定星期';
  return '日期范围';
}
