import { describe, expect, it } from 'vitest';

import {
  appendNotificationPage,
  isSafeNotificationTarget,
  notificationListPath,
  replaceNotification,
  unreadBadgeText,
  type NotificationItem,
} from './notifications';

const first: NotificationItem = {
  id: 'one',
  type: 'review',
  title: '待审核',
  content: '新的打卡等待审核',
  target_type: 'review',
  target_id: 'review-1',
  target_url: '/reviews?focus=review-1',
  read_at: null,
  created_at: '2026-08-07T08:00:00.000Z',
};

describe('notifications helpers', () => {
  it('builds encoded cursor pagination requests and appends unique authoritative rows', () => {
    expect(notificationListPath('created/id+next')).toBe(
      '/notifications?limit=20&cursor=created%2Fid%2Bnext',
    );
    expect(
      appendNotificationPage(
        [first],
        [
          { ...first, title: '服务端新标题' },
          { ...first, id: 'two' },
        ],
      ),
    ).toEqual([
      { ...first, title: '服务端新标题' },
      { ...first, id: 'two' },
    ]);
  });

  it('replaces a read row with the complete server response', () => {
    const authoritative = { ...first, read_at: '2026-08-07T09:00:00.000Z' };
    expect(replaceNotification([first, { ...first, id: 'two' }], authoritative)).toEqual([
      authoritative,
      { ...first, id: 'two' },
    ]);
  });

  it.each([
    ['/reviews', true],
    ['/child/achievements?badge=1#latest', true],
    ['https://evil.example/reviews', false],
    ['//evil.example/reviews', false],
    ['/\\evil.example/reviews', false],
    ['javascript:alert(1)', false],
  ])('validates safe in-app target %s', (target, expected) => {
    expect(isSafeNotificationTarget(target)).toBe(expected);
  });

  it('caps large unread badges without hiding the accessible count', () => {
    expect(unreadBadgeText(0)).toBe('0');
    expect(unreadBadgeText(100)).toBe('99+');
  });
});
