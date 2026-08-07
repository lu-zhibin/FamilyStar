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
  return { service: new ThemeService({ repository, sessions }), repository };
}

describe('ThemeService', () => {
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

  it('returns the stable locked error type', () => {
    expect(new ThemeLockedError('forest', 5, 3).message).toBe('The selected theme is locked.');
  });
});
