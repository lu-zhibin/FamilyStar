import { describe, expect, it, vi } from 'vitest';

import type { AuthSession, SessionStore } from '../family-auth/types.js';
import { LevelAccessError, LevelService } from './service.js';
import type { LevelRepository, LevelSubject } from './types.js';

const child: LevelSubject = {
  userId: 'child-1',
  pointsEarnedTotal: 40,
  currentLevel: 1,
  familyAutoApproveQuota: 0,
  configurations: [
    {
      level: 1,
      name: 'One',
      icon: 'one',
      pointsRequired: 0,
      discount: 1,
      autoApproveQuota: 0,
      wishSlots: 1,
      extraDimensions: null,
    },
    {
      level: 2,
      name: 'Two',
      icon: 'two',
      pointsRequired: 30,
      discount: 0.9,
      autoApproveQuota: 30,
      wishSlots: 2,
      extraDimensions: null,
    },
  ],
};

function setup(session: AuthSession | null, found: LevelSubject | null = child) {
  const sessions: SessionStore = {
    create: vi.fn(),
    read: vi.fn().mockResolvedValue(session),
    revoke: vi.fn(),
    revokeSubject: vi.fn(),
  };
  const repository: LevelRepository = {
    findActiveChildLevel: vi.fn().mockResolvedValue(found),
  };
  return { service: new LevelService({ repository, sessions }), repository };
}

const childSession: AuthSession = {
  subjectId: 'child-1',
  familyId: 'family-1',
  role: 'child',
  issuedAt: '2026-07-31T00:00:00.000Z',
};

describe('LevelService', () => {
  it('lets a child read only the session subject', async () => {
    const { service, repository } = setup(childSession);

    await expect(service.getMe({ sessionToken: 'token' })).resolves.toMatchObject({
      level: { userId: 'child-1', current: { level: 2 } },
    });
    expect(repository.findActiveChildLevel).toHaveBeenCalledWith('family-1', 'child-1');
    await expect(
      service.getChild({ sessionToken: 'token', childId: 'child-2' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lets a parent read an active child through the session family', async () => {
    const { service, repository } = setup({
      ...childSession,
      subjectId: 'parent-1',
      role: 'parent',
    });

    await expect(
      service.getChild({ sessionToken: 'token', childId: 'child-2' }),
    ).resolves.toMatchObject({ level: { current: { level: 2 } } });
    expect(repository.findActiveChildLevel).toHaveBeenCalledWith('family-1', 'child-2');
    await expect(service.getMe({ sessionToken: 'token' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('returns stable unauthorized and not-found domain errors', async () => {
    await expect(setup(null).service.getMe({})).rejects.toBeInstanceOf(LevelAccessError);
    await expect(
      setup(childSession, null).service.getMe({ sessionToken: 'token' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
