import type { ApiResponse } from '@familystar/shared';

export const parentSections = [
  'dashboard',
  'tasks',
  'reviews',
  'rewards',
  'levels',
  'badges',
  'stats',
  'records',
  'family',
  'settings',
] as const;

export type ParentSection = (typeof parentSections)[number];
export type ReviewTargetType = 'CHECK_IN' | 'COLLABORATION_SUBMISSION';
export type ReviewHistoryFilters = Readonly<{
  childId?: string;
  taskId?: string;
  result?: 'APPROVED' | 'REJECTED';
  startDate?: string;
  endDate?: string;
}>;
export type IntegrationType = 'email' | 'cos';
export type IntegrationStatus = 'pending' | 'verified' | 'invalid' | null;
export type ChildCredentialType = 'pin' | 'password';
export type ParentChild = Readonly<{
  id: string;
  nickname: string;
  credentialType: ChildCredentialType;
  gender: 'male' | 'female';
  birthday: string | null;
  grade: string | null;
  avatarMediaId: string | null;
}>;
export type FamilyProfile = Readonly<{
  id: string;
  name: string;
  time_zone: string;
  parents: ReadonlyArray<{
    id: string;
    nickname: string;
    email: string | null;
    is_creator: boolean;
    joined_at: string;
  }>;
  invitations: ReadonlyArray<{
    id: string;
    email: string;
    status: 'pending' | 'expired';
    expires_at: string;
    created_at: string;
  }>;
  permissions: {
    can_update_name: boolean;
    can_manage_invitations: boolean;
  };
}>;
export type IntegrationResource = Readonly<{
  configured: boolean;
  status: IntegrationStatus;
  configuration: Record<string, unknown> | null;
  credentials_configured: boolean;
  last_verified_at: string | null;
  last_verification_result: { code?: string } | null;
  can_manage: boolean;
}>;

export type EmailIntegrationDraft = Readonly<{
  host: string;
  port: string;
  tlsMode: 'none' | 'starttls' | 'tls';
  fromName: string;
  fromAddress: string;
  username: string;
  password: string;
}>;

export type CosIntegrationDraft = Readonly<{
  bucket: string;
  region: string;
  domain: string;
  secretId: string;
  secretKey: string;
}>;

export const parentSectionPaths: Record<ParentSection, string> = {
  dashboard: '/dashboard',
  tasks: '/tasks',
  reviews: '/reviews',
  rewards: '/rewards',
  levels: '/levels',
  badges: '/badges',
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

type TaskFormData = Pick<FormData, 'get' | 'getAll'>;
type ChildFormData = Pick<FormData, 'get'>;
type RewardFormData = Pick<FormData, 'get'>;
export type TaskCollaborationMode = 'SOLO' | 'COLLAB';
export type TaskCheckType = 'TICK' | 'TEXT' | 'PHOTO' | 'VIDEO' | 'MIXED';
export type TaskVerifyMode = 'AUTO' | 'MANUAL';
export type TaskStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type TaskFrequency =
  | Readonly<{ kind: 'daily' }>
  | Readonly<{ kind: 'weekly_count'; count: number }>
  | Readonly<{ kind: 'weekdays'; weekdays: readonly number[] }>
  | Readonly<{ kind: 'date_range'; start_date: string; end_date: string }>;
export type TaskAssignment = Readonly<{
  id?: string;
  child_id: string;
  custom_points?: number;
  custom_frequency?: TaskFrequency;
  custom_check_type?: TaskCheckType;
  custom_verify_mode?: TaskVerifyMode;
  start_date: string;
  end_date?: string;
}>;
export type ParentTask = Readonly<{
  id: string;
  task_type_id: string;
  name: string;
  description: string | null;
  submission_guide: string | null;
  base_points: number;
  status: TaskStatus;
  check_type: TaskCheckType;
  verify_mode: TaskVerifyMode;
  collaboration_mode: TaskCollaborationMode;
  frequency: TaskFrequency;
  assignments: readonly TaskAssignment[];
}>;
export type ParentTaskType = Readonly<{
  id: string;
  template_code: string | null;
  name: string;
  icon: string;
  default_verify_mode: TaskVerifyMode;
  is_enabled: boolean;
  sort_order: number;
}>;
export type RewardType = 'PHYSICAL' | 'PRIVILEGE' | 'EXPERIENCE' | 'CUSTOM';
export type RewardStatus = 'ACTIVE' | 'INACTIVE';
export type RewardPrerequisites = Readonly<{
  min_level?: number;
  redeem_limit?: Readonly<{
    per_day?: number;
    per_week?: number;
    per_month?: number;
  }>;
}>;
export type ParentReward = Readonly<{
  id: string;
  family_id: string;
  name: string;
  description: string | null;
  image_media_id: string | null;
  points_cost: number;
  type: RewardType;
  stock_total: number | null;
  stock_reserved: number;
  stock_consumed: number;
  stock_available: number | null;
  prerequisites: RewardPrerequisites;
  status: RewardStatus;
  created_at: string;
  updated_at: string;
}>;

export function familyNaturalDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function buildFamilyProfilePatch(form: ChildFormData, canUpdateName: boolean) {
  const name = String(form.get('name') ?? '').trim();
  const timeZone = String(form.get('time_zone') ?? '').trim();
  return {
    ...(canUpdateName ? { name } : {}),
    time_zone: timeZone,
  };
}

export function buildChildProfilePatch(form: ChildFormData, avatarMediaId?: string | null) {
  const birthday = String(form.get('birthday') ?? '').trim();
  const grade = String(form.get('grade') ?? '').trim();
  return {
    nickname: String(form.get('nickname') ?? '').trim(),
    gender: String(form.get('gender') ?? '') as ParentChild['gender'],
    birthday: birthday || null,
    grade: grade || null,
    ...(avatarMediaId === undefined ? {} : { avatar_media_id: avatarMediaId }),
  };
}

export function buildChildCredentialPatch(form: ChildFormData) {
  const credentialType = String(form.get('credential_type') ?? '');
  const credential = String(form.get('credential') ?? '');
  const confirmation = String(form.get('credential_confirmation') ?? '');
  if (credentialType !== 'pin' && credentialType !== 'password') {
    throw new Error('请选择有效的登录凭据模式。');
  }
  if (credential !== confirmation) throw new Error('两次输入的凭据不一致。');
  if (credentialType === 'pin' && !/^\d{4,6}$/.test(credential)) {
    throw new Error('PIN 需要填写 4 至 6 位数字。');
  }
  if (credentialType === 'password' && (credential.length < 6 || !/[A-Za-z]/.test(credential))) {
    throw new Error('密码至少 6 位，并且需要包含字母。');
  }
  return { credential_type: credentialType, credential };
}

export function buildTaskFrequency(form: TaskFormData): TaskFrequency {
  const kind = String(form.get('frequency_kind') ?? 'daily');
  if (kind === 'weekly_count') {
    return { kind, count: Number(form.get('frequency_count')) };
  }
  if (kind === 'weekdays') {
    return { kind, weekdays: form.getAll('frequency_weekdays').map(Number) };
  }
  if (kind === 'date_range') {
    return {
      kind,
      start_date: String(form.get('frequency_start_date') ?? ''),
      end_date: String(form.get('frequency_end_date') ?? ''),
    };
  }
  return { kind: 'daily' };
}

function optionalNumber(form: Pick<FormData, 'get'>, name: string): number | undefined {
  const value = String(form.get(name) ?? '').trim();
  return value ? Number(value) : undefined;
}

function assignmentFrequency(form: TaskFormData, childId: string): TaskFrequency | undefined {
  const suffix = `:${childId}`;
  const kind = String(form.get(`custom_frequency_kind${suffix}`) ?? '');
  if (!kind) return undefined;
  if (kind === 'weekly_count') {
    return { kind, count: Number(form.get(`custom_frequency_count${suffix}`)) };
  }
  if (kind === 'weekdays') {
    return {
      kind,
      weekdays: form.getAll(`custom_frequency_weekdays${suffix}`).map(Number),
    };
  }
  if (kind === 'date_range') {
    return {
      kind,
      start_date: String(form.get(`custom_frequency_start_date${suffix}`) ?? ''),
      end_date: String(form.get(`custom_frequency_end_date${suffix}`) ?? ''),
    };
  }
  if (kind === 'daily') return { kind };
  throw new Error('请选择有效的逐孩频率。');
}

function buildTaskAssignments(form: TaskFormData, startDate: string, mode: TaskCollaborationMode) {
  const childIds = [...new Set(form.getAll('child_id').map(String).filter(Boolean))];
  if (mode === 'SOLO' && childIds.length === 0) {
    throw new Error('单人任务至少需要选择一名孩子。');
  }
  if (mode === 'COLLAB' && childIds.length < 2) {
    throw new Error('协作任务至少需要选择两名孩子。');
  }
  return childIds.map((childId): TaskAssignment => {
    const suffix = `:${childId}`;
    const customPoints = optionalNumber(form, `custom_points${suffix}`);
    const customFrequency = assignmentFrequency(form, childId);
    const customCheckType = String(form.get(`custom_check_type${suffix}`) ?? '') as
      TaskCheckType | '';
    const customVerifyMode = String(form.get(`custom_verify_mode${suffix}`) ?? '') as
      TaskVerifyMode | '';
    const assignmentStartDate = String(form.get(`start_date${suffix}`) ?? '').trim() || startDate;
    const endDate = String(form.get(`end_date${suffix}`) ?? '').trim();
    return {
      child_id: childId,
      start_date: assignmentStartDate,
      ...(endDate ? { end_date: endDate } : {}),
      ...(customPoints === undefined ? {} : { custom_points: customPoints }),
      ...(customFrequency === undefined ? {} : { custom_frequency: customFrequency }),
      ...(customCheckType ? { custom_check_type: customCheckType } : {}),
      ...(customVerifyMode ? { custom_verify_mode: customVerifyMode } : {}),
    };
  });
}

export function buildTaskDraft(form: TaskFormData, startDate: string) {
  const description = String(form.get('description') ?? '').trim();
  const submissionGuide = String(form.get('submission_guide') ?? '').trim();
  const collaborationMode = String(form.get('collaboration_mode') ?? 'SOLO');
  if (collaborationMode !== 'SOLO' && collaborationMode !== 'COLLAB') {
    throw new Error('请选择有效的任务模式。');
  }

  return {
    task_type_id: String(form.get('task_type_id') ?? ''),
    name: String(form.get('name') ?? ''),
    ...(description ? { description } : {}),
    ...(submissionGuide ? { submission_guide: submissionGuide } : {}),
    check_type: String(form.get('check_type') ?? '') as TaskCheckType,
    verify_mode: String(form.get('verify_mode') ?? '') as TaskVerifyMode,
    collaboration_mode: collaborationMode,
    frequency: buildTaskFrequency(form),
    base_points: Number(form.get('base_points')),
    assignments: buildTaskAssignments(form, startDate, collaborationMode),
  };
}

export function buildTaskPatch(form: TaskFormData, startDate = '') {
  const description = String(form.get('description') ?? '').trim();
  const submissionGuide = String(form.get('submission_guide') ?? '').trim();
  const collaborationMode = String(form.get('collaboration_mode') ?? 'SOLO');
  if (collaborationMode !== 'SOLO' && collaborationMode !== 'COLLAB') {
    throw new Error('请选择有效的任务模式。');
  }

  return {
    task_type_id: String(form.get('task_type_id') ?? ''),
    name: String(form.get('name') ?? '').trim(),
    description: description || null,
    submission_guide: submissionGuide || null,
    check_type: String(form.get('check_type') ?? '') as TaskCheckType,
    verify_mode: String(form.get('verify_mode') ?? '') as TaskVerifyMode,
    collaboration_mode: collaborationMode,
    frequency: buildTaskFrequency(form),
    base_points: Number(form.get('base_points')),
    assignments: buildTaskAssignments(form, startDate, collaborationMode),
  };
}

export function buildRewardPayload(
  form: RewardFormData,
  imageMediaId: string | null,
  status: RewardStatus,
) {
  const description = String(form.get('description') ?? '').trim();
  const minLevel = optionalNumber(form, 'min_level');
  const perDay = optionalNumber(form, 'per_day');
  const perWeek = optionalNumber(form, 'per_week');
  const perMonth = optionalNumber(form, 'per_month');
  const stockTotal = String(form.get('stock_total') ?? '').trim();
  const redeemLimit = {
    ...(perDay === undefined ? {} : { per_day: perDay }),
    ...(perWeek === undefined ? {} : { per_week: perWeek }),
    ...(perMonth === undefined ? {} : { per_month: perMonth }),
  };

  return {
    name: String(form.get('name') ?? '').trim(),
    description: description || null,
    image_media_id: imageMediaId,
    points_cost: Number(form.get('points_cost')),
    type: String(form.get('type') ?? '') as RewardType,
    stock_total: stockTotal ? Number(stockTotal) : null,
    prerequisites: {
      ...(minLevel === undefined ? {} : { min_level: minLevel }),
      ...(Object.keys(redeemLimit).length === 0 ? {} : { redeem_limit: redeemLimit }),
    },
    status,
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

export function buildReviewHistoryPath(filters: ReviewHistoryFilters): string {
  const query = new URLSearchParams({ limit: '50' });
  if (filters.childId) query.set('child_id', filters.childId);
  if (filters.taskId) query.set('task_id', filters.taskId);
  if (filters.result) query.set('result', filters.result);
  if (filters.startDate) query.set('start_date', filters.startDate);
  if (filters.endDate) query.set('end_date', filters.endDate);
  return `/family/submission-reviews/history?${query.toString()}`;
}

function optionalCredentials(
  configured: boolean,
  values: readonly [string, string],
  labels: readonly [string, string],
) {
  const normalized = values.map((value) => value.trim()) as [string, string];
  if (normalized.some(Boolean) && !normalized.every(Boolean)) {
    throw new Error(`${labels.join('和')}需要同时填写`);
  }
  if (!configured && !normalized.every(Boolean)) throw new Error(`${labels.join('和')}为必填项`);
  return normalized.every(Boolean) ? normalized : null;
}

export function buildEmailIntegrationPayload(draft: EmailIntegrationDraft, configured: boolean) {
  const credentials = optionalCredentials(
    configured,
    [draft.username, draft.password],
    ['SMTP 用户名', '密码或授权码'],
  );
  return {
    configuration: {
      host: draft.host.trim(),
      port: Number(draft.port),
      tls_mode: draft.tlsMode,
      from_name: draft.fromName.trim(),
      from_address: draft.fromAddress.trim(),
    },
    ...(credentials ? { credentials: { username: credentials[0], password: credentials[1] } } : {}),
  };
}

export function buildCosIntegrationPayload(draft: CosIntegrationDraft, configured: boolean) {
  const credentials = optionalCredentials(
    configured,
    [draft.secretId, draft.secretKey],
    ['SecretId', 'SecretKey'],
  );
  return {
    configuration: {
      bucket: draft.bucket.trim(),
      region: draft.region.trim(),
      domain: draft.domain.trim(),
    },
    ...(credentials
      ? { credentials: { secret_id: credentials[0], secret_key: credentials[1] } }
      : {}),
  };
}

export class ParentApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: Record<string, unknown>,
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
  if (response.ok && response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;

  if (!response.ok || !payload?.success) {
    const error = payload && !payload.success ? payload.error : undefined;
    throw new ParentApiError(
      error?.message ?? '服务暂时不可用',
      response.status,
      error?.code,
      error?.details,
    );
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
