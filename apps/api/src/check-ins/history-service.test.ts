import { decodeCursor } from '../http/cursor.js';
import { describe, expect, it, vi } from 'vitest';

import { HistoryAccessError, HistoryService } from './history-service.js';
import type { HistoryItem, HistoryRepository } from './history-types.js';

const familyId = '11111111-1111-4111-8111-111111111111';
const childId = '22222222-2222-4222-8222-222222222222';

function item(
  attemptId: string,
  submissionType: HistoryItem['submissionType'],
  submittedAt: string,
): HistoryItem {
  return {
    attemptId,
    submissionId: '33333333-3333-4333-8333-333333333333',
    submissionType,
    attemptNumber: 1,
    child: { id: childId, nickname: '星星' },
    task: { id: '44444444-4444-4444-8444-444444444444', name: '阅读' },
    contentText: null,
    status: 'APPROVED',
    submittedAt: new Date(submittedAt),
    checkDate: new Date('2026-08-05T00:00:00.000Z'),
    collaborationRound: null,
    review: null,
    pointsEarned: 10,
    media: [],
  };
}

function fixture(role: 'parent' | 'child' = 'child', records: readonly HistoryItem[] = []) {
  const repository: HistoryRepository = {
    findFamilySettings: vi.fn().mockResolvedValue({ timeZone: 'America/New_York' }),
    findHistory: vi.fn().mockResolvedValue(records),
  };
  const service = new HistoryService({
    repository,
    sessions: {
      create: vi.fn(),
      read: vi.fn().mockResolvedValue({
        subjectId: childId,
        familyId,
        role,
        issuedAt: '2026-08-05T00:00:00.000Z',
      }),
      revoke: vi.fn(),
      revokeSubject: vi.fn(),
    },
  });
  return { repository, service };
}

describe('HistoryService', () => {
  it('scopes child history to the session subject and emits a typed cross-page cursor', async () => {
    const records = [
      item('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'SOLO', '2026-08-05T12:00:00.000Z'),
      item('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'COLLABORATION', '2026-08-05T12:00:00.000Z'),
    ];
    const { repository, service } = fixture('child', records);
    const result = await service.getMine({ sessionToken: 'token', cursor: null, limit: 1 });

    expect(repository.findHistory).toHaveBeenCalledWith(
      expect.objectContaining({ familyId, filters: { childId }, limit: 1 }),
    );
    expect(result.items).toEqual([records[0]]);
    expect(result.page.has_more).toBe(true);
    expect(decodeCursor(result.page.next_cursor ?? '')).toEqual({
      sortValue: '2026-08-05T12:00:00.000Z',
      id: 'SOLO:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
  });

  it('applies parent filters and inclusive business-date boundaries', async () => {
    const { repository, service } = fixture('parent');
    await service.getFamily({
      sessionToken: 'token',
      childId,
      taskId: '44444444-4444-4444-8444-444444444444',
      submissionType: 'COLLABORATION',
      startDate: '2026-03-08',
      endDate: '2026-03-08',
      cursor: null,
      limit: 20,
    });

    expect(repository.findHistory).toHaveBeenCalledWith({
      familyId,
      filters: {
        childId,
        taskId: '44444444-4444-4444-8444-444444444444',
        submissionType: 'COLLABORATION',
        startDate: new Date('2026-03-08T00:00:00.000Z'),
        endDateExclusive: new Date('2026-03-09T00:00:00.000Z'),
      },
      cursor: null,
      limit: 20,
    });
  });

  it('returns an empty page without a cursor', async () => {
    const { service } = fixture('child');
    await expect(
      service.getMine({ sessionToken: 'token', cursor: null, limit: 20 }),
    ).resolves.toEqual({ items: [], page: { has_more: false, next_cursor: null } });
  });

  it.each([
    [{ startDate: '2026-01-01' }, 'provided together'],
    [{ startDate: '2026-01-01', endDate: '2027-01-02' }, 'cannot exceed 366 days'],
  ])('rejects invalid date filters', async (filters, message) => {
    const { service } = fixture('parent');
    await expect(
      service.getFamily({ sessionToken: 'token', cursor: null, limit: 20, ...filters }),
    ).rejects.toThrow(message);
  });

  it('rejects missing sessions and incorrect roles', async () => {
    const missing = fixture().service;
    vi.mocked(
      (missing as unknown as { dependencies: { sessions: { read: ReturnType<typeof vi.fn> } } })
        .dependencies.sessions.read,
    ).mockResolvedValue(null);
    await expect(missing.getMine({ cursor: null, limit: 20 })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    } satisfies Partial<HistoryAccessError>);
    await expect(
      fixture('parent').service.getMine({ sessionToken: 'token', cursor: null, limit: 20 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' } satisfies Partial<HistoryAccessError>);
    await expect(
      fixture('child').service.getFamily({ sessionToken: 'token', cursor: null, limit: 20 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' } satisfies Partial<HistoryAccessError>);
  });
});
