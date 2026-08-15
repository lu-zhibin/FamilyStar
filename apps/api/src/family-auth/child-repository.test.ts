import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { PrismaChildAccountRepository } from './child-repository.js';

const row = {
  id: 'child-1',
  familyId: 'family-1',
  nickname: 'Child',
  childCredentialHash: 'hash',
  credentialType: 'PIN' as const,
  gender: 'FEMALE' as const,
  birthday: new Date('2018-05-20T00:00:00.000Z'),
  grade: '一年级',
  avatarMediaId: null,
  failedLoginAttempts: 0,
  lockedUntil: null,
  version: 2,
};

describe('PrismaChildAccountRepository', () => {
  it('resolves only an active family by its normalized code', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'family-1',
      name: 'Star Family',
      familyCode: '123456',
    });
    const repository = new PrismaChildAccountRepository({
      family: { findFirst },
    } as unknown as PrismaClient);

    await expect(repository.findActiveFamilyByCode('123456')).resolves.toMatchObject({
      id: 'family-1',
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { familyCode: '123456', deletedAt: null },
      select: { id: true, name: true, familyCode: true },
    });
  });

  it('creates and maps a child credential record', async () => {
    const create = vi.fn().mockResolvedValue(row);
    const repository = new PrismaChildAccountRepository({
      user: { create },
    } as unknown as PrismaClient);

    await expect(
      repository.createChild({
        familyId: 'family-1',
        nickname: 'Child',
        credentialType: 'pin',
        credentialHash: 'hash',
        gender: 'female',
        birthday: '2018-05-20',
        grade: '一年级',
        avatarMediaId: null,
      }),
    ).resolves.toEqual({
      id: 'child-1',
      familyId: 'family-1',
      nickname: 'Child',
      credentialType: 'pin',
      gender: 'female',
      birthday: '2018-05-20',
      grade: '一年级',
      avatarMediaId: null,
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'CHILD', credentialType: 'PIN', gender: 'FEMALE' }),
      }),
    );
  });

  it('scopes lookup, updates, and soft deletion to active children in one family', async () => {
    const findFirst = vi.fn().mockResolvedValue(row);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new PrismaChildAccountRepository({
      user: { findFirst, updateMany },
    } as unknown as PrismaClient);

    await expect(repository.findActiveChild('family-1', 'child-1')).resolves.toMatchObject({
      credentialHash: 'hash',
      failedLoginAttempts: 0,
      version: 2,
    });
    await expect(
      repository.updateChild('family-1', 'child-1', {
        credentialType: 'password',
        credentialHash: 'new-hash',
      }),
    ).resolves.toMatchObject({ id: 'child-1' });
    await expect(
      repository.softDeleteChild('family-1', 'child-1', new Date('2026-07-30T12:00:00.000Z')),
    ).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'child-1', familyId: 'family-1', role: 'CHILD', deletedAt: null },
      }),
    );
  });

  it('updates authentication state with a family-scoped optimistic version check', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new PrismaChildAccountRepository({
      user: { updateMany },
    } as unknown as PrismaClient);
    const lockedUntil = new Date('2026-07-30T12:15:00.000Z');

    await expect(
      repository.updateAuthenticationState('family-1', 'child-1', 2, {
        failedLoginAttempts: 5,
        lockedUntil,
      }),
    ).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'child-1',
        familyId: 'family-1',
        role: 'CHILD',
        deletedAt: null,
        version: 2,
      },
      data: {
        failedLoginAttempts: 5,
        lockedUntil,
        version: { increment: 1 },
      },
    });
  });

  it('accepts only ready, active avatar media owned by the family', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'avatar-1' });
    const repository = new PrismaChildAccountRepository({
      mediaAsset: { findFirst },
    } as unknown as PrismaClient);

    await expect(repository.isReadyFamilyAvatar('family-1', 'avatar-1')).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'avatar-1',
        familyId: 'family-1',
        uploadStatus: 'READY',
        deletedAt: null,
      },
      select: { id: true },
    });
  });
});
