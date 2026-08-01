import { validatePluginManifest } from '@familystar/shared';
import type { Plugin } from '@familystar/shared';

import manifestDefinition from './manifest.json' with { type: 'json' };

export const REWARDS_MANIFEST = validatePluginManifest(manifestDefinition);

export const rewardsPlugin: Plugin<void> = Object.freeze({
  manifest: REWARDS_MANIFEST,
  register() {},
  unregister() {},
});
