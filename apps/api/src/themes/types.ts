import type { ThemeDefinition } from '@familystar/shared';

import type { SessionStore } from '../family-auth/types.js';

export type ThemeSubject = Readonly<{
  childId: string;
  currentLevel: number;
  selectedTheme: string;
}>;

export type ThemeView = ThemeDefinition &
  Readonly<{
    unlocked: boolean;
    selected: boolean;
  }>;

export type ThemeRepository = {
  findActiveChild(familyId: string, childId: string): Promise<ThemeSubject | null>;
  saveSelection(input: {
    familyId: string;
    childId: string;
    themeKey: string;
    minimumLevel: number;
  }): Promise<boolean>;
};

export type ThemeOperations = {
  getCatalog(input: { sessionToken?: string }): Promise<{
    currentLevel: number;
    selectedTheme: string;
    themes: readonly ThemeView[];
  }>;
  select(input: { sessionToken?: string; themeKey: string }): Promise<{
    selectedTheme: string;
    theme: ThemeView;
  }>;
};

export type ThemeServiceDependencies = Readonly<{
  repository: ThemeRepository;
  sessions: SessionStore;
}>;
