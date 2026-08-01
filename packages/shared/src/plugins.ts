import { isEventName, parseEventName } from './events.js';

const PLUGIN_NAME_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;
const SEMANTIC_VERSION_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const DECLARATION_PATTERN = /^[a-z][a-z0-9]*(?:[.:-][a-z0-9]+)*$/;

export const PLUGIN_REGISTRY_ERROR_CODES = {
  DEPENDENCY_IN_USE: 'DEPENDENCY_IN_USE',
  DUPLICATE_PLUGIN: 'DUPLICATE_PLUGIN',
  INVALID_MANIFEST: 'INVALID_MANIFEST',
  MISSING_DEPENDENCY: 'MISSING_DEPENDENCY',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  PLUGIN_NOT_FOUND: 'PLUGIN_NOT_FOUND',
} as const;

export type PluginRegistryErrorCode =
  (typeof PLUGIN_REGISTRY_ERROR_CODES)[keyof typeof PLUGIN_REGISTRY_ERROR_CODES];

export type PluginManifest = Readonly<{
  name: string;
  version: string;
  capabilities: readonly string[];
  dependencies: readonly string[];
  permissions: readonly string[];
  subscribes: readonly string[];
  publishes: readonly string[];
}>;

export type Plugin<TContext> = Readonly<{
  manifest: PluginManifest;
  register(context: TContext): void | Promise<void>;
  unregister(context: TContext): void | Promise<void>;
}>;

export type PluginRegistryOptions<TContext> = Readonly<{
  context: TContext;
  allowedPermissions: readonly string[];
}>;

type PluginEntry<TContext> = Readonly<{
  plugin: Plugin<TContext>;
  manifest: PluginManifest;
}>;

export class PluginRegistryError extends Error {
  readonly code: PluginRegistryErrorCode;
  readonly pluginName: string;

  constructor(code: PluginRegistryErrorCode, pluginName: string, message: string) {
    super(message);
    this.name = 'PluginRegistryError';
    this.code = code;
    this.pluginName = pluginName;
  }
}

function invalidManifest(pluginName: string, message: string): never {
  throw new PluginRegistryError(PLUGIN_REGISTRY_ERROR_CODES.INVALID_MANIFEST, pluginName, message);
}

function validateUniqueList(
  values: readonly string[],
  label: string,
  pluginName: string,
  pattern: Readonly<{ test(value: string): boolean }>,
): readonly string[] {
  if (!Array.isArray(values)) {
    invalidManifest(pluginName, `Plugin manifest ${label} must be an array.`);
  }

  const result = values.map((value) => {
    if (typeof value !== 'string' || !pattern.test(value)) {
      invalidManifest(pluginName, `Plugin manifest ${label} contains an invalid value.`);
    }

    return value;
  });

  if (new Set(result).size !== result.length) {
    invalidManifest(pluginName, `Plugin manifest ${label} must not contain duplicates.`);
  }

  return Object.freeze(result);
}

export function validatePluginManifest(manifest: PluginManifest): PluginManifest {
  if (!manifest || typeof manifest !== 'object') {
    invalidManifest('<unknown>', 'Plugin manifest must be an object.');
  }

  const candidateName = typeof manifest.name === 'string' ? manifest.name : '<unknown>';

  if (!PLUGIN_NAME_PATTERN.test(candidateName)) {
    invalidManifest(candidateName, 'Plugin manifest name is invalid.');
  }

  if (typeof manifest.version !== 'string' || !SEMANTIC_VERSION_PATTERN.test(manifest.version)) {
    invalidManifest(candidateName, 'Plugin manifest version must use semantic versioning.');
  }

  const capabilities = validateUniqueList(
    manifest.capabilities,
    'capabilities',
    candidateName,
    DECLARATION_PATTERN,
  );
  const dependencies = validateUniqueList(
    manifest.dependencies,
    'dependencies',
    candidateName,
    PLUGIN_NAME_PATTERN,
  );
  const permissions = validateUniqueList(
    manifest.permissions,
    'permissions',
    candidateName,
    DECLARATION_PATTERN,
  );
  const subscribes = validateUniqueList(manifest.subscribes, 'subscribes', candidateName, {
    test: isEventName,
  });
  const publishes = validateUniqueList(manifest.publishes, 'publishes', candidateName, {
    test: isEventName,
  });

  if (dependencies.includes(candidateName)) {
    invalidManifest(candidateName, 'Plugin manifest cannot depend on itself.');
  }

  if (publishes.some((eventName) => parseEventName(eventName).namespace !== candidateName)) {
    invalidManifest(candidateName, 'Plugin manifest can only publish events in its namespace.');
  }

  return Object.freeze({
    name: candidateName,
    version: manifest.version,
    capabilities,
    dependencies,
    permissions,
    subscribes,
    publishes,
  });
}

export class PluginRegistry<TContext> {
  private readonly context: TContext;
  private readonly allowedPermissions: ReadonlySet<string>;
  private readonly entries = new Map<string, PluginEntry<TContext>>();

  constructor({ context, allowedPermissions }: PluginRegistryOptions<TContext>) {
    this.context = context;
    this.allowedPermissions = new Set(allowedPermissions);
  }

  has(pluginName: string): boolean {
    return this.entries.has(pluginName);
  }

  get(pluginName: string): PluginManifest | undefined {
    return this.entries.get(pluginName)?.manifest;
  }

  list(): readonly PluginManifest[] {
    return [...this.entries.values()].map(({ manifest }) => manifest);
  }

  async register(plugin: Plugin<TContext>): Promise<PluginManifest> {
    const manifest = validatePluginManifest(plugin.manifest);

    if (this.entries.has(manifest.name)) {
      throw new PluginRegistryError(
        PLUGIN_REGISTRY_ERROR_CODES.DUPLICATE_PLUGIN,
        manifest.name,
        `Plugin ${manifest.name} is already registered.`,
      );
    }

    const deniedPermission = manifest.permissions.find(
      (permission) => !this.allowedPermissions.has(permission),
    );
    if (deniedPermission) {
      throw new PluginRegistryError(
        PLUGIN_REGISTRY_ERROR_CODES.PERMISSION_DENIED,
        manifest.name,
        `Plugin ${manifest.name} requested an unavailable permission.`,
      );
    }

    const missingDependency = manifest.dependencies.find(
      (dependency) => !this.entries.has(dependency),
    );
    if (missingDependency) {
      throw new PluginRegistryError(
        PLUGIN_REGISTRY_ERROR_CODES.MISSING_DEPENDENCY,
        manifest.name,
        `Plugin ${manifest.name} requires an unregistered dependency.`,
      );
    }

    await plugin.register(this.context);
    this.entries.set(manifest.name, { plugin, manifest });
    return manifest;
  }

  async unregister(pluginName: string): Promise<void> {
    const entry = this.entries.get(pluginName);

    if (!entry) {
      throw new PluginRegistryError(
        PLUGIN_REGISTRY_ERROR_CODES.PLUGIN_NOT_FOUND,
        pluginName,
        `Plugin ${pluginName} is not registered.`,
      );
    }

    const dependent = [...this.entries.values()].find(({ manifest }) =>
      manifest.dependencies.includes(pluginName),
    );
    if (dependent) {
      throw new PluginRegistryError(
        PLUGIN_REGISTRY_ERROR_CODES.DEPENDENCY_IN_USE,
        pluginName,
        `Plugin ${pluginName} is required by another registered plugin.`,
      );
    }

    await entry.plugin.unregister(this.context);
    this.entries.delete(pluginName);
  }
}
