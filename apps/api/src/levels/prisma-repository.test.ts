import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { PrismaLevelRepository } from './prisma-repository.js';

describe('PrismaLevelRepository', () => {
  it('reads an active child and level data through one family-scoped query', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'child-1',
      pointsEarnedTotal: 80,
      currentLevel: 2,
      family: {
        settings: { autoApproveQuota: 75 },
        levelConfigs: [
          {
            level: 2,
            name: 'Two',
            icon: 'two',
            pointsRequired: 30,
            discount: new Prisma.Decimal(0.9),
            autoApproveQuota: 30,
            wishSlots: 2,
            extraDimensions: [{ key: 'vote', value: '1' }],
          },
        ],
      },
    });
    const repository = new PrismaLevelRepository({
      user: { findFirst },
    } as unknown as PrismaClient);

    await expect(repository.findActiveChildLevel('family-1', 'child-1')).resolves.toMatchObject({
      userId: 'child-1',
      familyAutoApproveQuota: 75,
      configurations: [{ level: 2, discount: 0.9 }],
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'child-1', familyId: 'family-1', role: 'CHILD', deletedAt: null },
      }),
    );
  });

  it('returns null for a child outside the active family scope', async () => {
    const repository = new PrismaLevelRepository({
      user: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient);

    await expect(repository.findActiveChildLevel('family-1', 'child-2')).resolves.toBeNull();
  });
});
