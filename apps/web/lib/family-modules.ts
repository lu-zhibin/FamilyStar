import type { FamilyModuleId, FamilyModulesReadModel } from '@familystar/shared';
import { CORE_FAMILY_MODULE_IDS } from '../../../packages/shared/src/family-modules';

import type { ChildSection } from './child-portal';
import type { ParentSection } from './parent-portal';

export type FamilyModulesLoadState = 'loading' | 'live' | 'error';

const coreModules = new Set<FamilyModuleId>(CORE_FAMILY_MODULE_IDS);

export const familyModuleLabels: Readonly<Record<FamilyModuleId, string>> = {
  authentication: '账号与登录',
  'family-settings': '家庭设置',
  tasks: '任务',
  'check-in': '打卡与审核',
  points: '积分',
  levels: '等级',
  analytics: '数据分析',
  'growth-records': '成长记录',
  rewards: '奖励',
  badges: '徽章',
  notifications: '通知',
};

export const parentSectionModules: Readonly<
  Record<ParentSection | 'notifications', FamilyModuleId>
> = {
  dashboard: 'points',
  tasks: 'tasks',
  reviews: 'check-in',
  rewards: 'rewards',
  levels: 'levels',
  badges: 'badges',
  stats: 'analytics',
  records: 'growth-records',
  family: 'family-settings',
  settings: 'family-settings',
  notifications: 'notifications',
};

export const childSectionModules: Readonly<Record<ChildSection | 'notifications', FamilyModuleId>> =
  {
    home: 'points',
    'check-ins': 'check-in',
    achievements: 'levels',
    rewards: 'rewards',
    records: 'growth-records',
    profile: 'authentication',
    notifications: 'notifications',
  };

export function isCoreFamilyModule(moduleId: FamilyModuleId): boolean {
  return coreModules.has(moduleId);
}

export function isFamilyModuleAvailable(
  moduleId: FamilyModuleId,
  readModel: FamilyModulesReadModel | null,
  state: FamilyModulesLoadState,
): boolean {
  if (isCoreFamilyModule(moduleId)) return true;
  if (state === 'loading') return true;
  if (state === 'error' || !readModel) return false;
  return readModel.modules.some((module) => module.id === moduleId && module.enabled);
}

export function enabledNavigationKeys<T extends string>(
  keys: readonly T[],
  modulesByKey: Readonly<Record<T, FamilyModuleId>>,
  readModel: FamilyModulesReadModel | null,
  state: FamilyModulesLoadState,
): T[] {
  return keys.filter((key) => isFamilyModuleAvailable(modulesByKey[key], readModel, state));
}

export function dependencyFeedback(
  readModel: FamilyModulesReadModel,
  moduleId: FamilyModuleId,
  enabled: boolean,
): string | null {
  const target = readModel.modules.find((module) => module.id === moduleId);
  if (!target) return '模块状态已变化，请刷新后重试。';
  if (enabled) {
    const missing = target.dependencies.filter(
      (dependency) =>
        !isCoreFamilyModule(dependency) &&
        !readModel.modules.some((module) => module.id === dependency && module.enabled),
    );
    return missing.length > 0
      ? `请先启用：${missing.map((dependency) => familyModuleLabels[dependency]).join('、')}`
      : null;
  }
  const dependents = readModel.modules.filter(
    (module) => module.enabled && module.dependencies.includes(moduleId),
  );
  return dependents.length > 0
    ? `请先关闭：${dependents.map((module) => familyModuleLabels[module.id]).join('、')}`
    : null;
}

export function versionedModulePatch(
  readModel: FamilyModulesReadModel,
  moduleId: FamilyModuleId,
  enabled: boolean,
) {
  return { version: readModel.version, modules: { [moduleId]: enabled } };
}

export async function updateFamilyModule(
  api: <T>(path: string, init?: RequestInit) => Promise<T>,
  readModel: FamilyModulesReadModel,
  moduleId: FamilyModuleId,
  enabled: boolean,
): Promise<FamilyModulesReadModel> {
  const result = await api<{ modules: FamilyModulesReadModel }>('/family/modules', {
    method: 'PATCH',
    body: JSON.stringify(versionedModulePatch(readModel, moduleId, enabled)),
  });
  return result.modules;
}
