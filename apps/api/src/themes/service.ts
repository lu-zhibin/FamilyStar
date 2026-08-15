import { findTheme, THEME_CATALOG } from '@familystar/shared';

import type { AuthSession } from '../family-auth/types.js';
import type { ThemeServiceDependencies, ThemeSubject, ThemeView } from './types.js';

export class ThemeAccessError extends Error {
  constructor(
    readonly code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'ThemeAccessError';
  }
}

export class InvalidThemeError extends Error {
  constructor() {
    super('The theme key is invalid.');
    this.name = 'InvalidThemeError';
  }
}

export class ThemeLockedError extends Error {
  constructor(
    readonly themeKey: string,
    readonly requiredLevel: number,
    readonly currentLevel: number,
  ) {
    super('The selected theme is locked.');
    this.name = 'ThemeLockedError';
  }
}

function view(subject: ThemeSubject, theme = THEME_CATALOG[0]!): ThemeView {
  return {
    ...theme,
    unlocked: subject.currentLevel >= theme.minimumLevel,
    selected: subject.selectedTheme === theme.key,
  };
}

export class ThemeService {
  constructor(private readonly dependencies: ThemeServiceDependencies) {}

  async getCatalog(input: { sessionToken?: string }) {
    const subject = await this.subject(await this.childSession(input.sessionToken));
    return {
      currentLevel: subject.currentLevel,
      selectedTheme: subject.selectedTheme,
      themes: THEME_CATALOG.map((theme) => view(subject, theme)),
    };
  }

  async select(input: { sessionToken?: string; themeKey: string }) {
    const session = await this.childSession(input.sessionToken);
    const theme = findTheme(input.themeKey);
    if (!theme) throw new InvalidThemeError();
    const subject = await this.subject(session);
    if (subject.currentLevel < theme.minimumLevel) {
      throw new ThemeLockedError(theme.key, theme.minimumLevel, subject.currentLevel);
    }
    const saved = await this.dependencies.repository.saveSelection({
      familyId: session.familyId,
      childId: session.subjectId,
      themeKey: theme.key,
      minimumLevel: theme.minimumLevel,
    });
    if (!saved) throw new ThemeAccessError('NOT_FOUND', 'The child was not found.');
    const selectedSubject = { ...subject, selectedTheme: theme.key };
    return { selectedTheme: theme.key, theme: view(selectedSubject, theme) };
  }

  private async childSession(token?: string): Promise<AuthSession> {
    const session = token ? await this.dependencies.sessions.read(token) : null;
    if (!session) throw new ThemeAccessError('UNAUTHORIZED', 'An active session is required.');
    if (session.role !== 'child') {
      throw new ThemeAccessError('FORBIDDEN', 'A child session is required.');
    }
    return session;
  }

  private async subject(session: AuthSession): Promise<ThemeSubject> {
    const subject = await this.dependencies.repository.findActiveChild(
      session.familyId,
      session.subjectId,
    );
    if (!subject) throw new ThemeAccessError('NOT_FOUND', 'The child was not found.');
    return subject;
  }
}
