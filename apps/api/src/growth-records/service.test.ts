import { decodeCursor } from '../http/cursor.js';
import { describe, expect, it, vi } from 'vitest';

import { GrowthRecordAccessError, GrowthRecordService } from './service.js';
import type { GrowthRecordItem, GrowthRecordRepository } from './types.js';

const familyId = '11111111-1111-4111-8111-111111111111';
const parentId = '22222222-2222-4222-8222-222222222222';
const childId = '33333333-3333-4333-8333-333333333333';

function record(id: string, occurredOn = '2026-08-06'): GrowthRecordItem {
  const timestamp = new Date('2026-08-06T08:00:00.000Z');
  return {
    id,
    familyId,
    child: { id: childId, nickname: '星星' },
    task: null,
    type: 'NOTE',
    title: '阅读笔记',
    contentText: '完成一章',
    occurredOn: new Date(`${occurredOn}T00:00:00.000Z`),
    sourceType: null,
    sourceId: null,
    pointsEarned: null,
    createdById: parentId,
    createdAt: timestamp,
    updatedAt: timestamp,
    media: [],
  };
}

function fixture(role: 'parent' | 'child' = 'parent', records: readonly GrowthRecordItem[] = []) {
  const repository: GrowthRecordRepository = {
    findFamilySettings: vi.fn().mockResolvedValue({ timeZone: 'Asia/Shanghai' }),
    findMany: vi.fn().mockResolvedValue(records),
    createManual: vi.fn().mockResolvedValue(record('record-created')),
    updateManual: vi.fn().mockResolvedValue(record('record-updated')),
    softDeleteManual: vi.fn().mockResolvedValue(true),
  };
  const service = new GrowthRecordService({
    repository,
    sessions: {
      create: vi.fn(),
      read: vi.fn().mockResolvedValue({
        subjectId: parentId,
        familyId,
        role,
        issuedAt: '2026-08-06T00:00:00.000Z',
      }),
      revoke: vi.fn(),
      revokeSubject: vi.fn(),
    },
    now: () => new Date('2026-08-06T09:00:00.000Z'),
  });
  return { repository, service };
}

describe('GrowthRecordService', () => {
  it('applies family filters and emits a stable occurred-on cursor', async () => {
    const records = [
      record('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
      record('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
    ];
    const { repository, service } = fixture('parent', records);
    const result = await service.list({
      sessionToken: 'parent-session',
      childId,
      type: 'NOTE',
      startDate: '2026-08-01',
      endDate: '2026-08-06',
      cursor: null,
      limit: 1,
    });

    expect(repository.findMany).toHaveBeenCalledWith({
      familyId,
      filters: {
        childId,
        type: 'NOTE',
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDateExclusive: new Date('2026-08-07T00:00:00.000Z'),
      },
      cursor: null,
      limit: 1,
    });
    expect(result.items).toEqual([records[0]]);
    expect(decodeCursor(result.page.next_cursor ?? '')).toEqual({
      sortValue: '2026-08-06T00:00:00.000Z',
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
  });

  it('normalizes manual notes and preserves READY media order', async () => {
    const { repository, service } = fixture();
    await service.create({
      sessionToken: 'parent-session',
      record: {
        childId,
        type: 'NOTE',
        title: '  阅读笔记  ',
        contentText: '  完成一章  ',
        occurredOn: '2026-08-06',
        mediaIds: ['44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555'],
      },
    });

    expect(repository.createManual).toHaveBeenCalledWith({
      familyId,
      parentId,
      record: expect.objectContaining({
        title: '阅读笔记',
        contentText: '完成一章',
        occurredOn: new Date('2026-08-06T00:00:00.000Z'),
        mediaIds: ['44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555'],
      }),
    });
  });

  it('rejects duplicate media and non-parent sessions', async () => {
    const mediaId = '44444444-4444-4444-8444-444444444444';
    await expect(
      fixture().service.create({
        sessionToken: 'parent-session',
        record: {
          childId,
          type: 'NOTE',
          title: '笔记',
          occurredOn: '2026-08-06',
          mediaIds: [mediaId, mediaId],
        },
      }),
    ).rejects.toThrow('must be unique');
    await expect(
      fixture('child').service.list({ sessionToken: 'child-session', cursor: null, limit: 20 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' } satisfies Partial<GrowthRecordAccessError>);
  });

  it('maps missing manual records to the family-scoped not-found boundary', async () => {
    const { repository, service } = fixture();
    vi.mocked(repository.updateManual).mockResolvedValue(null);
    await expect(
      service.update({
        sessionToken: 'parent-session',
        recordId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        record: { title: '更新' },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' } satisfies Partial<GrowthRecordAccessError>);
  });
});
