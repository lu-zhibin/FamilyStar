import { describe, expect, it } from 'vitest';

import {
  PLUGIN_REGISTRY_ERROR_CODES,
  PluginRegistry,
  validatePluginManifest,
} from '@familystar/shared';

import {
  BUSINESS_MODULE_PERMISSIONS,
  CHECK_IN_MANIFEST,
  LEVELS_MANIFEST,
  MODULE_TOGGLE_PLACEHOLDERS,
  POINTS_MANIFEST,
  REWARDS_MANIFEST,
  STATIC_BUSINESS_MODULES,
  TASKS_MANIFEST,
  initializeBusinessModules,
  registerBusinessModules,
  unregisterBusinessModules,
} from './index.js';

const expectedModuleNames = ['tasks', 'check-in', 'points', 'levels', 'rewards'];

describe('static business modules', () => {
  it('exports valid immutable manifests through independent package entry points', () => {
    const manifests = [
      TASKS_MANIFEST,
      CHECK_IN_MANIFEST,
      POINTS_MANIFEST,
      LEVELS_MANIFEST,
      REWARDS_MANIFEST,
    ];

    expect(manifests.map(({ name }) => name)).toEqual(expectedModuleNames);
    for (const manifest of manifests) {
      expect(validatePluginManifest(manifest)).toEqual(manifest);
      expect(Object.isFrozen(manifest)).toBe(true);
      expect(
        manifest.capabilities.every((capability) => capability.startsWith(manifest.name)),
      ).toBe(true);
    }
  });

  it('keeps the compile-time list in dependency-safe registration order', () => {
    const registered = new Set<string>();

    expect(STATIC_BUSINESS_MODULES.map(({ manifest }) => manifest.name)).toEqual(
      expectedModuleNames,
    );
    for (const { manifest } of STATIC_BUSINESS_MODULES) {
      expect(manifest.dependencies.every((dependency) => registered.has(dependency))).toBe(true);
      registered.add(manifest.name);
    }
  });

  it('connects every declared subscription to a statically declared publisher', () => {
    const publishedEvents = new Set(
      STATIC_BUSINESS_MODULES.flatMap(({ manifest }) => manifest.publishes),
    );

    for (const { manifest } of STATIC_BUSINESS_MODULES) {
      expect(manifest.subscribes.every((eventName) => publishedEvents.has(eventName))).toBe(true);
    }
  });

  it('registers and unregisters the complete module lifecycle', async () => {
    const registry = await initializeBusinessModules();

    expect(registry.list().map(({ name }) => name)).toEqual(expectedModuleNames);

    await unregisterBusinessModules(registry);

    expect(registry.list()).toEqual([]);
  });

  it('cleans up a partially registered static list', async () => {
    const registry = new PluginRegistry<void>({
      context: undefined,
      allowedPermissions: BUSINESS_MODULE_PERMISSIONS,
    });
    await registry.register(STATIC_BUSINESS_MODULES[0]!);

    await unregisterBusinessModules(registry);

    expect(registry.list()).toEqual([]);
  });

  it('fails registration when the core permission allowlist is incomplete', async () => {
    const registry = new PluginRegistry<void>({
      context: undefined,
      allowedPermissions: [],
    });

    await expect(registerBusinessModules(registry)).rejects.toMatchObject({
      code: PLUGIN_REGISTRY_ERROR_CODES.PERMISSION_DENIED,
      pluginName: 'tasks',
    });
    expect(registry.list()).toEqual([]);
  });

  it('exposes read-only enabled placeholders without affecting static loading', () => {
    expect(MODULE_TOGGLE_PLACEHOLDERS).toEqual(
      expectedModuleNames.map((moduleName) => ({
        moduleName,
        enabled: true,
        readOnly: true,
        status: 'coming-soon',
      })),
    );
    expect(Object.isFrozen(MODULE_TOGGLE_PLACEHOLDERS)).toBe(true);
    expect(MODULE_TOGGLE_PLACEHOLDERS.every((placeholder) => Object.isFrozen(placeholder))).toBe(
      true,
    );
  });
});
