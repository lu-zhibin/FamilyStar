import { PluginRegistry } from '@familystar/shared';
import type { Plugin } from '@familystar/shared';
import { checkInPlugin } from '@familystar/check-in-module';
import { levelsPlugin } from '@familystar/levels-module';
import { pointsPlugin } from '@familystar/points-module';
import { rewardsPlugin } from '@familystar/rewards-module';
import { tasksPlugin } from '@familystar/tasks-module';

export { CHECK_IN_MANIFEST, checkInPlugin } from '@familystar/check-in-module';
export { LEVELS_MANIFEST, levelsPlugin } from '@familystar/levels-module';
export { POINTS_MANIFEST, pointsPlugin } from '@familystar/points-module';
export { REWARDS_MANIFEST, rewardsPlugin } from '@familystar/rewards-module';
export { TASKS_MANIFEST, tasksPlugin } from '@familystar/tasks-module';

export type BusinessModuleContext = void;
export type BusinessModulePlugin = Plugin<BusinessModuleContext>;

export const BUSINESS_MODULE_PERMISSIONS = Object.freeze([
  'database:read',
  'database:write',
  'events:publish',
  'events:subscribe',
]);

export const STATIC_BUSINESS_MODULES: readonly BusinessModulePlugin[] = Object.freeze([
  tasksPlugin,
  checkInPlugin,
  pointsPlugin,
  levelsPlugin,
  rewardsPlugin,
]);

export type ModuleTogglePlaceholder = Readonly<{
  moduleName: string;
  enabled: true;
  readOnly: true;
  status: 'coming-soon';
}>;

export const MODULE_TOGGLE_PLACEHOLDERS: readonly ModuleTogglePlaceholder[] = Object.freeze(
  STATIC_BUSINESS_MODULES.map(({ manifest }) =>
    Object.freeze({
      moduleName: manifest.name,
      enabled: true,
      readOnly: true,
      status: 'coming-soon' as const,
    }),
  ),
);

export async function registerBusinessModules(
  registry: PluginRegistry<BusinessModuleContext>,
): Promise<void> {
  for (const plugin of STATIC_BUSINESS_MODULES) {
    await registry.register(plugin);
  }
}

export async function unregisterBusinessModules(
  registry: PluginRegistry<BusinessModuleContext>,
): Promise<void> {
  for (const plugin of [...STATIC_BUSINESS_MODULES].reverse()) {
    if (registry.has(plugin.manifest.name)) {
      await registry.unregister(plugin.manifest.name);
    }
  }
}

export async function initializeBusinessModules(): Promise<PluginRegistry<BusinessModuleContext>> {
  const registry = new PluginRegistry<BusinessModuleContext>({
    context: undefined,
    allowedPermissions: BUSINESS_MODULE_PERMISSIONS,
  });

  await registerBusinessModules(registry);
  return registry;
}
