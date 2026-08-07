'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { notificationUnreadChangedEvent, unreadBadgeText } from '../lib/notifications';

type NotificationApi = <T>(path: string, init?: RequestInit) => Promise<T>;

export function NotificationBell({
  api,
  href,
  className = '',
}: Readonly<{ api: NotificationApi; href: string; className?: string }>) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      api<{ unread_count: number }>('/notifications/unread-count')
        .then((result) => active && setUnreadCount(result.unread_count))
        .catch(() => undefined);
    };
    refresh();
    window.addEventListener(notificationUnreadChangedEvent, refresh);
    return () => {
      active = false;
      window.removeEventListener(notificationUnreadChangedEvent, refresh);
    };
  }, [api]);

  return <NotificationBellView href={href} className={className} unreadCount={unreadCount} />;
}

export function NotificationBellView({
  href,
  unreadCount,
  className = '',
}: Readonly<{ href: string; unreadCount: number; className?: string }>) {
  const label = unreadCount > 0 ? `通知，${unreadCount} 条未读` : '通知';
  return (
    <Link
      className={`icon-button relative ${className}`}
      href={href}
      aria-label={label}
      title={label}
    >
      <Bell aria-hidden="true" size={20} />
      {unreadCount > 0 && (
        <span
          className="absolute -right-1 -top-1 min-w-5 rounded-pill bg-coral px-1.5 text-center text-[10px] font-extrabold text-white"
          aria-hidden="true"
        >
          {unreadBadgeText(unreadCount)}
        </span>
      )}
    </Link>
  );
}
