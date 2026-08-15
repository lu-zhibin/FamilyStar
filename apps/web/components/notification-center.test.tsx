import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  notificationTypes,
  type NotificationItem,
  type NotificationPreference,
} from '../lib/notifications';
import { NotificationBellView } from './notification-bell';
import {
  ChildNotificationsPortal,
  NotificationBoundary,
  NotificationFeedback,
  NotificationListPanel,
  NotificationPreferencePanel,
  ParentNotificationsPortal,
} from './notification-center';

const notification: NotificationItem = {
  id: 'notification-1',
  type: 'review',
  title: '阅读审核已通过',
  content: '今日阅读已经通过审核',
  target_type: 'check_in',
  target_id: 'check-in-1',
  target_url: '/child/check-ins?focus=check-in-1',
  read_at: null,
  created_at: '2026-08-07T08:00:00.000Z',
};

const preference: NotificationPreference = {
  in_app_enabled: true,
  browser_enabled: false,
  type_settings: Object.fromEntries(notificationTypes.map((type) => [type, true])) as Record<
    (typeof notificationTypes)[number],
    boolean
  >,
  quiet_hours_enabled: true,
  quiet_hours_start: '22:00',
  quiet_hours_end: '07:00',
};

describe('notification portals', () => {
  it('renders responsive parent and child loading boundaries through their shells', () => {
    const parent = renderToStaticMarkup(<ParentNotificationsPortal />);
    const child = renderToStaticMarkup(<ChildNotificationsPortal />);

    expect(parent).toContain('正在读取通知');
    expect(parent).toContain('正在读取偏好');
    expect(parent).toContain('href="/notifications"');
    expect(parent).toContain('家长端模块导航');
    expect(parent).toContain('lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]');
    expect(child).toContain('正在读取通知');
    expect(child).not.toContain('正在读取偏好');
    expect(child).toContain('href="/child/notifications"');
    expect(child).toContain('孩子端主导航');
  });

  it('renders a real unread badge with an accessible full count', () => {
    const markup = renderToStaticMarkup(
      <NotificationBellView href="/notifications" unreadCount={120} />,
    );
    expect(markup).toContain('aria-label="通知，120 条未读"');
    expect(markup).toContain('99+');
    expect(markup).toContain('aria-hidden="true"');
  });

  it('offers an accessible error recovery action', () => {
    const markup = renderToStaticMarkup(
      <NotificationBoundary title="通知读取失败" detail="请重试" error onRetry={() => undefined} />,
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('重新加载');
    expect(markup).toContain('type="button"');
  });

  it.each([
    ['loading', '正在读取通知', 'role="status"'],
    ['error', '通知读取失败', 'role="alert"'],
    ['empty', '暂无通知', 'role="status"'],
  ] as const)('renders the accessible %s list boundary', (state, copy, role) => {
    const markup = renderToStaticMarkup(
      <NotificationListPanel
        notifications={[]}
        page={{ has_more: false, next_cursor: null }}
        state={state}
        busy={null}
        loadingMore={false}
        onRetry={() => undefined}
        onLoadMore={() => undefined}
        onMarkRead={() => undefined}
      />,
    );
    expect(markup).toContain(copy);
    expect(markup).toContain(role);
  });

  it('keeps loaded rows after pagination failure and locks every row write', () => {
    const markup = renderToStaticMarkup(
      <>
        <NotificationFeedback message="加载更多失败，请重试。" />
        <NotificationListPanel
          notifications={[notification]}
          page={{ has_more: true, next_cursor: 'next-page' }}
          state="live"
          busy="notification-1"
          loadingMore={false}
          onRetry={() => undefined}
          onLoadMore={() => undefined}
          onMarkRead={() => undefined}
        />
      </>,
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('加载更多失败，请重试。');
    expect(markup).toContain('阅读审核已通过');
    expect(markup).toContain('aria-label="打开通知：阅读审核已通过"');
    expect(markup).toContain('dateTime="2026-08-07T08:00:00.000Z"');
    expect(markup.match(/disabled=""/g)).toHaveLength(3);
  });

  it('renders every preference and locks all writes while saving', () => {
    const markup = renderToStaticMarkup(
      <NotificationPreferencePanel
        preference={preference}
        state="live"
        busy
        onChange={() => undefined}
        onRetry={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    expect(markup).toContain('站内通知总开关');
    expect(markup).toContain('浏览器通知总开关');
    expect(markup).toContain('启用免打扰时段');
    expect(markup).toContain('value="22:00"');
    expect(markup).toContain('value="07:00"');
    expect(markup.match(/type="checkbox"/g)).toHaveLength(10);
    expect(markup.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(13);
    expect(markup).toContain('正在保存...');
  });
});
