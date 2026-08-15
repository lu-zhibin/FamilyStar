import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { PrismaThemeRepository } from './prisma-repository.js';

describe('PrismaThemeRepository', () => {
  it('reads a child through one active family-scoped query', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'child-1',
      currentLevel: 4,
      selectedTheme: 'ocean',
    });
    const repository = new PrismaThemeRepository({
      user: { findFirst },
    } as unknown as PrismaClient);

    await expect(repository.findActiveChild('family-1', 'child-1')).resolves.toEqual({
      childId: 'child-1',
      currentLevel: 4,
      selectedTheme: 'ocean',
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'child-1', familyId: 'family-1', role: 'CHILD', deletedAt: null },
      select: { id: true, currentLevel: true, selectedTheme: true },
    });
  });

  it('returns null for a child outside the authenticated family', async () => {
    const repository = new PrismaThemeRepository({
      user: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient);

    await expect(repository.findActiveChild('family-1', 'child-2')).resolves.toBeNull();
  });

  it('atomically scopes selection writes by family, child role, activity, and level', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new PrismaThemeRepository({
      user: { updateMany },
    } as unknown as PrismaClient);

    await expect(
      repository.saveSelection({
        familyId: 'family-1',
        childId: 'child-1',
        themeKey: 'forest',
        minimumLevel: 5,
      }),
    ).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'child-1',
        familyId: 'family-1',
        role: 'CHILD',
        deletedAt: null,
        currentLevel: { gte: 5 },
      },
      data: { selectedTheme: 'forest' },
    });
  });

  it('reports a rejected scoped write without changing another family', async () => {
    const repository = new PrismaThemeRepository({
      user: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    } as unknown as PrismaClient);

    await expect(
      repository.saveSelection({
        familyId: 'family-1',
        childId: 'child-in-family-2',
        themeKey: 'ocean',
        minimumLevel: 3,
      }),
    ).resolves.toBe(false);
  });
});
