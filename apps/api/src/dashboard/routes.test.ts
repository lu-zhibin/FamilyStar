import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

import type { AppEnvironment } from '../http/types.js';
import { InvalidQueryFilterError } from '../http/query-validation.js';
import { DashboardAccessError } from './service.js';
import { registerDashboardRoutes } from './routes.js';
import type { DashboardOperations } from './types.js';

function operations(): DashboardOperations {
  return {
    get: vi.fn().mockResolvedValue({
      dashboard: {
        date: '2026-08-06',
        timeZone: 'Asia/Shanghai',
        children: [
          {
            childId: 'child-1',
            nickname: '小星',
            taskTotal: 3,
            completedCount: 1,
            pendingReviewCount: 1,
            pointsEarned: 12,
          },
        ],
        todos: { pendingReviews: 2, pendingRedemptions: 1, pendingFulfillments: 1 },
        recentActivity: [
          {
            id: 'points:1',
            type: 'POINTS_CHANGED',
            occurredAt: new Date('2026-08-06T10:00:00.000Z'),
            actor: null,
            child: { id: 'child-1', nickname: '小星' },
            entityType: 'points_log',
            entityId: 'points-1',
            targetUrl: '/levels',
            details: { delta: 12 },
          },
        ],
      },
    }),
  };
}

function app(operations: DashboardOperations) {
  const api = new Hono<AppEnvironment>();
  api.use('*', async (context, next) => {
    context.set('requestId', 'request-1');
    await next();
  });
  registerDashboardRoutes(api, operations, false);
  return api;
}

describe('dashboard HTTP route', () => {
  beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('returns the isolated dashboard contract and renews the session', async () => {
    const dashboardOperations = operations();
    const response = await app(dashboardOperations).request('/family/dashboard?date=2026-08-06', {
      headers: { cookie: 'familystar_session=parent-session' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('familystar_session=parent-session');
    expect(dashboardOperations.get).toHaveBeenCalledWith({
      sessionToken: 'parent-session',
      date: '2026-08-06',
    });
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        date: '2026-08-06',
        time_zone: 'Asia/Shanghai',
        children: [
          {
            child_id: 'child-1',
            task_total: 3,
            completed_count: 1,
            pending_review_count: 1,
            points_earned: 12,
          },
        ],
        todos: {
          pending_reviews: { count: 2, target_url: '/reviews' },
          pending_redemptions: { count: 1, target_url: '/rewards' },
          pending_fulfillments: { count: 1, target_url: '/rewards' },
        },
        recent_activity: [
          {
            id: 'points:1',
            occurred_at: '2026-08-06T10:00:00.000Z',
            target_url: '/levels',
          },
        ],
      },
    });
  });

  it('requires the date query before calling operations', async () => {
    const dashboardOperations = operations();
    const response = await app(dashboardOperations).request('/family/dashboard');
    expect(response.status).toBe(400);
    expect(dashboardOperations.get).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
  });

  it.each([
    [new InvalidQueryFilterError('Invalid date.'), 400, 'INVALID_REQUEST'],
    [new DashboardAccessError('UNAUTHORIZED', 'Denied.'), 401, 'UNAUTHORIZED'],
    [new DashboardAccessError('FORBIDDEN', 'Denied.'), 403, 'FORBIDDEN'],
    [new DashboardAccessError('NOT_FOUND', 'Missing.'), 404, 'NOT_FOUND'],
  ] as const)('maps domain failures to stable responses', async (error, status, code) => {
    const dashboardOperations = operations();
    vi.mocked(dashboardOperations.get).mockRejectedValue(error);
    const response = await app(dashboardOperations).request('/family/dashboard?date=2026-08-06');
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: { code } });
  });
});
