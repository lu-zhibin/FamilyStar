'use client';

import {
  BarChart3,
  Bell,
  BookHeart,
  CheckCheck,
  ClipboardList,
  Gift,
  Home,
  Medal,
  Settings,
  Star,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import {
  canAccessParentPortal,
  parentSectionPaths,
  type ParentSection,
} from '../lib/parent-portal';

const navItems = [
  { key: 'dashboard', label: '总览', icon: Home },
  { key: 'tasks', label: '任务', icon: ClipboardList },
  { key: 'reviews', label: '审核', icon: CheckCheck },
  { key: 'rewards', label: '奖励', icon: Gift },
  { key: 'levels', label: '等级', icon: Medal },
  { key: 'stats', label: '数据', icon: BarChart3 },
  { key: 'records', label: '记录', icon: BookHeart },
  { key: 'family', label: '成员', icon: Users },
  { key: 'settings', label: '设置', icon: Settings },
] as const;

export function ParentShell({
  children,
  section,
}: Readonly<{ children: ReactNode; section: ParentSection }>) {
  const [allowed, setAllowed] = useState(true);
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    setAllowed(canAccessParentPortal(window.localStorage.getItem('familystar_role')));
    activeRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [section]);

  if (!allowed) {
    return (
      <main className="page-shell grid min-h-screen place-items-center py-10">
        <section className="panel max-w-lg text-center" role="alert">
          <Users className="mx-auto text-orange" size={38} />
          <h1 className="mt-4 font-display text-page">需要家长身份</h1>
          <p className="mt-2 text-brown-light">请切换到家长账号后访问管理页面。</p>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen pb-28 mobile:pb-24">
      <header className="sticky top-0 z-30 border-b border-wood/80 bg-cream/90 backdrop-blur-xl">
        <div className="page-shell flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3" aria-label="FamilyStar 家长端首页">
            <span className="grid size-10 place-items-center rounded-card bg-gradient-to-br from-sun to-orange text-white shadow-orange">
              <Star aria-hidden="true" size={22} fill="currentColor" />
            </span>
            <div>
              <span className="block font-display text-title leading-5 text-leaf-dark">
                FamilyStar
              </span>
              <span className="text-label font-extrabold text-brown-light">
                小星星家庭 · 家长端
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <button
              className="icon-button relative"
              aria-label="通知，即将推出"
              title="通知即将推出"
            >
              <Bell aria-hidden="true" size={20} />
              <span className="absolute -right-1 -top-1 rounded-pill bg-coral px-1.5 text-[10px] font-extrabold text-white">
                Soon
              </span>
            </button>
            <span
              className="grid size-10 place-items-center rounded-full bg-leaf-light font-display text-leaf-dark"
              aria-label="当前家长：斌哥"
            >
              斌
            </span>
          </div>
        </div>
      </header>
      <main className="page-shell py-7 mobile:py-5">{children}</main>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-wood bg-white/95 shadow-[0_-8px_28px_rgba(93,64,55,0.10)] backdrop-blur-xl"
        aria-label="家长端模块导航"
      >
        <div className="nav-scroll mx-auto flex max-w-content items-center gap-1 overflow-x-auto px-3 py-2">
          {navItems.map(({ key, label, icon: Icon }) => {
            const active = section === key;
            return (
              <Link
                key={key}
                ref={active ? activeRef : undefined}
                href={parentSectionPaths[key]}
                aria-current={active ? 'page' : undefined}
                className={`nav-item ${active ? 'nav-item-active' : ''}`}
              >
                <Icon aria-hidden="true" size={20} strokeWidth={active ? 2.8 : 2} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
