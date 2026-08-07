import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { notificationTypes, type NotificationPreference } from '../lib/notifications';
import { NotificationBellView } from './notification-bell';
import {
  ChildNotificationsPortal,
  NotificationBoundary,
  NotificationPreferencePanel,
  ParentNotificationsPortal,
} from './notification-center';

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
