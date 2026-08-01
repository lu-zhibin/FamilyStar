import { validatePluginManifest } from '@familystar/shared';
import type { Plugin } from '@familystar/shared';

import manifestDefinition from './manifest.json' with { type: 'json' };

export const TASKS_MANIFEST = validatePluginManifest(manifestDefinition);

export const tasksPlugin: Plugin<void> = Object.freeze({
  manifest: TASKS_MANIFEST,
  register() {},
  unregister() {},
});
