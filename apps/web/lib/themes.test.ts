import { findTheme } from '@familystar/shared';
import { describe, expect, it, vi } from 'vitest';

import {
  selectTheme,
  selectedThemeFromCatalog,
  selectionFromResponse,
  themeRootStyle,
  trustedThemeTokens,
  type ThemeCatalogItem,
  type ThemeCatalogReadModel,
} from './themes';

function item(key: 'starlight' | 'ocean', selected: boolean, unlocked = true): ThemeCatalogItem {
  const theme = findTheme(key)!;
  return {
    key,
    name: theme.name,
    description: theme.description,
    minimum_level: theme.minimumLevel,
    tokens: theme.tokens,
    unlocked,
    selected,
  };
}

const catalog: ThemeCatalogReadModel = {
  current_level: 3,
  selected_theme: 'starlight',
  themes: [item('starlight', true), item('ocean', false)],
};

describe('theme web helpers', () => {
  it('accepts only exact tokens from the controlled shared catalog', () => {
    expect(trustedThemeTokens(item('ocean', false))).toEqual(findTheme('ocean')!.tokens);
    expect(
      trustedThemeTokens({
        ...item('ocean', false),
        tokens: { ...findTheme('ocean')!.tokens, '--color-primary': 'url(javascript:alert(1))' },
      }),
    ).toBeNull();
    expect(trustedThemeTokens({ ...item('ocean', false), key: 'unknown' })).toBeNull();
  });

  it('maps a trusted selection to root shell CSS variables', () => {
    const selected = selectedThemeFromCatalog(catalog)!;
    const style = themeRootStyle(selected);
    expect(style['--color-background']).toBe('#f5f7ff');
    expect(style['--color-leaf']).toBe(style['--color-primary']);
    expect(style['--color-brown']).toBe(style['--color-text']);
  });

  it('uses the server selection response and preserves it on the next catalog read', () => {
    const response = { selected_theme: 'ocean', theme: item('ocean', true) };
    const updated = selectionFromResponse(catalog, response);
    expect(updated.selected_theme).toBe('ocean');
    expect(selectedThemeFromCatalog(updated)?.key).toBe('ocean');
    expect(updated.themes.find((theme) => theme.key === 'starlight')?.selected).toBe(false);
  });

  it('sends the strict theme selection payload', async () => {
    const response = { selected_theme: 'ocean', theme: item('ocean', true) };
    const api = vi.fn().mockResolvedValue(response);
    await expect(selectTheme(api, 'ocean')).resolves.toBe(response);
    expect(api).toHaveBeenCalledWith('/themes/selection', {
      method: 'PATCH',
      body: JSON.stringify({ theme_key: 'ocean' }),
    });
  });
});
