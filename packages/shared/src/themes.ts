export const DEFAULT_THEME_KEY = 'starlight' as const;

export type ThemeTokenName =
  | '--color-background'
  | '--color-surface'
  | '--color-primary'
  | '--color-secondary'
  | '--color-text';

export type ThemeDefinition = Readonly<{
  key: string;
  name: string;
  description: string;
  minimumLevel: number;
  tokens: Readonly<Record<ThemeTokenName, string>>;
}>;

function defineTheme(
  key: string,
  name: string,
  description: string,
  minimumLevel: number,
  tokens: Record<ThemeTokenName, string>,
): ThemeDefinition {
  return Object.freeze({
    key,
    name,
    description,
    minimumLevel,
    tokens: Object.freeze({ ...tokens }),
  });
}

export const THEME_CATALOG: readonly ThemeDefinition[] = Object.freeze([
  defineTheme('starlight', 'Starlight', 'A bright blue theme for every new explorer.', 1, {
    '--color-background': '#f5f7ff',
    '--color-surface': '#ffffff',
    '--color-primary': '#4f46e5',
    '--color-secondary': '#f59e0b',
    '--color-text': '#1e1b4b',
  }),
  defineTheme('ocean', 'Ocean', 'A calm palette inspired by clear water.', 3, {
    '--color-background': '#ecfeff',
    '--color-surface': '#ffffff',
    '--color-primary': '#0891b2',
    '--color-secondary': '#0ea5e9',
    '--color-text': '#164e63',
  }),
  defineTheme('forest', 'Forest', 'A grounded green palette for growing stars.', 5, {
    '--color-background': '#f0fdf4',
    '--color-surface': '#ffffff',
    '--color-primary': '#16a34a',
    '--color-secondary': '#84cc16',
    '--color-text': '#14532d',
  }),
  defineTheme('sunset', 'Sunset', 'A warm palette for experienced adventurers.', 8, {
    '--color-background': '#fff7ed',
    '--color-surface': '#ffffff',
    '--color-primary': '#ea580c',
    '--color-secondary': '#db2777',
    '--color-text': '#7c2d12',
  }),
]);

export function findTheme(key: string): ThemeDefinition | undefined {
  return THEME_CATALOG.find((theme) => theme.key === key);
}
