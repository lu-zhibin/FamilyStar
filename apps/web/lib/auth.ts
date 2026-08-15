import type { ApiResponse } from '@familystar/shared';

export type SessionIdentity = {
  role: 'parent' | 'child';
  subject_id: string;
  family_id: string;
  family_code: string;
};

export type ParentAuthResult = {
  parent: {
    id: string;
    familyId: string;
    familyCode: string;
    nickname: string;
    email: string;
  };
};

export type ChildLoginProfile = {
  id: string;
  nickname: string;
  grade: string | null;
  avatar_media_id: string | null;
};

export type ChildFamilyResult = {
  family: { name: string; family_code: string };
  children: ChildLoginProfile[];
};

const storedIdentityKeys = [
  'familystar_role',
  'familystar_family_code',
  'familystar_child_id',
] as const;

export function clearStoredIdentity(storage: Pick<Storage, 'removeItem'>): void {
  for (const key of storedIdentityKeys) storage.removeItem(key);
}

export class AuthApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AuthApiError';
  }
}

export async function authApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    credentials: 'include',
    ...init,
    headers: init?.body
      ? { 'Content-Type': 'application/json', ...init.headers }
      : { ...init?.headers },
  });
  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;

  if (!response.ok || !payload?.success) {
    const error = payload && !payload.success ? payload.error : undefined;
    throw new AuthApiError(
      error?.message ?? '服务暂时不可用，请稍后再试',
      response.status,
      error?.code,
      error?.details,
    );
  }

  return payload.data;
}

export function loginErrorMessage(error: unknown): string {
  if (!(error instanceof AuthApiError)) return '网络连接遇到问题，请稍后重试';
  const lockedSeconds = Number(error.details?.remaining_seconds);
  if (Number.isFinite(lockedSeconds) && lockedSeconds > 0) {
    return `PIN 尝试次数较多，请在 ${Math.ceil(lockedSeconds / 60)} 分钟后重试`;
  }
  const retrySeconds = Number(error.details?.retry_after_seconds);
  if (Number.isFinite(retrySeconds) && retrySeconds > 0) {
    return `操作太频繁，请在 ${Math.ceil(retrySeconds / 60)} 分钟后重试`;
  }
  if (error.status === 401) return '登录信息有误，请检查后重试';
  if (error.status === 409) return '这个邮箱已加入家庭，请直接登录';
  if (error.status === 400) return '请检查填写内容是否完整、格式是否正确';
  return '服务暂时不可用，请稍后再试';
}
