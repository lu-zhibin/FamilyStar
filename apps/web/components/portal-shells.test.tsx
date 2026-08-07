import type { FamilyModulesReadModel } from '@familystar/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ChildShell } from './child-shell';
import { ParentShell } from './parent-shell';

const modules: FamilyModulesReadModel = {
  version: 3,
  modules: [
    {
      id: 'authentication',
      category: 'core',
      enabled: true,
      configurable: false,
      dependencies: [],
    },
    {
      id: 'family-settings',
      category: 'core',
      enabled: true,
      configurable: false,
      dependencies: [],
    },
    { id: 'tasks', category: 'core', enabled: true, configurable: false, dependencies: [] },
    {
      id: 'check-in',
      category: 'core',
      enabled: true,
      configurable: false,
      dependencies: ['tasks'],
    },
    {
      id: 'points',
      category: 'core',
      enabled: true,
      configurable: false,
      dependencies: ['check-in'],
    },
    {
      id: 'levels',
      category: 'optional',
      enabled: false,
      configurable: true,
      dependencies: ['points'],
    },
    {
      id: 'analytics',
      category: 'optional',
      enabled: false,
      configurable: true,
      dependencies: ['levels'],
    },
    {
      id: 'growth-records',
      category: 'optional',
      enabled: false,
      configurable: true,
      dependencies: ['check-in'],
    },
    {
      id: 'rewards',
      category: 'optional',
      enabled: false,
      configurable: true,
      dependencies: ['levels'],
    },
    {
      id: 'badges',
      category: 'optional',
      enabled: false,
      configurable: true,
      dependencies: ['levels'],
    },
    {
      id: 'notifications',
      category: 'optional',
      enabled: false,
      configurable: true,
      dependencies: ['authentication'],
    },
  ],
};

describe('portal module shells', () => {
  it('filters parent optional navigation while retaining every core entry', () => {
    const markup = renderToStaticMarkup(
      <ParentShell section="dashboard" initialModules={modules}>
        家庭内容
      </ParentShell>,
    );
    expect(markup).toContain('家庭内容');
    expect(markup).toContain('总览');
    expect(markup).toContain('任务');
    expect(markup).toContain('审核');
    expect(markup).toContain('成员');
    expect(markup).toContain('设置');
    expect(markup).not.toContain('>奖励<');
    expect(markup).not.toContain('>数据<');
    expect(markup).not.toContain('通知中心');
  });

  it('replaces a disabled parent page with a safe return state', () => {
    const markup = renderToStaticMarkup(
      <ParentShell section="rewards" initialModules={modules}>
        不应显示的奖励内容
      </ParentShell>,
    );
    expect(markup).toContain('奖励已受限');
    expect(markup).toContain('已有数据会保留');
    expect(markup).toContain('href="/dashboard"');
    expect(markup).not.toContain('不应显示的奖励内容');
  });

  it('filters child optional navigation and safely returns a disabled page home', () => {
    const navigation = renderToStaticMarkup(
      <ChildShell
        section="home"
        child={{ nickname: '小星' }}
        onSwitch={() => undefined}
        initialModules={modules}
      >
        孩子主页内容
      </ChildShell>,
    );
    expect(navigation).toContain('孩子主页内容');
    expect(navigation).toContain('>主页<');
    expect(navigation).toContain('>打卡<');
    expect(navigation).toContain('>我的<');
    expect(navigation).not.toContain('>奖励<');
    expect(navigation).not.toContain('>成就<');

    const restricted = renderToStaticMarkup(
      <ChildShell
        section="achievements"
        child={undefined}
        onSwitch={() => undefined}
        initialModules={modules}
      >
        不应显示的成就内容
      </ChildShell>,
    );
    expect(restricted).toContain('等级已受限');
    expect(restricted).toContain('href="/child"');
    expect(restricted).not.toContain('不应显示的成就内容');
  });
});
