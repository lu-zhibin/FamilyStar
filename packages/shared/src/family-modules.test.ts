import { describe, expect, it } from 'vitest';

import {
  CORE_FAMILY_MODULE_IDS,
  DEFAULT_OPTIONAL_FAMILY_MODULE_STATES,
  FAMILY_MODULE_DEFINITIONS,
  OPTIONAL_FAMILY_MODULE_IDS,
} from './family-modules.js';

describe('family module contract', () => {
  it('publishes one immutable dependency-safe catalog for API and navigation consumers', () => {
    const known = new Set<string>();
    for (const definition of FAMILY_MODULE_DEFINITIONS) {
      expect(definition.dependencies.every((dependency) => known.has(dependency))).toBe(true);
      known.add(definition.id);
    }

    expect([...known]).toEqual([...CORE_FAMILY_MODULE_IDS, ...OPTIONAL_FAMILY_MODULE_IDS]);
    expect(Object.isFrozen(FAMILY_MODULE_DEFINITIONS)).toBe(true);
    expect(FAMILY_MODULE_DEFINITIONS.every(Object.isFrozen)).toBe(true);
  });

  it('defaults every optional module to enabled for existing families', () => {
    expect(DEFAULT_OPTIONAL_FAMILY_MODULE_STATES).toEqual(
      Object.fromEntries(OPTIONAL_FAMILY_MODULE_IDS.map((moduleId) => [moduleId, true])),
    );
  });
});
