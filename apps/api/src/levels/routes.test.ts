import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { LevelAccessError } from './service.js';
import type { LevelOperations, LevelView } from './types.js';

const view: LevelView = {
  userId: 'child-1',
  pointsEarnedTotal: 55,
  eligibleLevel: 2,
  current: {
    level: 2,
    name: 'Two',
    icon: 'two',
    pointsRequired: 30,
    discount: 0.9,
    autoApproveQuota: 30,
    wishSlots: 2,
    extraDimensions: null,
  },
  benefits: {
    discount: 0.9,
    levelAutoApproveQuota: 30,
    effectiveAutoApproveQuota: 50,
    wishSlots: 2,
    extraDimensions: null,
  },
  next: null,
};

function operations(): LevelOperations {
  return {
    getMe: vi.fn().mockResolvedValue({ level: view }),
    getChild: vi.fn().mockResolvedValue({ level: view }),
  };
}

describe('level HTTP routes', () => {
  beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('returns the child level in snake_case and renews the cookie', async () => {
    const levelOperations = operations();
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', levelOperations });
    const response = await app.request('/api/v1/levels/me', {
      headers: { cookie: 'familystar_session=child-session' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('familystar_session=child-session');
    expect(levelOperations.getMe).toHaveBeenCalledWith({ sessionToken: 'child-session' });
    expect(await response.json()).toMatchObject({
      data: {
        level: {
          user_id: 'child-1',
          points_earned_total: 55,
          current_level: 2,
          benefits: { effective_auto_approve_quota: 50 },
          next: null,
        },
      },
    });
  });

  it('passes the child path to the parent operation', async () => {
    const levelOperations = operations();
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', levelOperations });
    const response = await app.request('/api/v1/family/children/child-2/level', {
      headers: { cookie: 'familystar_session=parent-session' },
    });

    expect(response.status).toBe(200);
    expect(levelOperations.getChild).toHaveBeenCalledWith({
      sessionToken: 'parent-session',
      childId: 'child-2',
    });
  });

  it.each([
    ['UNAUTHORIZED', 401],
    ['FORBIDDEN', 403],
    ['NOT_FOUND', 404],
  ] as const)('maps %s to a stable HTTP error', async (code, status) => {
    const levelOperations = operations();
    vi.mocked(levelOperations.getMe).mockRejectedValue(new LevelAccessError(code, 'Denied.'));
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', levelOperations });
    const response = await app.request('/api/v1/levels/me');

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: { code } });
  });
});
