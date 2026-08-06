import { describe, expect, it, vi } from 'vitest';

import type { SessionStore } from '../family-auth/types.js';
import { BadgeAccessError, BadgeService } from './service.js';
import type { BadgeRepository } from './types.js';

function dependencies(role: 'parent' | 'child', familyId = 'family-a') {
  const sessions = {
    read: vi.fn().mockResolvedValue({
      subjectId: role === 'parent' ? 'parent-a' : 'child-a',
      familyId,
      role,
      issuedAt: '2026-08-06T00:00:00.000Z',
    }),
  } as unknown as SessionStore;
  const repository = {
    listTemplates: vi.fn().mockResolvedValue([]),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    softDeleteTemplate: vi.fn(),
    awardManually: vi.fn(),
    getWall: vi.fn().mockResolvedValue([]),
  } as unknown as BadgeRepository;
  return { sessions, repository };
}

describe('BadgeService', () => {
  it('uses the parent session family for template management', async () => {
    const { sessions, repository } = dependencies('parent');
    const service = new BadgeService({ repository, sessions });

    await service.listTemplates({ sessionToken: 'session' });

    expect(repository.listTemplates).toHaveBeenCalledWith('family-a');
  });

  it('uses the child session identity for the badge wall', async () => {
    const { sessions, repository } = dependencies('child', 'family-b');
    const service = new BadgeService({ repository, sessions });

    await service.getMyWall({ sessionToken: 'session' });

    expect(repository.getWall).toHaveBeenCalledWith('family-b', 'child-a');
  });

  it('rejects child template management and parent badge-wall access', async () => {
    const childDependencies = dependencies('child');
    const parentDependencies = dependencies('parent');

    await expect(
      new BadgeService(childDependencies).listTemplates({ sessionToken: 'session' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' } satisfies Partial<BadgeAccessError>);
    await expect(
      new BadgeService(parentDependencies).getMyWall({ sessionToken: 'session' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' } satisfies Partial<BadgeAccessError>);
  });

  it('passes a normalized reason and session-scoped identities to manual award', async () => {
    const { sessions, repository } = dependencies('parent');
    vi.mocked(repository.awardManually).mockResolvedValue({ id: 'award-a' } as never);
    const now = new Date('2026-08-06T08:00:00.000Z');
    const service = new BadgeService({ repository, sessions, now: () => now });

    await service.awardManually({
      sessionToken: 'session',
      childId: 'child-a',
      templateId: 'template-a',
      reason: '  Great teamwork  ',
    });

    expect(repository.awardManually).toHaveBeenCalledWith({
      familyId: 'family-a',
      parentId: 'parent-a',
      childId: 'child-a',
      templateId: 'template-a',
      reason: 'Great teamwork',
      now,
    });
  });
});
