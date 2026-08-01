import { validatePluginManifest } from '@familystar/shared';
import type { Plugin } from '@familystar/shared';

import manifestDefinition from './manifest.json' with { type: 'json' };

export const CHECK_IN_MANIFEST = validatePluginManifest(manifestDefinition);

export const checkInPlugin: Plugin<void> = Object.freeze({
  manifest: CHECK_IN_MANIFEST,
  register() {},
  unregister() {},
});
