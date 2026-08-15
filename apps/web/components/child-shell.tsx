'use client';

import { CheckCircle2, Gift, Home, LogOut, Trophy, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { FamilyModulesReadModel } from '@familystar/shared';

import { authApi, clearStoredIdentity } from '../lib/auth';
import {
  childSectionModules,
  enabledNavigationKeys,
  familyModuleLabels,
  isFamilyModuleAvailable,
} from '../lib/family-modules';
import { childApi, childSectionPaths, type ChildSection } from '../lib/child-portal';
import {
  selectedThemeFromCatalog,
  THEME_SELECTED_EVENT,
  themeRootStyle,
  type ThemeCatalogItem,
  type ThemeCatalogReadModel,
} from '../lib/themes';
import { NotificationBell } from './notification-bell';
import { useFamilyModules } from './use-family-modules';

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
  initialModules,
}: Readonly<{
  children: ReactNode;
  child: { nickname: string } | undefined;
  section: ChildSection | 'notifications';
  onSwitch: () => void;
  initialModules?: FamilyModulesReadModel;
}>) {
  const [logoutError, setLogoutError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [theme, setTheme] = useState<ThemeCatalogItem | null>(null);
  const modules = useFamilyModules(childApi, initialModules);

  useEffect(() => {
    let active = true;
    childApi<ThemeCatalogReadModel>('/themes')
      .then((catalog) => {
        if (active) setTheme(selectedThemeFromCatalog(catalog));
      })
      .catch(() => undefined);
    function update(event: Event) {
      setTheme((event as CustomEvent<ThemeCatalogItem>).detail);
    }
    window.addEventListener(THEME_SELECTED_EVENT, update);
    return () => {
      active = false;
      window.removeEventListener(THEME_SELECTED_EVENT, update);
    };
  }, []);

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
  const visibleKeys = enabledNavigationKeys(
    navigation.map((item) => item.key),
    childSectionModules,
    modules.readModel,
    modules.state,
  );
  const currentModule = childSectionModules[section];
  const restricted = !isFamilyModuleAvailable(currentModule, modules.readModel, modules.state);

  return (
    <div
      className="child-theme-shell min-h-screen pb-28"
      style={themeRootStyle(theme) as CSSProperties}
      data-theme={theme?.key}
    >
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
          {isFamilyModuleAvailable('notifications', modules.readModel, modules.state) && (
            <NotificationBell api={childApi} href="/child/notifications" className="bg-white" />
          )}
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

      <main className="page-shell">
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
          <section className="child-card restricted-hero" role="alert">
            <Trophy aria-hidden="true" size={36} />
            <h1 className="font-display text-page">{familyModuleLabels[currentModule]}已受限</h1>
            <p>该家庭模块当前处于关闭状态。成长数据会继续保留，重新启用后可继续访问。</p>
            <Link className="child-action-button" href={childSectionPaths.home}>
              返回孩子主页
            </Link>
          </section>
        ) : (
          children
        )}
      </main>

      <nav className="child-bottom-nav" aria-label="孩子端主导航">
        <div className="mx-auto flex max-w-[720px] items-center justify-around px-2">
          {navigation
            .filter(({ key }) => visibleKeys.includes(key))
            .map(({ key, label, icon: Icon }) => {
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
