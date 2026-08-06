import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { PrismaHistoryRepository } from './history-prisma-repository.js';

const submittedAt = new Date('2026-08-05T12:00:00.000Z');
const checkDate = new Date('2026-08-05T00:00:00.000Z');
const soloId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const collaborationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const child = { id: '22222222-2222-4222-8222-222222222222', nickname: '星星' };
const task = { id: '44444444-4444-4444-8444-444444444444', name: '阅读' };

describe('PrismaHistoryRepository', () => {
  it('stably merges attempts, keeps historical parents, latest points, reviews, and media order', async () => {
    const soloFindMany = vi.fn().mockResolvedValue([
      {
        id: soloId,
        attemptNumber: 2,
        contentText: '再次提交',
        status: 'PENDING',
        submittedAt,
        mediaIds: ['66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555555'],
        review: {
          id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          decision: 'APPROVED',
          source: 'PARENT',
          reason: null,
          reviewerId: '88888888-8888-4888-8888-888888888888',
          reviewedAt: new Date('2026-08-05T13:00:00.000Z'),
        },
        checkIn: {
          id: '33333333-3333-4333-8333-333333333333',
          checkDate,
          pointsEarned: 12,
          child,
          task,
          attempts: [{ id: soloId }],
        },
      },
    ]);
    const collaborationFindMany = vi.fn().mockResolvedValue([
      {
        id: collaborationId,
        attemptNumber: 1,
        contentText: '一起完成',
        status: 'PENDING',
        submittedAt,
        mediaIds: [],
        review: {
          id: '77777777-7777-4777-8777-777777777777',
          decision: 'REJECTED',
          source: 'PARENT',
          reason: '请补充',
          reviewerId: '88888888-8888-4888-8888-888888888888',
          reviewedAt: new Date('2026-08-05T13:00:00.000Z'),
        },
        submission: {
          id: '99999999-9999-4999-8999-999999999999',
          childId: child.id,
          child,
          attempts: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }],
          round: {
            id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            roundNumber: 4,
            startDate: checkDate,
            endDate: checkDate,
            task,
            participants: [{ childId: child.id, pointsEarned: 20 }],
          },
        },
      },
    ]);
    const mediaFindMany = vi.fn().mockResolvedValue([
      {
        id: '55555555-5555-4555-8555-555555555555',
        type: 'IMAGE',
        mimeType: 'image/jpeg',
        sizeBytes: 10n,
        width: 100,
        height: 80,
        duration: null,
        createdAt: submittedAt,
      },
      {
        id: '66666666-6666-4666-8666-666666666666',
        type: 'VIDEO',
        mimeType: 'video/mp4',
        sizeBytes: 20n,
        width: 200,
        height: 160,
        duration: 8,
        createdAt: submittedAt,
      },
    ]);
    const repository = new PrismaHistoryRepository({
      checkInSubmissionAttempt: { findMany: soloFindMany },
      collaborationSubmissionAttempt: { findMany: collaborationFindMany },
      mediaAsset: { findMany: mediaFindMany },
    } as unknown as PrismaClient);

    const result = await repository.findHistory({
      familyId: '11111111-1111-4111-8111-111111111111',
      filters: {
        childId: child.id,
        taskId: task.id,
        startDate: new Date('2026-08-05T00:00:00.000Z'),
        endDateExclusive: new Date('2026-08-06T00:00:00.000Z'),
      },
      cursor: null,
      limit: 2,
    });

    expect(result.map(({ submissionType }) => submissionType)).toEqual(['SOLO', 'COLLABORATION']);
    expect(result[0]).toMatchObject({
      status: 'APPROVED',
      pointsEarned: 12,
      media: [
        { id: '66666666-6666-4666-8666-666666666666' },
        { id: '55555555-5555-4555-8555-555555555555' },
      ],
    });
    expect(result[1]).toMatchObject({
      status: 'REJECTED',
      pointsEarned: null,
      checkDate,
      collaborationRound: { roundNumber: 4 },
      review: { decision: 'REJECTED', reason: '请补充' },
    });
    expect(soloFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 3,
        where: expect.objectContaining({
          checkIn: {
            childId: child.id,
            taskId: task.id,
            checkDate: {
              gte: new Date('2026-08-05T00:00:00.000Z'),
              lt: new Date('2026-08-06T00:00:00.000Z'),
            },
          },
        }),
      }),
    );
    expect(collaborationFindMany.mock.calls[0]?.[0].where.submission.round).toEqual({
      taskId: task.id,
      endDate: {
        gte: new Date('2026-08-05T00:00:00.000Z'),
        lt: new Date('2026-08-06T00:00:00.000Z'),
      },
    });
    const soloWhere = soloFindMany.mock.calls[0]?.[0].where.checkIn;
    expect(soloWhere).not.toHaveProperty('deletedAt');
    expect(soloWhere).not.toHaveProperty('child');
    expect(soloWhere).not.toHaveProperty('task');
  });

  it('uses source-aware cursor predicates at an equal timestamp', async () => {
    const soloFindMany = vi.fn().mockResolvedValue([]);
    const collaborationFindMany = vi.fn().mockResolvedValue([]);
    const repository = new PrismaHistoryRepository({
      checkInSubmissionAttempt: { findMany: soloFindMany },
      collaborationSubmissionAttempt: { findMany: collaborationFindMany },
      mediaAsset: { findMany: vi.fn() },
    } as unknown as PrismaClient);

    await repository.findHistory({
      familyId: '11111111-1111-4111-8111-111111111111',
      filters: {},
      cursor: { submittedAt, submissionType: 'SOLO', attemptId: soloId },
      limit: 20,
    });

    expect(soloFindMany.mock.calls[0]?.[0].where.OR).toEqual([
      { submittedAt: { lt: submittedAt } },
      { submittedAt, id: { lt: soloId } },
    ]);
    expect(collaborationFindMany.mock.calls[0]?.[0].where.OR).toEqual([
      { submittedAt: { lt: submittedAt } },
      { submittedAt },
    ]);
  });
});
