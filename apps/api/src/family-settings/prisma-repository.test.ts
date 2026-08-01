import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { PrismaFamilySettingsRepository } from './prisma-repository.js';

describe('PrismaFamilySettingsRepository', () => {
  it('reads and updates only an active family', async () => {
    const findFirst = vi.fn().mockResolvedValue({ settings: { makeupDays: 5 } });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new PrismaFamilySettingsRepository({
      family: { findFirst, updateMany },
    } as unknown as PrismaClient);

    await expect(repository.findActiveSettings('family-1')).resolves.toEqual({ makeupDays: 5 });
    await expect(repository.updateActiveSettings('family-1', { makeupDays: 7 })).resolves.toBe(
      true,
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'family-1', deletedAt: null },
      select: { settings: true },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'family-1', deletedAt: null },
      data: { settings: { makeupDays: 7 } },
    });
  });

  it('returns null or false when the active family does not exist', async () => {
    const repository = new PrismaFamilySettingsRepository({
      family: {
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as PrismaClient);

    await expect(repository.findActiveSettings('missing')).resolves.toBeNull();
    await expect(repository.updateActiveSettings('missing', {})).resolves.toBe(false);
  });
});
