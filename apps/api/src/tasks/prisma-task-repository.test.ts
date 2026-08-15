import type { Prisma, PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { InvalidTaskError, TaskStateConflictError } from './task-service.js';
import { PrismaTaskRepository } from './prisma-task-repository.js';

describe('PrismaTaskRepository family boundaries', () => {
  const storedTask = {
    id: 'task-1',
    familyId: 'family-1',
    taskTypeId: 'type-current',
    name: '阅读',
    description: null,
    submissionGuide: null,
    checkType: 'TEXT',
    verifyMode: 'MANUAL',
    collaborationMode: 'SOLO',
    frequency: { kind: 'daily' },
    basePoints: 10,
    status: 'ACTIVE',
    assignments: [
      {
        id: 'assignment-1',
        taskId: 'task-1',
        childId: 'child-1',
        customPoints: null,
        customFrequency: null,
        customCheckType: null,
        customVerifyMode: null,
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: null,
      },
    ],
    _count: { checkIns: 0, collaborationRounds: 0 },
  } as const;

  it('validates a task type when it is updated without assignments', async () => {
    const transaction = {
      task: {
        findFirst: vi.fn().mockResolvedValue(storedTask),
        update: vi.fn(),
      },
      taskType: { findFirst: vi.fn().mockResolvedValue(null) },
      user: { count: vi.fn().mockResolvedValue(0) },
    } as unknown as Prisma.TransactionClient;
    const prisma = {
      $transaction: vi.fn(async (work: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        work(transaction),
      ),
    } as unknown as PrismaClient;

    await expect(
      new PrismaTaskRepository(prisma).update('family-1', 'task-1', {
        taskTypeId: 'type-from-another-family',
      }),
    ).rejects.toBeInstanceOf(InvalidTaskError);
    expect(transaction.task.update).not.toHaveBeenCalled();
    expect(transaction.taskType.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'type-from-another-family',
        familyId: 'family-1',
        isEnabled: true,
        deletedAt: null,
      },
      select: { id: true },
    });
  });

  it.each([
    { name: '新名称' },
    { taskTypeId: 'type-2' },
    { collaborationMode: 'COLLAB' as const },
    { frequency: { kind: 'weekly_count' as const, count: 2 } },
    { basePoints: 20 },
    { checkType: 'PHOTO' as const },
    { verifyMode: 'AUTO' as const },
    { assignments: [{ childId: 'child-2', startDate: '2026-08-01' }] },
  ])('rejects historical semantic update %# inside the transaction', async (patch) => {
    const update = vi.fn();
    const transaction = {
      task: {
        findFirst: vi.fn().mockResolvedValue({
          ...storedTask,
          _count: { checkIns: 1, collaborationRounds: 0 },
        }),
        update,
      },
    } as unknown as Prisma.TransactionClient;
    const prisma = {
      $transaction: vi.fn(async (work: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        work(transaction),
      ),
    } as unknown as PrismaClient;

    await expect(
      new PrismaTaskRepository(prisma).update('family-1', 'task-1', patch),
    ).rejects.toBeInstanceOf(TaskStateConflictError);
    expect(update).not.toHaveBeenCalled();
  });

  it('allows safe historical description and guide updates', async () => {
    const updated = {
      ...storedTask,
      description: '新的安全说明',
      submissionGuide: '新的提交指南',
      _count: undefined,
    };
    const transaction = {
      task: {
        findFirst: vi.fn().mockResolvedValue({
          ...storedTask,
          _count: { checkIns: 0, collaborationRounds: 1 },
        }),
        update: vi.fn().mockResolvedValue(undefined),
        findUnique: vi.fn().mockResolvedValue(updated),
      },
    } as unknown as Prisma.TransactionClient;
    const prisma = {
      $transaction: vi.fn(async (work: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        work(transaction),
      ),
    } as unknown as PrismaClient;

    await expect(
      new PrismaTaskRepository(prisma).update('family-1', 'task-1', {
        description: '新的安全说明',
        submissionGuide: '新的提交指南',
      }),
    ).resolves.toMatchObject({ description: '新的安全说明', submissionGuide: '新的提交指南' });
  });

  it('queries active tasks with only the current child assignment', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { task: { findMany } } as unknown as PrismaClient;

    await new PrismaTaskRepository(prisma).listForChild('family-1', 'child-1');

    expect(findMany).toHaveBeenCalledWith({
      where: {
        familyId: 'family-1',
        status: 'ACTIVE',
        deletedAt: null,
        assignments: {
          some: { familyId: 'family-1', childId: 'child-1', deletedAt: null },
        },
      },
      include: {
        assignments: {
          where: { familyId: 'family-1', childId: 'child-1', deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('reads only privacy-safe collaboration summaries for the current child', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'round-1',
        taskId: 'task-1',
        status: 'ACTIVE',
        startDate: new Date('2026-08-05T00:00:00.000Z'),
        endDate: new Date('2026-08-05T00:00:00.000Z'),
        participants: [
          { childId: 'child-1', child: { nickname: '小星' } },
          { childId: 'child-2', child: { nickname: '小月' } },
        ],
        submissions: [
          {
            id: 'submission-1',
            childId: 'child-1',
            status: 'REJECTED',
            submittedAt: new Date('2026-08-05T10:00:00.000Z'),
            reviewComment: '请补拍全景',
          },
          {
            id: 'submission-2',
            childId: 'child-2',
            status: 'APPROVED',
            submittedAt: new Date('2026-08-05T10:01:00.000Z'),
            reviewComment: null,
          },
        ],
      },
    ]);
    const prisma = { collaborationRound: { findMany } } as unknown as PrismaClient;

    await expect(
      new PrismaTaskRepository(prisma).listCollaborationRoundsForChild(
        'family-1',
        'child-1',
        ['task-1'],
        '2026-08-05',
      ),
    ).resolves.toEqual([
      {
        id: 'round-1',
        taskId: 'task-1',
        status: 'ACTIVE',
        startDate: '2026-08-05',
        endDate: '2026-08-05',
        participants: [
          { nickname: '小星', isCurrentChild: true, submissionStatus: 'REJECTED' },
          { nickname: '小月', isCurrentChild: false, submissionStatus: 'APPROVED' },
        ],
        mySubmission: {
          id: 'submission-1',
          status: 'REJECTED',
          submittedAt: new Date('2026-08-05T10:00:00.000Z'),
          reviewComment: '请补拍全景',
        },
      },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        familyId: 'family-1',
        taskId: { in: ['task-1'] },
        startDate: { lte: new Date('2026-08-05T00:00:00.000Z') },
        endDate: { gte: new Date('2026-08-05T00:00:00.000Z') },
        participants: {
          some: { familyId: 'family-1', childId: 'child-1', status: 'ACTIVE' },
        },
      },
      select: {
        id: true,
        taskId: true,
        status: true,
        startDate: true,
        endDate: true,
        participants: {
          where: { familyId: 'family-1', status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
          select: { childId: true, child: { select: { nickname: true } } },
        },
        submissions: {
          where: { familyId: 'family-1' },
          select: {
            id: true,
            childId: true,
            status: true,
            submittedAt: true,
            reviewComment: true,
          },
        },
      },
      orderBy: [{ taskId: 'asc' }, { startDate: 'desc' }],
    });
    expect(JSON.stringify(findMany.mock.calls[0])).not.toMatch(
      /contentText|media|attempt|reviewedBy/,
    );
  });

  it('skips the collaboration query when no collaboration tasks are visible', async () => {
    const findMany = vi.fn();
    const prisma = { collaborationRound: { findMany } } as unknown as PrismaClient;

    await expect(
      new PrismaTaskRepository(prisma).listCollaborationRoundsForChild(
        'family-1',
        'child-1',
        [],
        '2026-08-05',
      ),
    ).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
