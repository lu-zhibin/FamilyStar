import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ChildPointsView, ChildRankingsView } from './child-points-rankings';

describe('ChildPointsView', () => {
  const points = { child_id: 'child-1', points_balance: 80, points_earned_total: 120 };

  it('renders current balances and positive and negative ledger entries', () => {
    const markup = renderToStaticMarkup(
      <ChildPointsView
        points={points}
        state="live"
        page={{ next_cursor: 'next-token', has_more: true }}
        onRetry={() => undefined}
        onLoadMore={() => undefined}
        logs={[
          {
            id: 'log-1',
            type: 'EARN',
            business_type: 'check_in',
            business_id: 'check-in-1',
            delta: 20,
            balance_before: 60,
            balance_after: 80,
            earned_total_after: 120,
            remark: null,
            created_at: '2026-08-06T08:00:00.000Z',
          },
          {
            id: 'log-2',
            type: 'REDEEM',
            business_type: 'redemption',
            business_id: 'redemption-1',
            delta: -30,
            balance_before: 110,
            balance_after: 80,
            earned_total_after: 120,
            remark: '兑换周末电影',
            created_at: '2026-08-05T08:00:00.000Z',
          },
        ]}
      />,
    );
    expect(markup).toContain('当前余额');
    expect(markup).toContain('累计获得');
    expect(markup).toContain('+20 星');
    expect(markup).toContain('-30 星');
    expect(markup).toContain('加载更多');
  });

  it('renders empty and retained-page error states', () => {
    const empty = renderToStaticMarkup(
      <ChildPointsView
        points={points}
        logs={[]}
        page={{ next_cursor: null, has_more: false }}
        state="empty"
        onRetry={() => undefined}
        onLoadMore={() => undefined}
      />,
    );
    const pageError = renderToStaticMarkup(
      <ChildPointsView
        points={points}
        logs={[
          {
            id: 'log-1',
            type: 'EARN',
            business_type: 'check_in',
            business_id: 'check-in-1',
            delta: 10,
            balance_before: 70,
            balance_after: 80,
            earned_total_after: 120,
            remark: null,
            created_at: '2026-08-06T08:00:00.000Z',
          },
        ]}
        page={{ next_cursor: 'next-token', has_more: true }}
        state="live"
        pageError
        onRetry={() => undefined}
        onLoadMore={() => undefined}
      />,
    );
    expect(empty).toContain('还没有积分流水');
    expect(pageError).toContain('现有记录已保留');
    expect(pageError).toContain('重试加载更多');
  });
});

describe('ChildRankingsView', () => {
  it('renders a single current member and tied ranks', () => {
    const single = renderToStaticMarkup(
      <ChildRankingsView
        state="live"
        onRetry={() => undefined}
        rankings={{
          metric: 'balance',
          period: 'all',
          range: null,
          items: [
            {
              rank: 1,
              child_id: 'child-1',
              nickname: '小星',
              value: 80,
              is_current_user: true,
            },
          ],
        }}
      />,
    );
    const tied = renderToStaticMarkup(
      <ChildRankingsView
        state="live"
        onRetry={() => undefined}
        rankings={{
          metric: 'level',
          period: 'week',
          range: {
            start_date: '2026-08-03',
            end_date: '2026-08-09',
            time_zone: 'Asia/Shanghai',
          },
          items: [
            {
              rank: 1,
              child_id: 'child-1',
              nickname: '小星',
              value: 3,
              period_earned: 20,
              is_current_user: true,
            },
            {
              rank: 1,
              child_id: 'child-2',
              nickname: '小月',
              value: 3,
              period_earned: 10,
              is_current_user: false,
            },
          ],
        }}
      />,
    );
    expect(single).toContain('小星（我）');
    expect(single).toContain('80 星');
    expect(tied.match(/>1</g)).toHaveLength(2);
    expect(tied).toContain('Lv.3');
    expect(tied).toContain('本周期新增 20 星');
  });

  it('renders a retryable ranking error', () => {
    const markup = renderToStaticMarkup(
      <ChildRankingsView rankings={null} state="error" onRetry={() => undefined} />,
    );
    expect(markup).toContain('家庭排行暂时无法读取');
    expect(markup).toContain('重新加载');
  });

  it('renders a real empty ranking state', () => {
    const markup = renderToStaticMarkup(
      <ChildRankingsView
        rankings={{ metric: 'earned', period: 'month', range: null, items: [] }}
        state="empty"
        onRetry={() => undefined}
      />,
    );
    expect(markup).toContain('家庭排行还是空的');
  });
});
