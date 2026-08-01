import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthApiError, authApi, loginErrorMessage } from './auth';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('authApi', () => {
  it('uses the versioned same-origin API and returns successful data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { role: 'parent' },
          meta: { request_id: 'request-1', timestamp: '2026-08-01T00:00:00.000Z' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(authApi<{ role: string }>('/auth/session')).resolves.toEqual({ role: 'parent' });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/session', {
      credentials: 'include',
      headers: {},
    });
  });

  it('preserves request headers and maps failed envelopes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests.',
            details: { retry_after_seconds: 120 },
          },
          meta: { request_id: 'request-2', timestamp: '2026-08-01T00:00:00.000Z' },
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = authApi('/auth/child/login', {
      method: 'POST',
      headers: { 'X-Request-Id': 'request-2' },
      body: JSON.stringify({ family_code: 'STARFAM001' }),
    });

    await expect(request).rejects.toMatchObject({
      name: 'AuthApiError',
      status: 429,
      code: 'RATE_LIMITED',
      details: { retry_after_seconds: 120 },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/child/login',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'request-2' },
      }),
    );
  });
});

describe('loginErrorMessage', () => {
  it.each([
    [
      new AuthApiError('locked', 401, 'UNAUTHORIZED', { remaining_seconds: 61 }),
      'PIN 尝试次数较多，请在 2 分钟后重试',
    ],
    [
      new AuthApiError('limited', 429, 'RATE_LIMITED', { retry_after_seconds: 60 }),
      '操作太频繁，请在 1 分钟后重试',
    ],
    [new AuthApiError('invalid', 400), '请检查填写内容是否完整、格式是否正确'],
    [new AuthApiError('unauthorized', 401), '登录信息有误，请检查后重试'],
    [new AuthApiError('conflict', 409), '这个邮箱已加入家庭，请直接登录'],
    [new TypeError('network'), '网络连接遇到问题，请稍后重试'],
  ])('maps authentication failures to actionable Chinese messages', (error, expected) => {
    expect(loginErrorMessage(error)).toBe(expected);
  });
});
