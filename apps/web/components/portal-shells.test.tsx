import {
  CORE_FAMILY_MODULE_IDS,
  FAMILY_MODULE_DEFINITIONS,
  type FamilyModulesReadModel,
} from '@familystar/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ChildShell } from './child-shell';
import { ParentShell } from './parent-shell';

const COMPONENT_MODULE_PROPERTY_RUNS = 64;

function validatesCriteria(criteria: readonly string[]): string {
  return `[validatesCriteria: ${criteria.join(', ')}]`;
}

function generatedModules(run: number): FamilyModulesReadModel {
  const core = new Set<string>(CORE_FAMILY_MODULE_IDS);
  return {
    version: run,
    modules: FAMILY_MODULE_DEFINITIONS.map((definition, index) => ({
      ...definition,
      enabled:
        core.has(definition.id) || ((Math.imul(run + 1, 31) ^ Math.imul(index + 7, 17)) & 1) === 1,
      configurable: !core.has(definition.id),
    })),
  };
}

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
  it(`property: random module combinations render exactly core and enabled navigation entries ${validatesCriteria(['Requirement 12.2', 'Correctness Property 7'])}`, () => {
    const parentEntries = [
      ['/dashboard', 'points'],
      ['/tasks', 'tasks'],
      ['/reviews', 'check-in'],
      ['/rewards', 'rewards'],
      ['/levels', 'levels'],
      ['/badges', 'badges'],
      ['/stats', 'analytics'],
      ['/records', 'growth-records'],
      ['/family', 'family-settings'],
      ['/settings', 'family-settings'],
      ['/notifications', 'notifications'],
    ] as const;
    const childEntries = [
      ['/child', 'points'],
      ['/child/check-ins', 'check-in'],
      ['/child/achievements', 'levels'],
      ['/child/rewards', 'rewards'],
      ['/child/profile', 'authentication'],
      ['/child/notifications', 'notifications'],
    ] as const;
    const core = new Set<string>(CORE_FAMILY_MODULE_IDS);

    for (let run = 0; run < COMPONENT_MODULE_PROPERTY_RUNS; run += 1) {
      const generated = generatedModules(run);
      const enabled = new Set(
        generated.modules.filter((module) => module.enabled).map((module) => module.id),
      );
      const parentMarkup = renderToStaticMarkup(
        <ParentShell section="dashboard" initialModules={generated}>
          家庭内容
        </ParentShell>,
      );
      const childMarkup = renderToStaticMarkup(
        <ChildShell
          section="home"
          child={{ nickname: '小星' }}
          onSwitch={() => undefined}
          initialModules={generated}
        >
          孩子内容
        </ChildShell>,
      );

      for (const [path, moduleId] of parentEntries) {
        expect(parentMarkup.includes(`href="${path}"`)).toBe(
          core.has(moduleId) || enabled.has(moduleId),
        );
      }
      for (const [path, moduleId] of childEntries) {
        expect(childMarkup.includes(`href="${path}"`)).toBe(
          core.has(moduleId) || enabled.has(moduleId),
        );
      }
    }
  });

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
