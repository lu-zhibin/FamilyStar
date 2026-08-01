import { validatePluginManifest } from '@familystar/shared';
import type { Plugin } from '@familystar/shared';

import manifestDefinition from './manifest.json' with { type: 'json' };

export const POINTS_MANIFEST = validatePluginManifest(manifestDefinition);

export const pointsPlugin: Plugin<void> = Object.freeze({
  manifest: POINTS_MANIFEST,
  register() {},
  unregister() {},
});
