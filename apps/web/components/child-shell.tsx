'use client';

import { Bell, CheckCircle2, Gift, Home, Trophy, UserRound, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';

import { canAccessChildPortal, childSectionPaths, type ChildSection } from '../lib/child-portal';

const navigation = [
  { key: 'home', label: '主页', icon: Home },
  { key: 'check-ins', label: '打卡', icon: CheckCircle2 },
  { key: 'achievements', label: '成就', icon: Trophy },
  { key: 'rewards', label: '奖励', icon: Gift },
  { key: 'profile', label: '我的', icon: UserRound },
] as const;

export function ChildShell({
  children,
  section,
  onSwitch,
}: Readonly<{ children: ReactNode; section: ChildSection; onSwitch: () => void }>) {
  const [allowed, setAllowed] = useState(true);

  useEffect(() => {
    setAllowed(canAccessChildPortal(window.localStorage.getItem('familystar_role')));
  }, []);

  if (!allowed) {
    return (
      <main className="page-shell grid min-h-screen place-items-center py-10">
        <section className="child-card max-w-lg text-center" role="alert">
          <UsersRound className="mx-auto text-orange" size={42} />
          <h1 className="mt-4 font-display text-page">需要孩子身份</h1>
          <p className="mt-2 font-bold text-brown-light">请先切换到孩子账号，再进入个人空间。</p>
        </section>
      </main>
    );
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
          <span className="child-avatar">昊</span>
          <span>
            <strong className="block font-display text-title">昊昊的小天地</strong>
            <span className="text-label font-extrabold text-brown-light">点击头像切换账号</span>
          </span>
        </button>
        <button className="icon-button relative bg-white" aria-label="通知，即将推出">
          <Bell aria-hidden="true" size={22} />
          <span className="absolute -right-1 -top-1 rounded-pill bg-coral px-1.5 text-[10px] font-extrabold text-white">
            Soon
          </span>
        </button>
      </header>

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
