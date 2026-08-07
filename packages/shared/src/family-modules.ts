export const CORE_FAMILY_MODULE_IDS = [
  'authentication',
  'family-settings',
  'tasks',
  'check-in',
  'points',
] as const;

export const OPTIONAL_FAMILY_MODULE_IDS = [
  'levels',
  'analytics',
  'growth-records',
  'rewards',
  'badges',
  'notifications',
] as const;

export type CoreFamilyModuleId = (typeof CORE_FAMILY_MODULE_IDS)[number];
export type OptionalFamilyModuleId = (typeof OPTIONAL_FAMILY_MODULE_IDS)[number];
export type FamilyModuleId = CoreFamilyModuleId | OptionalFamilyModuleId;

export type FamilyModuleDefinition = Readonly<{
  id: FamilyModuleId;
  category: 'core' | 'optional';
  dependencies: readonly FamilyModuleId[];
}>;

export type FamilyModuleState = FamilyModuleDefinition &
  Readonly<{
    enabled: boolean;
    configurable: boolean;
  }>;

export type FamilyModulesReadModel = Readonly<{
  version: number;
  modules: readonly FamilyModuleState[];
}>;

function defineFamilyModule(
  id: FamilyModuleId,
  category: FamilyModuleDefinition['category'],
  dependencies: readonly FamilyModuleId[],
): FamilyModuleDefinition {
  return Object.freeze({ id, category, dependencies: Object.freeze([...dependencies]) });
}

export const FAMILY_MODULE_DEFINITIONS: readonly FamilyModuleDefinition[] = Object.freeze([
  defineFamilyModule('authentication', 'core', []),
  defineFamilyModule('family-settings', 'core', ['authentication']),
  defineFamilyModule('tasks', 'core', ['authentication']),
  defineFamilyModule('check-in', 'core', ['tasks']),
  defineFamilyModule('points', 'core', ['check-in']),
  defineFamilyModule('levels', 'optional', ['points']),
  defineFamilyModule('analytics', 'optional', ['tasks', 'check-in', 'points', 'levels']),
  defineFamilyModule('growth-records', 'optional', ['check-in']),
  defineFamilyModule('rewards', 'optional', ['points', 'levels']),
  defineFamilyModule('badges', 'optional', ['check-in', 'points', 'levels']),
  defineFamilyModule('notifications', 'optional', ['authentication']),
]);

export const DEFAULT_OPTIONAL_FAMILY_MODULE_STATES: Readonly<
  Record<OptionalFamilyModuleId, boolean>
> = Object.freeze(
  Object.fromEntries(OPTIONAL_FAMILY_MODULE_IDS.map((moduleId) => [moduleId, true])) as Record<
    OptionalFamilyModuleId,
    boolean
  >,
);
