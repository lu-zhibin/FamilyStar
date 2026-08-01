import { describe, expect, it, vi } from 'vitest';

import {
  PLUGIN_REGISTRY_ERROR_CODES,
  PluginRegistry,
  PluginRegistryError,
  validatePluginManifest,
} from './plugins.js';
import type { Plugin, PluginManifest } from './plugins.js';

type TestContext = Readonly<{ serviceName: string }>;

const context: TestContext = { serviceName: 'familystar' };

function createManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    name: 'tasks',
    version: '1.0.0',
    capabilities: ['tasks.manage'],
    dependencies: [],
    permissions: ['database:read'],
    subscribes: ['core.family.created.v1'],
    publishes: ['tasks.task.completed.v1'],
    ...overrides,
  };
}

function createPlugin(
  manifest: PluginManifest = createManifest(),
  hooks: Partial<Pick<Plugin<TestContext>, 'register' | 'unregister'>> = {},
): Plugin<TestContext> {
  return {
    manifest,
    register: hooks.register ?? vi.fn(),
    unregister: hooks.unregister ?? vi.fn(),
  };
}

function expectRegistryError(
  action: () => unknown,
  code: keyof typeof PLUGIN_REGISTRY_ERROR_CODES,
): void {
  try {
    action();
    throw new Error('Expected PluginRegistryError.');
  } catch (error) {
    expect(error).toBeInstanceOf(PluginRegistryError);
    expect(error).toMatchObject({ code: PLUGIN_REGISTRY_ERROR_CODES[code] });
  }
}

describe('validatePluginManifest', () => {
  it('returns an immutable snapshot and accepts complete semantic versions', () => {
    const source = createManifest({ version: '1.2.3-beta.1+build.7' });
    const manifest = validatePluginManifest(source);

    expect(manifest).toEqual(source);
    expect(manifest).not.toBe(source);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.capabilities)).toBe(true);
    expect(Object.isFrozen(manifest.dependencies)).toBe(true);
    expect(Object.isFrozen(manifest.permissions)).toBe(true);
    expect(Object.isFrozen(manifest.subscribes)).toBe(true);
    expect(Object.isFrozen(manifest.publishes)).toBe(true);
  });

  it.each([
    ['a non-object manifest', undefined],
    ['a missing name', createManifest({ name: undefined as never })],
    ['an invalid name', createManifest({ name: 'Tasks' })],
    ['an invalid version', createManifest({ version: '01.0.0' })],
    ['a non-array declaration', createManifest({ capabilities: 'tasks' as never })],
    ['an invalid capability', createManifest({ capabilities: ['Tasks Manage'] })],
    [
      'a duplicate declaration',
      createManifest({ permissions: ['database:read', 'database:read'] }),
    ],
    ['a self dependency', createManifest({ dependencies: ['tasks'] })],
    ['an invalid dependency', createManifest({ dependencies: ['Tasks'] })],
    ['an unversioned subscribed event', createManifest({ subscribes: ['core.family.created'] })],
    ['an invalid published event', createManifest({ publishes: ['tasks.task.completed.v0'] })],
    [
      'a published event outside its namespace',
      createManifest({ publishes: ['core.task.completed.v1'] }),
    ],
  ])('rejects %s', (_label, candidate) => {
    expectRegistryError(
      () => validatePluginManifest(candidate as PluginManifest),
      'INVALID_MANIFEST',
    );
  });
});

describe('PluginRegistry', () => {
  it('registers plugins, exposes manifests in order, and passes shared context', async () => {
    const register = vi.fn();
    const registry = new PluginRegistry({
      context,
      allowedPermissions: ['database:read'],
    });

    const manifest = await registry.register(createPlugin(createManifest(), { register }));

    expect(register).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith(context);
    expect(registry.has('tasks')).toBe(true);
    expect(registry.get('tasks')).toBe(manifest);
    expect(registry.get('missing')).toBeUndefined();
    expect(registry.list()).toEqual([manifest]);
  });

  it('requires dependencies to be registered before dependents', async () => {
    const registry = new PluginRegistry({
      context,
      allowedPermissions: ['database:read'],
    });
    const core = createPlugin(
      createManifest({
        name: 'core',
        capabilities: ['family.manage'],
        publishes: ['core.family.created.v1'],
      }),
    );
    const tasks = createPlugin(createManifest({ dependencies: ['core'] }));

    await expect(registry.register(tasks)).rejects.toMatchObject({
      code: PLUGIN_REGISTRY_ERROR_CODES.MISSING_DEPENDENCY,
      pluginName: 'tasks',
    });
    await registry.register(core);
    await registry.register(tasks);

    expect(registry.list().map(({ name }) => name)).toEqual(['core', 'tasks']);
  });

  it('rejects duplicate plugins before calling their lifecycle hook', async () => {
    const secondRegister = vi.fn();
    const registry = new PluginRegistry({
      context,
      allowedPermissions: ['database:read'],
    });
    await registry.register(createPlugin());

    await expect(
      registry.register(createPlugin(createManifest(), { register: secondRegister })),
    ).rejects.toMatchObject({ code: PLUGIN_REGISTRY_ERROR_CODES.DUPLICATE_PLUGIN });
    expect(secondRegister).not.toHaveBeenCalled();
  });

  it('rejects permissions outside the core allowlist', async () => {
    const registry = new PluginRegistry({ context, allowedPermissions: [] });

    await expect(registry.register(createPlugin())).rejects.toMatchObject({
      code: PLUGIN_REGISTRY_ERROR_CODES.PERMISSION_DENIED,
      pluginName: 'tasks',
    });
    expect(registry.has('tasks')).toBe(false);
  });

  it('does not add a plugin when its register hook fails', async () => {
    const registry = new PluginRegistry({
      context,
      allowedPermissions: ['database:read'],
    });
    const failure = new Error('register failed');

    await expect(
      registry.register(
        createPlugin(createManifest(), {
          register: vi.fn().mockRejectedValue(failure),
        }),
      ),
    ).rejects.toBe(failure);
    expect(registry.list()).toEqual([]);
  });

  it('protects dependencies and unregisters plugins in reverse order', async () => {
    const coreUnregister = vi.fn();
    const tasksUnregister = vi.fn();
    const registry = new PluginRegistry({
      context,
      allowedPermissions: ['database:read'],
    });
    await registry.register(
      createPlugin(
        createManifest({
          name: 'core',
          capabilities: ['family.manage'],
          publishes: ['core.family.created.v1'],
        }),
        { unregister: coreUnregister },
      ),
    );
    await registry.register(
      createPlugin(createManifest({ dependencies: ['core'] }), {
        unregister: tasksUnregister,
      }),
    );

    await expect(registry.unregister('core')).rejects.toMatchObject({
      code: PLUGIN_REGISTRY_ERROR_CODES.DEPENDENCY_IN_USE,
    });
    expect(coreUnregister).not.toHaveBeenCalled();

    await registry.unregister('tasks');
    await registry.unregister('core');

    expect(tasksUnregister).toHaveBeenCalledWith(context);
    expect(coreUnregister).toHaveBeenCalledWith(context);
    expect(registry.list()).toEqual([]);
  });

  it('keeps a plugin registered when its unregister hook fails', async () => {
    const registry = new PluginRegistry({
      context,
      allowedPermissions: ['database:read'],
    });
    const failure = new Error('unregister failed');
    await registry.register(
      createPlugin(createManifest(), {
        unregister: vi.fn().mockRejectedValue(failure),
      }),
    );

    await expect(registry.unregister('tasks')).rejects.toBe(failure);
    expect(registry.has('tasks')).toBe(true);
  });

  it('reports attempts to unregister unknown plugins', async () => {
    const registry = new PluginRegistry({ context, allowedPermissions: [] });

    await expect(registry.unregister('missing')).rejects.toMatchObject({
      code: PLUGIN_REGISTRY_ERROR_CODES.PLUGIN_NOT_FOUND,
      pluginName: 'missing',
    });
  });
});
