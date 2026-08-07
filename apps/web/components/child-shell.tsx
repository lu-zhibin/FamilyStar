'use client';

import { CheckCircle2, Gift, Home, LogOut, Trophy, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import { authApi, clearStoredIdentity } from '../lib/auth';
import { childApi, childSectionPaths, type ChildSection } from '../lib/child-portal';
import { NotificationBell } from './notification-bell';

const navigation = [
  { key: 'home', label: '主页', icon: Home },
  { key: 'check-ins', label: '打卡', icon: CheckCircle2 },
  { key: 'achievements', label: '成就', icon: Trophy },
  { key: 'rewards', label: '奖励', icon: Gift },
  { key: 'profile', label: '我的', icon: UserRound },
] as const;

export function ChildShell({
  children,
  child,
  section,
  onSwitch,
}: Readonly<{
  children: ReactNode;
  child: { nickname: string } | undefined;
  section: ChildSection | 'notifications';
  onSwitch: () => void;
}>) {
  const [logoutError, setLogoutError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    setLogoutError('');
    try {
      await authApi('/auth/logout', { method: 'POST' });
      clearStoredIdentity(window.localStorage);
      window.location.assign('/');
    } catch {
      setLogoutError('退出失败，请稍后重试。');
      setLoggingOut(false);
    }
  }

  const activeNavigationSection = section === 'records' ? 'profile' : section;

  return (
    <div className="min-h-screen pb-28">
      <header className="page-shell flex items-center justify-between gap-4 py-4 mobile:py-3">
        <button
          type="button"
          className="flex items-center gap-3 rounded-card-lg p-1 text-left transition hover:bg-white/70"
          onClick={onSwitch}
          aria-label="切换家庭账号"
        >
          <span className="child-avatar">{child?.nickname.slice(0, 1) ?? '孩'}</span>
          <span>
            <strong className="block font-display text-title">
              {child ? `${child.nickname}的小天地` : '孩子成长空间'}
            </strong>
            <span className="text-label font-extrabold text-brown-light">点击头像切换账号</span>
          </span>
        </button>
        <div className="flex items-center gap-2">
          <NotificationBell api={childApi} href="/child/notifications" className="bg-white" />
          <button
            type="button"
            className="icon-button bg-white"
            aria-label="退出孩子端"
            title="退出登录"
            disabled={loggingOut}
            onClick={logout}
          >
            <LogOut aria-hidden="true" size={22} />
          </button>
        </div>
      </header>

      {logoutError && (
        <p className="page-shell pb-3 text-right font-bold text-red" role="alert">
          {logoutError}
        </p>
      )}

      <main className="page-shell">{children}</main>

      <nav className="child-bottom-nav" aria-label="孩子端主导航">
        <div className="mx-auto flex max-w-[720px] items-center justify-around px-2">
          {navigation.map(({ key, label, icon: Icon }) => {
            const active = activeNavigationSection === key;
            return (
              <Link
                key={key}
                href={childSectionPaths[key]}
                aria-current={active ? 'page' : undefined}
                className={`child-nav-item ${active ? 'child-nav-active' : ''}`}
              >
                <Icon aria-hidden="true" size={24} strokeWidth={active ? 3 : 2.2} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
