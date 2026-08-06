import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ParentAnalyticsView, ParentDashboardView } from './parent-read-models';

describe('ParentDashboardView', () => {
  it('renders retryable loading and error states', () => {
    const loading = renderToStaticMarkup(
      <ParentDashboardView dashboard={null} state="loading" onRetry={() => undefined} />,
    );
    const error = renderToStaticMarkup(
      <ParentDashboardView dashboard={null} state="error" onRetry={() => undefined} />,
    );
    expect(loading).toContain('正在读取家庭总览');
    expect(error).toContain('家庭总览暂时无法读取');
    expect(error).toContain('重新加载');
  });

  it('renders child progress, todos, activity and their target links', () => {
    const markup = renderToStaticMarkup(
      <ParentDashboardView
        state="live"
        onRetry={() => undefined}
        dashboard={{
          date: '2026-08-06',
          time_zone: 'Asia/Shanghai',
          children: [
            {
              child_id: 'child-1',
              nickname: '小星',
              task_total: 4,
              completed_count: 3,
              pending_review_count: 1,
              points_earned: 20,
            },
          ],
          todos: {
            pending_reviews: { count: 1, target_url: '/reviews' },
            pending_redemptions: { count: 2, target_url: '/rewards' },
            pending_fulfillments: { count: 0, target_url: '/rewards' },
          },
          recent_activity: [
            {
              id: 'activity-1',
              type: 'POINTS_CHANGED',
              occurred_at: '2026-08-06T08:00:00.000Z',
              actor: null,
              child: { id: 'child-1', nickname: '小星' },
              entity_type: 'points_log',
              entity_id: 'points-1',
              target_url: '/levels',
              details: {},
            },
          ],
        }}
      />,
    );
    expect(markup).toContain('3 / 4 项已完成');
    expect(markup).toContain('+20 星');
    expect(markup).toContain('href="/reviews"');
    expect(markup).toContain('href="/rewards"');
    expect(markup).toContain('积分发生变化');
  });

  it('renders independent empty states for children, todos and activities', () => {
    const markup = renderToStaticMarkup(
      <ParentDashboardView
        state="live"
        onRetry={() => undefined}
        dashboard={{
          date: '2026-08-06',
          time_zone: 'Asia/Shanghai',
          children: [],
          todos: {
            pending_reviews: { count: 0, target_url: '/reviews' },
            pending_redemptions: { count: 0, target_url: '/rewards' },
            pending_fulfillments: { count: 0, target_url: '/rewards' },
          },
          recent_activity: [],
        }}
      />,
    );
    expect(markup).toContain('还没有活动孩子');
    expect(markup).toContain('今天的待办已处理完成');
    expect(markup).toContain('还没有近期动态');
  });
});

describe('ParentAnalyticsView', () => {
  it('renders zero-plan analytics without inventing a completion rate', () => {
    const markup = renderToStaticMarkup(
      <ParentAnalyticsView
        state="live"
        onRetry={() => undefined}
        analytics={{
          range: {
            start_date: '2026-08-01',
            end_date: '2026-08-06',
            time_zone: 'Asia/Shanghai',
            day_count: 6,
          },
          filters: { child_id: null, task_id: null },
          overview: {
            scheduled_count: 0,
            completed_count: 0,
            completion_rate: null,
            points_earned: 0,
          },
          points_trend: [{ date: '2026-08-01', points_earned: 0 }],
          task_performance: [],
          level_distribution: [],
        }}
      />,
    );
    expect(markup).toContain('暂无计划');
    expect(markup).toContain('当前筛选下没有计划任务');
    expect(markup).toContain('当前筛选下没有孩子');
  });

  it('renders points trend, task performance and level distribution', () => {
    const markup = renderToStaticMarkup(
      <ParentAnalyticsView
        state="live"
        onRetry={() => undefined}
        analytics={{
          range: {
            start_date: '2026-08-01',
            end_date: '2026-08-06',
            time_zone: 'Asia/Shanghai',
            day_count: 6,
          },
          filters: { child_id: null, task_id: null },
          overview: {
            scheduled_count: 4,
            completed_count: 3,
            completion_rate: 0.75,
            points_earned: 30,
          },
          points_trend: [{ date: '2026-08-06', points_earned: 30 }],
          task_performance: [
            {
              task_id: 'task-1',
              task_name: '晨读',
              scheduled_count: 4,
              completed_count: 3,
              completion_rate: 0.75,
            },
          ],
          level_distribution: [{ level: 3, child_count: 1 }],
        }}
      />,
    );
    expect(markup).toContain('75%');
    expect(markup).toContain('晨读');
    expect(markup).toContain('Lv.3');
    expect(markup).toContain('每日积分趋势');
  });
});
