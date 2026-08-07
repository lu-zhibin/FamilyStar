import type { BadgeAward, BadgeTemplate, PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { PrismaBadgeRepository } from './prisma-repository.js';
import { BadgeConflictError } from './service.js';

const now = new Date('2026-08-06T08:00:00.000Z');

function template(overrides: Partial<BadgeTemplate> = {}): BadgeTemplate {
  return {
    id: 'template-a',
    familyId: 'family-a',
    presetCode: null,
    name: 'Task starter',
    description: 'Complete tasks',
    icon: 'star',
    category: 'tasks',
    conditionType: 'TASK_COMPLETION_COUNT',
    condition: { type: 'TASK_COMPLETION_COUNT', target: 1 },
    awardLevel: 1,
    isVisible: true,
    isEnabled: true,
    version: 1,
    createdById: 'parent-a',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function award(overrides: Partial<BadgeAward> = {}): BadgeAward {
  return {
    id: 'award-a',
    familyId: 'family-a',
    templateId: 'template-a',
    childId: 'child-a',
    level: 1,
    templateNameSnapshot: 'Task starter',
    templateDescriptionSnapshot: 'Complete tasks',
    templateIconSnapshot: 'star',
    templateCategorySnapshot: 'tasks',
    templateConditionTypeSnapshot: 'MANUAL',
    templateConditionSnapshot: { type: 'MANUAL' },
    templateVersion: 1,
    reason: 'Well done',
    sourceEventId: null,
    awardedById: 'parent-a',
    awardedAt: now,
    createdAt: now,
    ...overrides,
  };
}

function prismaWithTransaction(transaction: object): PrismaClient {
  return {
    $transaction: vi.fn(async (work: (client: typeof transaction) => Promise<unknown>) =>
      work(transaction),
    ),
  } as unknown as PrismaClient;
}

describe('PrismaBadgeRepository', () => {
  it('protects an awarded template from condition changes within the family', async () => {
    const badgeAwardCount = vi.fn().mockResolvedValue(1);
    const transaction = {
      badgeTemplate: {
        findFirst: vi.fn().mockResolvedValue(template()),
        update: vi.fn(),
      },
      badgeAward: { count: badgeAwardCount },
    };
    const repository = new PrismaBadgeRepository(prismaWithTransaction(transaction));

    await expect(
      repository.updateTemplate('family-a', 'template-a', {
        condition: { type: 'TASK_COMPLETION_COUNT', target: 7 },
      }),
    ).rejects.toBeInstanceOf(BadgeConflictError);
    expect(badgeAwardCount).toHaveBeenCalledWith({
      where: { familyId: 'family-a', templateId: 'template-a' },
    });
    expect(transaction.badgeTemplate.update).not.toHaveBeenCalled();
  });

  it('creates a manual award snapshot and recovers the unique existing award', async () => {
    const manualTemplate = template({
      conditionType: 'MANUAL',
      condition: { type: 'MANUAL' },
      name: 'Kind helper',
      version: 3,
    });
    const badgeAwardCreateMany = vi.fn().mockResolvedValue({ count: 0 });
    const outboxCreateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      user: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: 'parent-a' })
          .mockResolvedValueOnce({ id: 'child-a' }),
      },
      badgeTemplate: { findFirst: vi.fn().mockResolvedValue(manualTemplate) },
      badgeAward: {
        createMany: badgeAwardCreateMany,
        findUnique: vi.fn().mockResolvedValue(
          award({
            templateNameSnapshot: 'Kind helper',
            templateVersion: 3,
          }),
        ),
      },
      outboxEvent: { createMany: outboxCreateMany },
    };
    const repository = new PrismaBadgeRepository(prismaWithTransaction(transaction));

    await expect(
      repository.awardManually({
        familyId: 'family-a',
        parentId: 'parent-a',
        childId: 'child-a',
        templateId: 'template-a',
        reason: 'Well done',
        now,
      }),
    ).resolves.toMatchObject({ templateNameSnapshot: 'Kind helper', templateVersion: 3 });
    expect(badgeAwardCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          familyId: 'family-a',
          childId: 'child-a',
          templateNameSnapshot: 'Kind helper',
          templateConditionSnapshot: { type: 'MANUAL' },
          templateVersion: 3,
          awardedById: 'parent-a',
          reason: 'Well done',
        }),
      ],
      skipDuplicates: true,
    });
    expect(outboxCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ eventName: 'badges.award.created.v1' })],
      skipDuplicates: true,
    });
  });

  it('updates progress and relies on the template-child-level unique key on event replay', async () => {
    const badgeAwardCreateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const progressUpsert = vi.fn().mockResolvedValue(undefined);
    const createdAward = award({
      sourceEventId: '00000000-0000-4000-8000-000000000001',
    });
    const transaction = {
      user: {
        findFirst: vi.fn().mockResolvedValue({ pointsEarnedTotal: 120, currentLevel: 3 }),
      },
      badgeTemplate: {
        findMany: vi.fn().mockResolvedValue([
          template({
            conditionType: 'TOTAL_POINTS',
            condition: { type: 'TOTAL_POINTS', target: 100 },
          }),
        ]),
      },
      checkIn: { findMany: vi.fn().mockResolvedValue([]) },
      collaborationSubmission: { count: vi.fn().mockResolvedValue(0) },
      collaborationRound: { findMany: vi.fn().mockResolvedValue([]) },
      badgeProgress: { upsert: progressUpsert },
      badgeAward: {
        createMany: badgeAwardCreateMany,
        findMany: vi.fn().mockResolvedValue([createdAward]),
      },
      outboxEvent: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const repository = new PrismaBadgeRepository(prismaWithTransaction(transaction));
    const input = {
      familyId: 'family-a',
      childId: 'child-a',
      sourceEventId: '00000000-0000-4000-8000-000000000001',
      now,
    };

    await expect(repository.evaluateChild(input)).resolves.toEqual({ evaluated: 1, awarded: 1 });
    await expect(repository.evaluateChild(input)).resolves.toEqual({ evaluated: 1, awarded: 0 });
    expect(progressUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          templateId_childId_level: {
            templateId: 'template-a',
            childId: 'child-a',
            level: 1,
          },
        },
        create: expect.objectContaining({
          familyId: 'family-a',
          currentValue: 120,
          targetValue: 100,
        }),
      }),
    );
    expect(badgeAwardCreateMany).toHaveBeenLastCalledWith({
      data: [
        expect.objectContaining({
          familyId: 'family-a',
          templateId: 'template-a',
          childId: 'child-a',
          level: 1,
          sourceEventId: input.sourceEventId,
        }),
      ],
      skipDuplicates: true,
    });
    expect(transaction.outboxEvent.createMany).toHaveBeenCalledTimes(1);
    expect(transaction.outboxEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ id: createdAward.id, correlationId: createdAward.id })],
      skipDuplicates: true,
    });
  });

  it('property: rejects generated cross-family manual-award references before writing', async () => {
    for (const missing of ['parent', 'child', 'template'] as const) {
      for (let seed = 1; seed <= 12; seed += 1) {
        const users = vi
          .fn()
          .mockResolvedValueOnce(missing === 'parent' ? null : { id: `parent-${seed}` })
          .mockResolvedValueOnce(missing === 'child' ? null : { id: `child-${seed}` });
        const transaction = {
          user: { findFirst: users },
          badgeTemplate: {
            findFirst: vi
              .fn()
              .mockResolvedValue(
                missing === 'template'
                  ? null
                  : template({ conditionType: 'MANUAL', condition: { type: 'MANUAL' } }),
              ),
          },
          badgeAward: { createMany: vi.fn(), findUnique: vi.fn() },
          outboxEvent: { createMany: vi.fn() },
        };
        const repository = new PrismaBadgeRepository(prismaWithTransaction(transaction));

        await expect(
          repository.awardManually({
            familyId: `family-${seed}`,
            parentId: `parent-${seed}`,
            childId: `child-${seed}`,
            templateId: `template-${seed}`,
            reason: 'Well done',
            now,
          }),
        ).rejects.toMatchObject({ code: missing === 'parent' ? 'FORBIDDEN' : 'NOT_FOUND' });
        expect(users).toHaveBeenNthCalledWith(1, {
          where: {
            id: `parent-${seed}`,
            familyId: `family-${seed}`,
            role: 'PARENT',
            deletedAt: null,
          },
          select: { id: true },
        });
        expect(users).toHaveBeenNthCalledWith(2, {
          where: {
            id: `child-${seed}`,
            familyId: `family-${seed}`,
            role: 'CHILD',
            deletedAt: null,
          },
          select: { id: true },
        });
        expect(transaction.badgeTemplate.findFirst).toHaveBeenCalledWith({
          where: {
            id: `template-${seed}`,
            familyId: `family-${seed}`,
            conditionType: 'MANUAL',
            isEnabled: true,
            deletedAt: null,
          },
        });
        expect(transaction.badgeAward.createMany).not.toHaveBeenCalled();
      }
    }
  });

  it('resolves collaboration participants through a family-scoped completed round', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      participants: [{ childId: 'child-a' }, { childId: 'child-b' }],
    });
    const repository = new PrismaBadgeRepository({
      collaborationRound: { findFirst },
    } as unknown as PrismaClient);

    await expect(
      repository.findEventChildIds('family-a', 'check-in.collaboration.completed.v1', {
        round_id: 'round-a',
      }),
    ).resolves.toEqual(['child-a', 'child-b']);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'round-a', familyId: 'family-a', status: 'COMPLETED' },
      }),
    );
  });

  it('returns awarded display snapshots and live family-scoped wall progress', async () => {
    const originalTemplate = template({
      name: 'Renamed template',
      description: 'Renamed description',
      icon: 'renamed-icon',
      category: 'renamed-category',
      conditionType: 'COLLABORATION_COUNT',
      condition: { type: 'COLLABORATION_COUNT', target: 999 },
      version: 8,
    });
    const prisma = {
      user: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: 'child-a' })
          .mockResolvedValueOnce({ pointsEarnedTotal: 120, currentLevel: 3 }),
      },
      badgeTemplate: {
        findMany: vi.fn().mockResolvedValue([
          {
            ...originalTemplate,
            awards: [
              award({
                templateNameSnapshot: 'Original template',
                templateDescriptionSnapshot: 'Original description',
                templateIconSnapshot: 'original-icon',
                templateCategorySnapshot: 'original-category',
                templateConditionTypeSnapshot: 'TOTAL_POINTS',
                templateConditionSnapshot: { type: 'TOTAL_POINTS', target: 100 },
                templateVersion: 2,
              }),
            ],
            progress: [],
          },
        ]),
      },
      checkIn: { findMany: vi.fn().mockResolvedValue([]) },
      collaborationSubmission: { count: vi.fn().mockResolvedValue(0) },
      collaborationRound: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;
    const repository = new PrismaBadgeRepository(prisma);

    await expect(repository.getWall('family-a', 'child-a')).resolves.toEqual([
      expect.objectContaining({
        template: expect.objectContaining({
          name: 'Original template',
          description: 'Original description',
          icon: 'original-icon',
          category: 'original-category',
          condition: { type: 'TOTAL_POINTS', target: 100 },
          version: 2,
        }),
        award: expect.objectContaining({ templateNameSnapshot: 'Original template' }),
        progress: expect.objectContaining({ currentValue: 120, targetValue: 100 }),
      }),
    ]);
    expect(prisma.badgeTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ familyId: 'family-a' }),
      }),
    );
    expect(prisma.user.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: 'child-a', familyId: 'family-a', role: 'CHILD', deletedAt: null },
      select: { id: true },
    });
  });
});
