import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import {
  ChildAuthenticationError,
  type ChildAccountOperations,
  ChildLockedError,
  ChildLoginRateLimitError,
} from './child-service.js';

const childId = '5ec163e7-2f0c-4b75-9855-d3ca73a4ae68';
const child = {
  id: childId,
  familyId: 'family-1',
  nickname: 'Child',
  credentialType: 'pin' as const,
  gender: 'female' as const,
  birthday: null,
  grade: null,
  avatarMediaId: null,
};

function operations(): ChildAccountOperations {
  return {
    async list() {
      return { children: [child] };
    },
    async create(input) {
      expect(input).toMatchObject({ sessionToken: 'parent-session', credentialType: 'pin' });
      return { child };
    },
    async update() {
      return { child };
    },
    async remove(input) {
      return { childId: input.childId };
    },
    async listSwitchTargets() {
      return { children: [child] };
    },
    async switchToChild(input) {
      expect(input).toEqual({
        sessionToken: 'parent-session',
        childId,
        credential: '1234',
      });
      return { child, sessionToken: 'child-session' };
    },
    async changeOwnPassword(input) {
      expect(input).toEqual({
        sessionToken: 'child-session',
        currentPassword: 'oldSecret',
        newPassword: 'newSecret',
      });
      return { childId };
    },
  };
}

describe('child account HTTP routes', () => {
  beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('creates a child through an authenticated parent profile request', async () => {
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      childAccountService: operations(),
    });
    const response = await app.request('/api/v1/family/children', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'familystar_session=parent-session',
      },
      body: JSON.stringify({
        nickname: 'Child',
        credential_type: 'pin',
        credential: '1234',
        gender: 'female',
      }),
    });

    expect(response.status).toBe(201);
    expect(response.headers.get('set-cookie')).toContain('familystar_session=parent-session');
    expect(await response.json()).toMatchObject({
      success: true,
      data: { child: { id: childId } },
    });
  });

  it('switches to a child and replaces the session cookie', async () => {
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      childAccountService: operations(),
    });
    const response = await app.request('/api/v1/auth/child/switch', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'familystar_session=parent-session',
      },
      body: JSON.stringify({ child_id: childId, credential: '1234' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('familystar_session=child-session');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(await response.json()).toMatchObject({ data: { child: { id: childId } } });
  });

  it('maps invalid account credentials to a stable unauthorized response', async () => {
    const childAccounts = operations();
    childAccounts.switchToChild = async () => {
      throw new ChildAuthenticationError('Invalid child profile or credential.');
    };
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      childAccountService: childAccounts,
    });
    const response = await app.request('/api/v1/auth/child/switch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ child_id: childId, credential: 'wrong' }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'UNAUTHORIZED' },
    });
  });

  it('returns lock and rate-limit countdown details without replacing the cookie', async () => {
    const lockedAccounts = operations();
    lockedAccounts.switchToChild = async () => {
      throw new ChildLockedError(654);
    };
    const lockedApp = createApp({
      publicBaseUrl: 'http://localhost:3000',
      childAccountService: lockedAccounts,
    });
    const lockedResponse = await lockedApp.request('/api/v1/auth/child/switch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ child_id: childId, credential: 'wrong' }),
    });

    expect(lockedResponse.status).toBe(401);
    expect(lockedResponse.headers.get('set-cookie')).toBeNull();
    expect(await lockedResponse.json()).toMatchObject({
      error: { code: 'UNAUTHORIZED', details: { remaining_seconds: 654 } },
    });

    const limitedAccounts = operations();
    limitedAccounts.switchToChild = async () => {
      throw new ChildLoginRateLimitError(321);
    };
    const limitedApp = createApp({
      publicBaseUrl: 'http://localhost:3000',
      childAccountService: limitedAccounts,
    });
    const limitedResponse = await limitedApp.request('/api/v1/auth/child/switch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ child_id: childId, credential: 'wrong' }),
    });

    expect(limitedResponse.status).toBe(429);
    expect(await limitedResponse.json()).toMatchObject({
      error: { code: 'RATE_LIMITED', details: { retry_after_seconds: 321 } },
    });
  });

  it('changes a password for the current child and clears the session cookie', async () => {
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      childAccountService: operations(),
    });
    const response = await app.request('/api/v1/auth/child/password', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        cookie: 'familystar_session=child-session',
      },
      body: JSON.stringify({ current_password: 'oldSecret', new_password: 'newSecret' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('familystar_session=');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(await response.json()).toMatchObject({ data: { childId } });
  });
});
