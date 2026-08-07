import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { childSections } from '../lib/child-portal';
import type { BadgeWallItem } from '../lib/badges';
import { findTheme } from '@familystar/shared';
import {
  BadgeWall,
  ChildPortal,
  ChildRedemptionList,
  ChildWishWall,
  ThemeCatalog,
} from './child-portal';

const badgeTemplate = {
  id: 'badge-1',
  preset_code: 'tasks-7',
  name: '任务达人',
  description: '完成七个任务',
  icon: 'star',
  category: '任务',
  condition: { type: 'TASK_COMPLETION_COUNT' as const, target: 7 },
  award_level: 1,
  is_visible: true,
  is_enabled: true,
  version: 1,
  created_at: '2026-08-07T00:00:00.000Z',
  updated_at: '2026-08-07T00:00:00.000Z',
};

describe('ChildPortal', () => {
  it('renders unlocked, locked, and selected theme catalog states', () => {
    const starlight = findTheme('starlight')!;
    const forest = findTheme('forest')!;
    const markup = renderToStaticMarkup(
      <ThemeCatalog
        catalog={{
          current_level: 3,
          selected_theme: 'starlight',
          themes: [
            {
              key: starlight.key,
              name: starlight.name,
              description: starlight.description,
              minimum_level: starlight.minimumLevel,
              tokens: starlight.tokens,
              unlocked: true,
              selected: true,
            },
            {
              key: forest.key,
              name: forest.name,
              description: forest.description,
              minimum_level: forest.minimumLevel,
              tokens: forest.tokens,
              unlocked: false,
              selected: false,
            },
          ],
        }}
        state="live"
        busyTheme={null}
        feedback={null}
        onSelect={() => undefined}
        onRefresh={() => undefined}
      />,
    );
    expect(markup).toContain('Starlight主题，当前选择');
    expect(markup).toContain('Forest主题，锁定');
    expect(markup).toContain('Lv.5 解锁');
    expect(markup).toContain('尚未解锁');
    expect(markup.match(/disabled=""/g)).toHaveLength(2);
    expect(markup).toContain('background-color:#4f46e5');
  });

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

  it('renders awarded snapshots and locked automatic progress', () => {
    const badges: BadgeWallItem[] = [
      {
        template: badgeTemplate,
        award: {
          id: 'award-1',
          template_id: 'badge-1',
          child_id: 'child-1',
          level: 1,
          name: '历史任务之星',
          description: '颁发时的徽章说明',
          icon: 'award',
          category: '历史',
          condition: { type: 'TASK_COMPLETION_COUNT', target: 7 },
          template_version: 1,
          reason: '坚持完成每周任务',
          awarded_by: 'parent-1',
          awarded_at: '2026-08-07T08:30:00.000Z',
        },
        progress: null,
      },
      {
        template: {
          ...badgeTemplate,
          id: 'badge-2',
          name: '协作伙伴',
          condition: { type: 'COLLABORATION_COUNT', target: 4 },
        },
        award: null,
        progress: {
          current_value: 3,
          target_value: 4,
          evaluated_at: '2026-08-07T08:00:00.000Z',
        },
      },
    ];
    const markup = renderToStaticMarkup(<BadgeWall badges={badges} state="live" />);

    expect(markup).toContain('历史任务之星');
    expect(markup).toContain('颁发时的徽章说明');
    expect(markup).toContain('坚持完成每周任务');
    expect(markup).toContain('已获得');
    expect(markup).toContain('未获得');
    expect(markup).toContain('child-badge-locked');
    expect(markup).toContain('3/4');
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuenow="3"');
    expect(markup).toContain('width:75%');
  });

  it('shows the manual waiting state for an unearned badge', () => {
    const markup = renderToStaticMarkup(
      <BadgeWall
        state="live"
        badges={[
          {
            template: {
              ...badgeTemplate,
              id: 'manual-badge',
              name: '暖心小帮手',
              condition: { type: 'MANUAL' },
            },
            award: null,
            progress: null,
          },
        ]}
      />,
    );

    expect(markup).toContain('等待家长颁发');
    expect(markup).not.toContain('role="progressbar"');
  });

  it('property: every automatic badge clamps generated progress at its boundary', () => {
    const types = [
      'TASK_COMPLETION_COUNT',
      'STREAK_DAYS',
      'TOTAL_POINTS',
      'LEVEL_REACHED',
      'COLLABORATION_COUNT',
    ] as const;

    for (const [index, type] of types.entries()) {
      const target = index + 2;
      for (const current of [-1, target - 1, target, target + 1]) {
        const markup = renderToStaticMarkup(
          <BadgeWall
            state="live"
            badges={[
              {
                template: {
                  ...badgeTemplate,
                  id: `badge-${type}-${current}`,
                  condition: { type, target },
                },
                award: null,
                progress: {
                  current_value: current,
                  target_value: target,
                  evaluated_at: '2026-08-07T08:00:00.000Z',
                },
              },
            ]}
          />,
        );

        expect(markup).toContain('未获得');
        expect(markup).toContain(`aria-valuenow="${Math.min(Math.max(current, 0), target)}"`);
        expect(markup).toContain(
          `width:${Math.min(100, Math.max(0, Math.round((current / target) * 100)))}%`,
        );
      }
    }
  });

  it.each([
    ['loading', '正在读取徽章墙'],
    ['empty', '还没有可展示的徽章'],
    ['error', '徽章墙读取失败'],
  ] as const)('renders the independent %s badge state', (state, message) => {
    const markup = renderToStaticMarkup(<BadgeWall badges={[]} state={state} />);

    expect(markup).toContain(message);
    expect(markup).toContain(state === 'error' ? 'role="alert"' : 'role="status"');
  });
});
