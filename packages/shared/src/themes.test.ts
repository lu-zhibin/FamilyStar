import { describe, expect, it } from 'vitest';

import { DEFAULT_THEME_KEY, findTheme, THEME_CATALOG } from './themes.js';

describe('theme catalog contract', () => {
  it('publishes stable, unique, immutable theme definitions ordered by level', () => {
    expect(new Set(THEME_CATALOG.map(({ key }) => key)).size).toBe(THEME_CATALOG.length);
    expect(THEME_CATALOG.map(({ minimumLevel }) => minimumLevel)).toEqual([1, 3, 5, 8]);
    expect(Object.isFrozen(THEME_CATALOG)).toBe(true);
    expect(
      THEME_CATALOG.every((theme) => Object.isFrozen(theme) && Object.isFrozen(theme.tokens)),
    ).toBe(true);
  });

  it('keeps the migrated default available at level one', () => {
    expect(findTheme(DEFAULT_THEME_KEY)).toMatchObject({
      key: 'starlight',
      minimumLevel: 1,
    });
  });

  it('defines complete CSS variable values for every theme', () => {
    for (const theme of THEME_CATALOG) {
      expect(Object.keys(theme.tokens).sort()).toEqual([
        '--color-background',
        '--color-primary',
        '--color-secondary',
        '--color-surface',
        '--color-text',
      ]);
      expect(Object.values(theme.tokens).every((value) => /^#[0-9a-f]{6}$/i.test(value))).toBe(
        true,
      );
    }
  });
});
