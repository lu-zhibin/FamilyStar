import type { FamilyModulesReadModel } from '@familystar/shared';
import { describe, expect, it, vi } from 'vitest';

import {
  dependencyFeedback,
  enabledNavigationKeys,
  parentSectionModules,
  updateFamilyModule,
  versionedModulePatch,
} from './family-modules';

const readModel: FamilyModulesReadModel = {
  version: 7,
  modules: [
    {
      id: 'authentication',
      category: 'core',
      enabled: true,
      configurable: false,
      dependencies: [],
    },
    { id: 'points', category: 'core', enabled: true, configurable: false, dependencies: [] },
    {
      id: 'levels',
      category: 'optional',
      enabled: true,
      configurable: true,
      dependencies: ['points'],
    },
    {
      id: 'rewards',
      category: 'optional',
      enabled: false,
      configurable: true,
      dependencies: ['points', 'levels'],
    },
    {
      id: 'analytics',
      category: 'optional',
      enabled: true,
      configurable: true,
      dependencies: ['levels'],
    },
  ],
};

describe('family module web helpers', () => {
  it('filters disabled optional entries and always preserves core entries', () => {
    expect(
      enabledNavigationKeys(
        ['dashboard', 'rewards', 'levels'],
        parentSectionModules,
        readModel,
        'live',
      ),
    ).toEqual(['dashboard', 'levels']);
    expect(
      enabledNavigationKeys(
        ['dashboard', 'rewards', 'levels'],
        parentSectionModules,
        null,
        'error',
      ),
    ).toEqual(['dashboard']);
  });

  it('keeps navigation stable while the versioned read model is loading', () => {
    expect(
      enabledNavigationKeys(
        ['dashboard', 'rewards', 'levels'],
        parentSectionModules,
        null,
        'loading',
      ),
    ).toEqual(['dashboard', 'rewards', 'levels']);
  });

  it('reports both missing and in-use dependencies before a write', () => {
    expect(dependencyFeedback(readModel, 'rewards', true)).toBeNull();
    expect(dependencyFeedback(readModel, 'levels', false)).toBe('请先关闭：数据分析');
    const missingLevel = {
      ...readModel,
      modules: readModel.modules.map((module) =>
        module.id === 'levels' ? { ...module, enabled: false } : module,
      ),
    };
    expect(dependencyFeedback(missingLevel, 'rewards', true)).toBe('请先启用：等级');
  });

  it('sends the expected version and consumes the server read model response', async () => {
    const updated = { ...readModel, version: 8 };
    const api = vi.fn().mockResolvedValue({ modules: updated });

    await expect(updateFamilyModule(api, readModel, 'rewards', true)).resolves.toBe(updated);
    expect(versionedModulePatch(readModel, 'rewards', true)).toEqual({
      version: 7,
      modules: { rewards: true },
    });
    expect(api).toHaveBeenCalledWith('/family/modules', {
      method: 'PATCH',
      body: JSON.stringify({ version: 7, modules: { rewards: true } }),
    });
  });
});
