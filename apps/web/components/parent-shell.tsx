'use client';

import {
  BarChart3,
  BadgeCheck,
  BookHeart,
  CheckCheck,
  ClipboardList,
  Gift,
  Home,
  LogOut,
  Medal,
  Settings,
  Star,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { FamilyModulesReadModel } from '@familystar/shared';

import { authApi, clearStoredIdentity } from '../lib/auth';
import {
  enabledNavigationKeys,
  familyModuleLabels,
  isFamilyModuleAvailable,
  parentSectionModules,
} from '../lib/family-modules';
import { parentApi, parentSectionPaths, type ParentSection } from '../lib/parent-portal';
import { NotificationBell } from './notification-bell';
import { useFamilyModules } from './use-family-modules';

const navItems = [
  { key: 'dashboard', label: '总览', icon: Home },
  { key: 'tasks', label: '任务', icon: ClipboardList },
  { key: 'reviews', label: '审核', icon: CheckCheck },
  { key: 'rewards', label: '奖励', icon: Gift },
  { key: 'levels', label: '等级', icon: Medal },
  { key: 'badges', label: '徽章', icon: BadgeCheck },
  { key: 'stats', label: '数据', icon: BarChart3 },
  { key: 'records', label: '记录', icon: BookHeart },
  { key: 'family', label: '成员', icon: Users },
  { key: 'settings', label: '设置', icon: Settings },
] as const;

export function ParentShell({
  children,
  section,
  initialModules,
}: Readonly<{
  children: ReactNode;
  section: ParentSection | 'notifications';
  initialModules?: FamilyModulesReadModel;
}>) {
  const [logoutError, setLogoutError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const modules = useFamilyModules(parentApi, initialModules);
  const visibleKeys = enabledNavigationKeys(
    navItems.map((item) => item.key),
    parentSectionModules,
    modules.readModel,
    modules.state,
  );
  const currentModule = parentSectionModules[section];
  const restricted = !isFamilyModuleAvailable(currentModule, modules.readModel, modules.state);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [section]);

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

  return (
    <div className="min-h-screen pb-28 pt-7 mobile:pb-24 mobile:pt-5">
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
                家庭管理空间 · 家长端
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            {isFamilyModuleAvailable('notifications', modules.readModel, modules.state) && (
              <NotificationBell api={parentApi} href="/notifications" />
            )}
            <button
              type="button"
              className="icon-button"
              aria-label="退出家长端"
              title="退出登录"
              disabled={loggingOut}
              onClick={logout}
            >
              <LogOut aria-hidden="true" size={20} />
            </button>
            <span
              className="grid size-10 place-items-center rounded-full bg-leaf-light font-display text-leaf-dark"
              aria-label="当前家长账号"
            >
              家
            </span>
          </div>
        </div>
        {logoutError && (
          <p className="page-shell pb-2 text-right text-label font-bold text-red" role="alert">
            {logoutError}
          </p>
        )}
      </header>
      <main className="page-shell py-7 mobile:py-5">
        {modules.state === 'loading' && (
          <p className="mb-4 text-caption font-extrabold text-brown-light" role="status">
            正在同步家庭模块…
          </p>
        )}
        {modules.state === 'error' && (
          <div className="notice mb-5" role="alert">
            模块状态读取失败，当前仅开放核心入口。
            <button className="text-button" type="button" onClick={() => void modules.refresh()}>
              重新读取
            </button>
          </div>
        )}
        {restricted ? (
          <section className="panel restricted-hero" role="alert">
            <Settings aria-hidden="true" size={36} />
            <h1 className="font-display text-page">{familyModuleLabels[currentModule]}已受限</h1>
            <p>该家庭模块当前处于关闭状态。已有数据会保留，重新启用后可继续访问。</p>
            <Link className="primary-button" href={parentSectionPaths.dashboard}>
              返回家庭总览
            </Link>
          </section>
        ) : (
          children
        )}
      </main>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-wood bg-white/95 shadow-[0_-8px_28px_rgba(93,64,55,0.10)] backdrop-blur-xl"
        aria-label="家长端模块导航"
      >
        <div className="nav-scroll mx-auto flex max-w-content items-center gap-1 overflow-x-auto px-3 py-2 mobile:grid mobile:grid-cols-10 mobile:gap-0 mobile:overflow-x-visible mobile:px-1">
          {navItems
            .filter(({ key }) => visibleKeys.includes(key))
            .map(({ key, label, icon: Icon }) => {
              const active = section === key;
              return (
                <Link
                  key={key}
                  ref={active ? activeRef : undefined}
                  href={parentSectionPaths[key]}
                  aria-current={active ? 'page' : undefined}
                  className={`nav-item ${active ? 'nav-item-active' : ''}`}
                >
                  <Icon
                    aria-hidden="true"
                    className="mobile:size-[17px]"
                    size={20}
                    strokeWidth={active ? 2.8 : 2}
                  />
                  <span>{label}</span>
                </Link>
              );
            })}
        </div>
      </nav>
    </div>
  );
}
