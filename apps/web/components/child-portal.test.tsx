import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { childSections } from '../lib/child-portal';
import { ChildPortal, ChildRedemptionList, ChildWishWall } from './child-portal';

describe('ChildPortal', () => {
  it.each(childSections)(
    'renders the %s route loading boundary with shared navigation',
    (section) => {
      const markup = renderToStaticMarkup(<ChildPortal section={section} />);

      expect(markup).toContain('正在读取成长数据');
      expect(markup).toContain('孩子端主导航');
      expect(markup).toContain('aria-label="退出孩子端"');
      expect(markup).toContain('aria-current="page"');
      expect(markup).toContain('child-bottom-nav');
    },
  );

  it('does not render seeded identities, rewards, tasks, or wishes before API responses', () => {
    const markup = childSections
      .map((section) => renderToStaticMarkup(<ChildPortal section={section} />))
      .join('');

    expect(markup).not.toMatch(/潼潼|昊昊|妞妞|乐高千年隼/);
    expect(markup).not.toMatch(/晨读 20 分钟|动画时间 30 分钟|周末大扫除/);
  });

  it('renders all active wishes with real slot occupancy and cancellation locks', () => {
    const wish = {
      id: 'wish-1',
      child_id: 'child-1',
      title: '天文望远镜',
      target_points: 300,
      status: 'ACTIVE' as const,
      progress: { points: 120, ratio: 0.4 },
    };
    const markup = renderToStaticMarkup(
      <ChildWishWall
        wishes={[
          wish,
          { ...wish, id: 'wish-2', title: '露营' },
          { ...wish, id: 'cancelled', title: '旧愿望', status: 'CANCELLED' },
        ]}
        slots={3}
        busyWishId="wish-1"
        onCancel={() => undefined}
      />,
    );

    expect(markup).toContain('2 / 3');
    expect(markup).toContain('天文望远镜');
    expect(markup).toContain('露营');
    expect(markup).not.toContain('旧愿望');
    expect(markup.match(/disabled=""/g)).toHaveLength(2);
  });

  it('localizes every real redemption state including completed refunds', () => {
    const base = { child_id: 'child-1', reward_id: 'reward-1', points_spent: 30 };
    const markup = renderToStaticMarkup(
      <ChildRedemptionList
        rewards={[]}
        redemptions={[
          { ...base, id: 'one', status: 'PENDING' },
          { ...base, id: 'two', status: 'APPROVED' },
          { ...base, id: 'three', status: 'REJECTED' },
          { ...base, id: 'four', status: 'FULFILLED' },
        ]}
      />,
    );

    expect(markup).toContain('待审批');
    expect(markup).toContain('待兑现');
    expect(markup).toContain('已拒绝，退款完成');
    expect(markup).toContain('已兑现');
  });
});
