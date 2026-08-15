import type { ThemeTokenName } from '@familystar/shared';
import { findTheme } from '../../../packages/shared/src/themes';

export type ThemeCatalogItem = Readonly<{
  key: string;
  name: string;
  description: string;
  minimum_level: number;
  tokens: Readonly<Record<string, string>>;
  unlocked: boolean;
  selected: boolean;
}>;

export type ThemeCatalogReadModel = Readonly<{
  current_level: number;
  selected_theme: string;
  themes: readonly ThemeCatalogItem[];
}>;

export type TrustedThemeTokens = Readonly<Record<ThemeTokenName, string>>;

export const THEME_SELECTED_EVENT = 'familystar:theme-selected';

export function trustedThemeTokens(theme: ThemeCatalogItem): TrustedThemeTokens | null {
  const controlled = findTheme(theme.key)?.tokens;
  if (!controlled) return null;
  const entries = Object.entries(controlled) as Array<[ThemeTokenName, string]>;
  if (entries.some(([name, value]) => theme.tokens[name] !== value)) return null;
  return controlled;
}

export function selectedThemeFromCatalog(catalog: ThemeCatalogReadModel): ThemeCatalogItem | null {
  return (
    catalog.themes.find(
      (theme) =>
        theme.key === catalog.selected_theme && theme.selected && trustedThemeTokens(theme),
    ) ?? null
  );
}

export function publishSelectedTheme(theme: ThemeCatalogItem): void {
  if (typeof window === 'undefined' || !trustedThemeTokens(theme)) return;
  window.dispatchEvent(new CustomEvent(THEME_SELECTED_EVENT, { detail: theme }));
}

export function themeRootStyle(theme: ThemeCatalogItem | null): Record<string, string> {
  const tokens = theme ? trustedThemeTokens(theme) : null;
  if (!tokens) return {};
  return {
    ...tokens,
    '--color-cream': tokens['--color-background'],
    '--color-sand': tokens['--color-background'],
    '--color-leaf': tokens['--color-primary'],
    '--color-leaf-dark': tokens['--color-primary'],
    '--color-orange': tokens['--color-secondary'],
    '--color-brown': tokens['--color-text'],
    '--color-brown-light': tokens['--color-text'],
  };
}

export function selectionFromResponse(
  catalog: ThemeCatalogReadModel,
  response: Readonly<{ selected_theme: string; theme: ThemeCatalogItem }>,
): ThemeCatalogReadModel {
  const selected = trustedThemeTokens(response.theme) ? response.theme : null;
  if (!selected || selected.key !== response.selected_theme) return catalog;
  return {
    ...catalog,
    selected_theme: response.selected_theme,
    themes: catalog.themes.map((theme) =>
      theme.key === selected.key ? { ...selected, selected: true } : { ...theme, selected: false },
    ),
  };
}

export async function selectTheme(
  api: <T>(path: string, init?: RequestInit) => Promise<T>,
  themeKey: string,
): Promise<Readonly<{ selected_theme: string; theme: ThemeCatalogItem }>> {
  return api('/themes/selection', {
    method: 'PATCH',
    body: JSON.stringify({ theme_key: themeKey }),
  });
}
