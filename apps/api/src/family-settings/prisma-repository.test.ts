import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { PrismaFamilySettingsRepository } from './prisma-repository.js';

describe('PrismaFamilySettingsRepository', () => {
  it('reads and updates only an active family', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      settings: { makeupDays: 5 },
      settingsVersion: 2,
      createdById: 'parent-1',
    });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new PrismaFamilySettingsRepository({
      family: { findFirst, updateMany },
    } as unknown as PrismaClient);

    await expect(repository.findActiveSettings('family-1')).resolves.toEqual({
      settings: { makeupDays: 5 },
      settingsVersion: 2,
      createdById: 'parent-1',
    });
    await expect(repository.updateActiveSettings('family-1', 2, { makeupDays: 7 })).resolves.toBe(
      true,
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'family-1', deletedAt: null },
      select: { settings: true, settingsVersion: true, createdById: true },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'family-1', deletedAt: null, settingsVersion: 2 },
      data: { settings: { makeupDays: 7 }, settingsVersion: { increment: 1 } },
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
    await expect(repository.updateActiveSettings('missing', 0, {})).resolves.toBe(false);
    await expect(
      repository.findActiveProfile('missing', new Date('2026-08-05T00:00:00.000Z')),
    ).resolves.toBeNull();
    await expect(repository.updateActiveProfile('missing', { name: '新家庭' })).resolves.toBe(
      false,
    );
  });

  it('reads active parents and pending invitation summaries without sensitive tokens', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'family-1',
      name: '星星家',
      settings: { timeZone: 'Asia/Shanghai' },
      settingsVersion: 3,
      createdById: 'parent-1',
      users: [
        {
          id: 'parent-1',
          nickname: '妈妈',
          email: 'parent@example.com',
          createdAt: new Date('2026-07-30T00:00:00.000Z'),
        },
      ],
      invitations: [
        {
          id: 'invite-1',
          email: 'second@example.com',
          expiresAt: new Date('2026-08-04T00:00:00.000Z'),
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      ],
    });
    const repository = new PrismaFamilySettingsRepository({
      family: { findFirst },
    } as unknown as PrismaClient);

    await expect(
      repository.findActiveProfile('family-1', new Date('2026-08-05T00:00:00.000Z')),
    ).resolves.toMatchObject({
      id: 'family-1',
      parents: [{ id: 'parent-1', isCreator: true }],
      invitations: [{ id: 'invite-1', status: 'expired' }],
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'family-1', deletedAt: null },
        select: expect.objectContaining({
          users: expect.objectContaining({ where: { role: 'PARENT', deletedAt: null } }),
          invitations: expect.objectContaining({ where: { status: 'PENDING' } }),
        }),
      }),
    );
  });

  it('updates only submitted profile fields in the active family', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new PrismaFamilySettingsRepository({
      family: { updateMany },
    } as unknown as PrismaClient);

    await expect(
      repository.updateActiveProfile('family-1', {
        name: '新家庭',
        settings: { timeZone: 'Europe/Berlin' },
        expectedSettingsVersion: 3,
      }),
    ).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'family-1', deletedAt: null, settingsVersion: 3 },
      data: {
        name: '新家庭',
        settings: { timeZone: 'Europe/Berlin' },
        settingsVersion: { increment: 1 },
      },
    });
  });
});
