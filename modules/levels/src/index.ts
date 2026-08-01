import { validatePluginManifest } from '@familystar/shared';
import type { Plugin } from '@familystar/shared';

import manifestDefinition from './manifest.json' with { type: 'json' };

export const LEVELS_MANIFEST = validatePluginManifest(manifestDefinition);

export const levelsPlugin: Plugin<void> = Object.freeze({
  manifest: LEVELS_MANIFEST,
  register() {},
  unregister() {},
});
