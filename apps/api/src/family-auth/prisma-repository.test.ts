import type { Prisma, PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_LEVEL_CONFIGS, DEFAULT_TASK_TYPES } from './constants.js';
import { PrismaFamilyAuthRepository } from './prisma-repository.js';

describe('PrismaFamilyAuthRepository', () => {
  it('creates all family defaults through one transaction client', async () => {
    const familyCreate = vi.fn().mockResolvedValue({ id: 'family-1', familyCode: 'STARFAM001' });
    const userCreate = vi.fn().mockResolvedValue({
      id: 'parent-1',
      familyId: 'family-1',
      nickname: 'Parent',
      email: 'parent@example.com',
      passwordHash: 'hash',
    });
    const familyUpdate = vi.fn().mockResolvedValue(undefined);
    const templateUpsert = vi.fn().mockResolvedValue(undefined);
    const taskTypeCreateMany = vi.fn().mockResolvedValue({ count: 5 });
    const levelCreateMany = vi.fn().mockResolvedValue({ count: 20 });
    const transaction = {
      family: { create: familyCreate, update: familyUpdate },
      user: { create: userCreate },
      taskTypeTemplate: { upsert: templateUpsert },
      taskType: { createMany: taskTypeCreateMany },
      levelConfig: { createMany: levelCreateMany },
    };
    const prisma = {
      $transaction: vi.fn(async (work: (client: typeof transaction) => Promise<unknown>) =>
        work(transaction),
      ),
    } as unknown as PrismaClient;
    const repository = new PrismaFamilyAuthRepository(prisma);

    await expect(
      repository.createFamilyWithParent({
        familyName: 'Star Family',
        familyCode: 'STARFAM001',
        nickname: 'Parent',
        email: 'parent@example.com',
        passwordHash: 'hash',
        settings: { timeZone: 'Asia/Shanghai' },
      }),
    ).resolves.toMatchObject({ id: 'parent-1', familyId: 'family-1' });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(familyCreate).toHaveBeenCalledWith({
      data: {
        name: 'Star Family',
        familyCode: 'STARFAM001',
        settings: { timeZone: 'Asia/Shanghai' },
      },
    });
    expect(templateUpsert).toHaveBeenCalledTimes(DEFAULT_TASK_TYPES.length);
    expect(taskTypeCreateMany.mock.calls[0]?.[0].data).toHaveLength(DEFAULT_TASK_TYPES.length);
    expect(levelCreateMany.mock.calls[0]?.[0].data).toHaveLength(DEFAULT_LEVEL_CONFIGS.length);
    expect(familyUpdate).toHaveBeenCalledWith({
      where: { id: 'family-1' },
      data: { createdById: 'parent-1' },
    });
  });

  it('uses a case-insensitive active-parent lookup', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        id: 'parent-1',
        familyId: 'family-1',
        nickname: 'Parent',
        email: 'parent@example.com',
        passwordHash: 'hash',
      },
    ]);
    const repository = new PrismaFamilyAuthRepository({
      $queryRaw: queryRaw,
    } as unknown as PrismaClient);

    await expect(repository.findActiveParentByEmail('parent@example.com')).resolves.toMatchObject({
      id: 'parent-1',
    });
    expect(queryRaw).toHaveBeenCalledOnce();
  });

  it('creates or refreshes one pending invitation and detects verified email', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'family-1', createdById: 'parent-1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'invitation-1',
          familyId: 'family-1',
          invitedById: 'parent-1',
          email: 'second@example.com',
          expiresAt: new Date('2026-08-06T12:00:00.000Z'),
        },
      ]);
    const transaction = {
      $queryRaw: queryRaw,
      $executeRaw: vi.fn().mockResolvedValue(0),
      user: { count: vi.fn().mockResolvedValue(1) },
      familyIntegrationSetting: {
        findUnique: vi.fn().mockResolvedValue({ status: 'VERIFIED' }),
      },
    } as unknown as Prisma.TransactionClient;
    const repository = new PrismaFamilyAuthRepository({} as PrismaClient);

    await expect(
      repository.createOrRefresh(transaction, {
        actorId: 'parent-1',
        familyId: 'family-1',
        email: 'second@example.com',
        tokenHash: 'token-hash',
        expiresAt: new Date('2026-08-06T12:00:00.000Z'),
        now: new Date('2026-07-30T12:00:00.000Z'),
      }),
    ).resolves.toMatchObject({
      invitation: { id: 'invitation-1', email: 'second@example.com' },
      emailConfigured: true,
    });
    expect(queryRaw).toHaveBeenCalledTimes(3);
  });

  it('accepts an invitation and marks it with the second parent in one transaction', async () => {
    const now = new Date('2026-07-30T12:00:00.000Z');
    const invitation = {
      id: 'invitation-1',
      familyId: 'family-1',
      invitedById: 'parent-1',
      email: 'second@example.com',
      tokenHash: 'token-hash',
      status: 'PENDING',
      invitedUserId: null,
      expiresAt: new Date('2026-08-06T12:00:00.000Z'),
      acceptedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const parent = {
      id: 'parent-2',
      familyId: 'family-1',
      nickname: 'Second Parent',
      email: 'second@example.com',
      passwordHash: 'password-hash',
    };
    const invitationUpdate = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'invitation-1' }])
        .mockResolvedValueOnce([{ id: 'family-1', createdById: 'parent-1' }])
        .mockResolvedValueOnce([]),
      invitation: {
        findUnique: vi.fn().mockResolvedValue(invitation),
        update: invitationUpdate,
      },
      user: {
        count: vi.fn().mockResolvedValue(1),
        create: vi.fn().mockResolvedValue(parent),
      },
    } as unknown as Prisma.TransactionClient;
    const repository = new PrismaFamilyAuthRepository({} as PrismaClient);

    await expect(
      repository.accept(transaction, {
        tokenHash: 'token-hash',
        nickname: 'Second Parent',
        passwordHash: 'password-hash',
        now,
      }),
    ).resolves.toEqual(parent);
    expect(invitationUpdate).toHaveBeenCalledWith({
      where: { id: 'invitation-1' },
      data: { status: 'ACCEPTED', invitedUserId: 'parent-2', acceptedAt: now },
    });
  });

  it('rejects an invitation when its family has been soft deleted', async () => {
    const transaction = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'invitation-1' }])
        .mockResolvedValueOnce([]),
      invitation: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'invitation-1',
          familyId: 'family-1',
          email: 'second@example.com',
          status: 'PENDING',
          expiresAt: new Date('2026-08-06T12:00:00.000Z'),
        }),
      },
    } as unknown as Prisma.TransactionClient;
    const repository = new PrismaFamilyAuthRepository({} as PrismaClient);

    await expect(
      repository.accept(transaction, {
        tokenHash: 'token-hash',
        nickname: 'Second Parent',
        passwordHash: 'password-hash',
        now: new Date('2026-07-30T12:00:00.000Z'),
      }),
    ).rejects.toThrow('The invitation is no longer available.');
  });
});
