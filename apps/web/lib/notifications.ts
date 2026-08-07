export const notificationTypes = [
  'review',
  'points',
  'level',
  'redemption',
  'wish',
  'badge',
  'invitation',
] as const;

export type NotificationType = (typeof notificationTypes)[number];

export const notificationTypeLabels: Record<NotificationType, string> = {
  review: '审核结果',
  points: '积分变化',
  level: '等级成长',
  redemption: '奖励兑换',
  wish: '心愿进度',
  badge: '徽章成就',
  invitation: '家庭邀请',
};

export type NotificationItem = Readonly<{
  id: string;
  type: NotificationType;
  title: string;
  content: string;
  target_type: string;
  target_id: string | null;
  target_url: string;
  read_at: string | null;
  created_at: string;
}>;

export type NotificationPage = Readonly<{
  has_more: boolean;
  next_cursor: string | null;
}>;

export type NotificationPreference = Readonly<{
  in_app_enabled: boolean;
  browser_enabled: boolean;
  type_settings: Record<NotificationType, boolean>;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}>;

export const notificationUnreadChangedEvent = 'familystar:notification-unread-changed';

export function notificationListPath(cursor: string | null, limit = 20): string {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set('cursor', cursor);
  return `/notifications?${query.toString()}`;
}

export function appendNotificationPage(
  current: readonly NotificationItem[],
  incoming: readonly NotificationItem[],
): NotificationItem[] {
  const byId = new Map(current.map((notification) => [notification.id, notification]));
  for (const notification of incoming) byId.set(notification.id, notification);
  return [...byId.values()];
}

export function replaceNotification(
  current: readonly NotificationItem[],
  authoritative: NotificationItem,
): NotificationItem[] {
  return current.map((notification) =>
    notification.id === authoritative.id ? authoritative : notification,
  );
}

export function isSafeNotificationTarget(target: string): boolean {
  if (!target.startsWith('/') || target.startsWith('//') || target.includes('\\')) return false;
  try {
    const base = new URL('https://familystar.local');
    return new URL(target, base).origin === base.origin;
  } catch {
    return false;
  }
}

export function unreadBadgeText(count: number): string {
  return count > 99 ? '99+' : String(Math.max(0, count));
}

export function formatNotificationTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
}
