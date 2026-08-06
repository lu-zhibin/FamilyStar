import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

import type { AppEnvironment } from '../http/types.js';
import { registerAnalyticsRoutes } from './routes.js';
import type { AnalyticsOperations } from './types.js';

function operations(): AnalyticsOperations {
  return {
    getAnalytics: vi.fn().mockResolvedValue({
      range: {
        startDate: '2026-08-01',
        endDate: '2026-08-06',
        timeZone: 'Asia/Shanghai',
        dayCount: 6,
      },
      filters: { childId: null, taskId: null },
      overview: { scheduledCount: 4, completedCount: 3, completionRate: 0.75, pointsEarned: 20 },
      pointsTrend: [{ date: '2026-08-01', pointsEarned: 5 }],
      taskPerformance: [
        {
          taskId: 'task-1',
          taskName: 'Read',
          scheduledCount: 4,
          completedCount: 3,
          completionRate: 0.75,
        },
      ],
      levelDistribution: [{ level: 2, childCount: 1 }],
    }),
    getRankings: vi.fn().mockResolvedValue({
      metric: 'level',
      period: 'week',
      range: { startDate: '2026-08-03', endDate: '2026-08-06', timeZone: 'Asia/Shanghai' },
      items: [
        {
          rank: 1,
          childId: 'child-1',
          nickname: 'Star',
          value: 3,
          periodEarned: 10,
          isCurrentUser: true,
        },
      ],
    }),
  };
}

function app(source: AnalyticsOperations) {
  const api = new Hono<AppEnvironment>();
  api.use('*', async (context, next) => {
    context.set('requestId', 'request-1');
    await next();
  });
  registerAnalyticsRoutes(api, source, false);
  return api;
}

describe('analytics HTTP routes', () => {
  it('serializes analytics with snake_case fields', async () => {
    const source = operations();
    const response = await app(source).request(
      '/family/analytics?start_date=2026-08-01&end_date=2026-08-06',
      { headers: { cookie: 'familystar_session=parent' } },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('familystar_session=parent');
    expect(await response.json()).toMatchObject({
      data: {
        range: { start_date: '2026-08-01', day_count: 6 },
        overview: { completion_rate: 0.75, points_earned: 20 },
        points_trend: [{ points_earned: 5 }],
        task_performance: [{ task_name: 'Read' }],
        level_distribution: [{ child_count: 1 }],
      },
    });
  });

  it('validates required and enum query parameters', async () => {
    const source = operations();
    expect((await app(source).request('/family/analytics')).status).toBe(400);
    expect((await app(source).request('/rankings?metric=score&period=week')).status).toBe(400);
    expect(
      (await app(source).request('/rankings?metric=level&period=week&family_scope=all')).status,
    ).toBe(400);
  });

  it('serializes period level rankings', async () => {
    const source = operations();
    const response = await app(source).request('/rankings?metric=level&period=week', {
      headers: { cookie: 'familystar_session=child' },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        metric: 'level',
        period: 'week',
        items: [{ rank: 1, child_id: 'child-1', period_earned: 10, is_current_user: true }],
      },
    });
  });
});
