import { THEME_CATALOG } from '@familystar/shared';
import { describe, expect, it, vi } from 'vitest';

import type { AuthSession, SessionStore } from '../family-auth/types.js';
import { InvalidThemeError, ThemeAccessError, ThemeLockedError, ThemeService } from './service.js';
import type { ThemeRepository, ThemeSubject } from './types.js';

const childSession: AuthSession = {
  subjectId: 'child-1',
  familyId: 'family-1',
  role: 'child',
  issuedAt: '2026-08-07T00:00:00.000Z',
};

const subject: ThemeSubject = {
  childId: 'child-1',
  currentLevel: 3,
  selectedTheme: 'starlight',
};

const THEME_PROPERTY_RUNS = 128;

function validatesCriteria(criteria: readonly string[]): string {
  return `[validatesCriteria: ${criteria.join(', ')}]`;
}

function setup(session: AuthSession | null = childSession, found: ThemeSubject | null = subject) {
  const sessions: SessionStore = {
    create: vi.fn(),
    read: vi.fn().mockResolvedValue(session),
    revoke: vi.fn(),
    revokeSubject: vi.fn(),
  };
  const repository: ThemeRepository = {
    findActiveChild: vi.fn().mockResolvedValue(found),
    saveSelection: vi.fn().mockResolvedValue(true),
  };
  return { service: new ThemeService({ repository, sessions }), repository, sessions };
}

describe('ThemeService', () => {
  it(`property: random levels unlock exactly the minimum-level themes and expose one selection ${validatesCriteria(['Requirement 12.3', 'Requirement 12.4'])}`, async () => {
    for (let run = 0; run < THEME_PROPERTY_RUNS; run += 1) {
      const currentLevel = (Math.imul(run + 3, 17) % 20) + 1;
      const unlocked = THEME_CATALOG.filter((theme) => currentLevel >= theme.minimumLevel);
      const selectedTheme = unlocked[run % unlocked.length]!.key;
      const { service } = setup(childSession, { ...subject, currentLevel, selectedTheme });

      const result = await service.getCatalog({ sessionToken: 'token' });

      expect(
        result.themes.every((theme) => theme.unlocked === currentLevel >= theme.minimumLevel),
      ).toBe(true);
      expect(result.themes.filter((theme) => theme.selected).map((theme) => theme.key)).toEqual([
        selectedTheme,
      ]);
    }
  });

  it('derives unlocked and selected flags from the authoritative child level', async () => {
    const { service, repository } = setup();

    const result = await service.getCatalog({ sessionToken: 'token' });

    expect(result).toMatchObject({ currentLevel: 3, selectedTheme: 'starlight' });
    expect(result.themes).toHaveLength(4);
    expect(result.themes[0]).toMatchObject({ key: 'starlight', unlocked: true, selected: true });
    expect(result.themes[1]).toMatchObject({ key: 'ocean', unlocked: true, selected: false });
    expect(result.themes[2]).toMatchObject({ key: 'forest', unlocked: false, selected: false });
    expect(repository.findActiveChild).toHaveBeenCalledWith('family-1', 'child-1');
  });

  it('persists an unlocked selection with the session family and subject', async () => {
    const { service, repository } = setup();

    await expect(
      service.select({ sessionToken: 'token', themeKey: 'ocean' }),
    ).resolves.toMatchObject({
      selectedTheme: 'ocean',
      theme: { key: 'ocean', unlocked: true, selected: true },
    });
    expect(repository.saveSelection).toHaveBeenCalledWith({
      familyId: 'family-1',
      childId: 'child-1',
      themeKey: 'ocean',
      minimumLevel: 3,
    });
  });

  it('keeps the existing selection when the requested theme is locked', async () => {
    const { service, repository } = setup();

    await expect(
      service.select({ sessionToken: 'token', themeKey: 'forest' }),
    ).rejects.toMatchObject({
      name: 'ThemeLockedError',
      themeKey: 'forest',
      requiredLevel: 5,
      currentLevel: 3,
    });
    expect(repository.saveSelection).not.toHaveBeenCalled();
  });

  it(`property: every locked theme returns a stable conflict and leaves selection unchanged ${validatesCriteria(['Requirement 12.5'])}`, async () => {
    for (let run = 0; run < THEME_PROPERTY_RUNS; run += 1) {
      const currentLevel = (run % 7) + 1;
      const lockedThemes = THEME_CATALOG.filter((theme) => theme.minimumLevel > currentLevel);
      const lockedTheme = lockedThemes[run % lockedThemes.length];
      if (!lockedTheme) continue;
      let selectedTheme = 'starlight';
      const repository: ThemeRepository = {
        findActiveChild: vi.fn(async () => ({ ...subject, currentLevel, selectedTheme })),
        saveSelection: vi.fn(async (input) => {
          selectedTheme = input.themeKey;
          return true;
        }),
      };
      const { sessions } = setup();
      const service = new ThemeService({ repository, sessions });

      await expect(
        service.select({ sessionToken: 'token', themeKey: lockedTheme.key }),
      ).rejects.toMatchObject({
        name: 'ThemeLockedError',
        themeKey: lockedTheme.key,
        requiredLevel: lockedTheme.minimumLevel,
        currentLevel,
      });
      expect(selectedTheme).toBe('starlight');
      expect(repository.saveSelection).not.toHaveBeenCalled();
    }
  });

  it('rejects unknown catalog keys without writing', async () => {
    const { service, repository } = setup();

    await expect(
      service.select({ sessionToken: 'token', themeKey: 'unknown' }),
    ).rejects.toBeInstanceOf(InvalidThemeError);
    expect(repository.saveSelection).not.toHaveBeenCalled();
  });

  it('enforces child identity and reports missing family-scoped subjects', async () => {
    await expect(setup(null).service.getCatalog({})).rejects.toBeInstanceOf(ThemeAccessError);
    await expect(
      setup({ ...childSession, role: 'parent' }).service.getCatalog({ sessionToken: 'token' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      setup(childSession, null).service.getCatalog({ sessionToken: 'token' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it(`property: theme reads and writes use the session family and child only ${validatesCriteria(['Requirement 12.3', 'Requirement 12.4', 'Correctness Property 1'])}`, async () => {
    for (let run = 0; run < 64; run += 1) {
      const familyOne = `family-a-${run}`;
      const familyTwo = `family-b-${run}`;
      const childOne = `child-a-${run}`;
      const childTwo = `child-b-${run}`;
      const selections = new Map([
        [childOne, 'starlight'],
        [childTwo, 'starlight'],
      ]);
      const { sessions } = setup();
      vi.mocked(sessions.read).mockResolvedValue({
        ...childSession,
        familyId: familyOne,
        subjectId: childOne,
      });
      const repository: ThemeRepository = {
        findActiveChild: vi.fn(async (familyId, childId) =>
          familyId === familyOne && childId === childOne
            ? {
                childId,
                currentLevel: 20,
                selectedTheme: selections.get(childId)!,
              }
            : null,
        ),
        saveSelection: vi.fn(async ({ familyId, childId, themeKey }) => {
          if (familyId !== familyOne || childId !== childOne) return false;
          selections.set(childId, themeKey);
          return true;
        }),
      };
      const service = new ThemeService({ repository, sessions });

      await service.select({ sessionToken: 'family-a-token', themeKey: 'ocean' });

      expect(repository.findActiveChild).toHaveBeenCalledWith(familyOne, childOne);
      expect(repository.saveSelection).toHaveBeenCalledWith(
        expect.objectContaining({ familyId: familyOne, childId: childOne }),
      );
      expect(selections.get(childOne)).toBe('ocean');
      expect(selections.get(childTwo)).toBe('starlight');
      await expect(repository.findActiveChild(familyTwo, childTwo)).resolves.toBeNull();
    }
  });

  it('returns the stable locked error type', () => {
    expect(new ThemeLockedError('forest', 5, 3).message).toBe('The selected theme is locked.');
  });
});
