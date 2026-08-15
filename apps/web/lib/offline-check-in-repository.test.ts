import { describe, expect, it } from 'vitest';

import {
  MEDIA_DRAFT_LIMITS,
  MemoryOfflineCheckInRepository,
  OFFLINE_CHECK_IN_DB,
  OfflineStorageError,
  getOfflineCheckInRepository,
  isOfflineRecordOwnedBy,
  type NewCheckInQueueRecord,
  type NewMediaDraftRecord,
} from './offline-check-in-repository';

function validatesCriteria(criteria: readonly string[]): string {
  return `[validatesCriteria: ${criteria.join(', ')}]`;
}

function queueRecord(
  index: number,
  overrides: Partial<NewCheckInQueueRecord> = {},
): NewCheckInQueueRecord {
  const type = index % 2 === 0 ? 'TICK' : 'TEXT';
  return {
    id: `queue-${index}`,
    intentId: `intent-${index}`,
    createdAt: new Date(Date.UTC(2026, 7, 7, 0, 0, index)).toISOString(),
    endpoint: '/check-ins',
    taskId: `task-${index % 5}`,
    taskAssignmentId: `assignment-${index}`,
    checkDate: '2026-08-07',
    submissionType: type,
    ...(type === 'TEXT' ? { text: `完成任务 ${index}` } : {}),
    idempotencyKey: `check-in-key-${index}`,
    owner: { familyId: 'family-1', childId: 'child-1' },
    ...overrides,
  };
}

function mediaDraft(
  index: number,
  blob: Blob,
  overrides: Partial<NewMediaDraftRecord> = {},
): NewMediaDraftRecord {
  return {
    id: `draft-${index}`,
    intentId: `media-intent-${index}`,
    createdAt: new Date(Date.UTC(2026, 7, 7, 1, 0, index)).toISOString(),
    taskId: `task-${index}`,
    taskAssignmentId: `assignment-${index}`,
    checkDate: '2026-08-07',
    queueId: null,
    submissionType: 'PHOTO',
    checkInIdempotencyKey: `check-in-media-parent-${index}`,
    uploadIdempotencyKey: `check-in-media-${index}`,
    owner: { familyId: 'family-1', childId: 'child-1' },
    name: `proof-${index}.png`,
    mimeType: 'image/png',
    size: blob.size,
    blob,
    ...overrides,
  };
}

describe('offline check-in repository', () => {
  it(`property: persists every legal TICK/TEXT sequence in creation order without sensitive fields ${validatesCriteria(['Requirement 11.3', 'Design Property 8'])}`, async () => {
    for (let run = 1; run <= 64; run += 1) {
      const repository = new MemoryOfflineCheckInRepository();
      const count = (Math.imul(run, 17) % 19) + 1;
      const indexes = Array.from({ length: count }, (_, index) => index).sort(
        (left, right) => (Math.imul(left + run, 31) % 23) - (Math.imul(right + run, 31) % 23),
      );
      for (const index of indexes) await repository.enqueueCheckIn(queueRecord(index));

      const records = await repository.listCheckIns();
      expect(records.map(({ id }) => id)).toEqual(
        Array.from({ length: count }, (_, index) => `queue-${index}`),
      );
      expect(records.every(({ status }) => status === 'pending')).toBe(true);
      expect(records.every(({ attempt }) => attempt.attemptCount === 0)).toBe(true);
      expect(JSON.stringify(records)).not.toMatch(/cookie|session|authorization|auth[_-]?header/i);
    }
  });

  it(`property: keeps the first idempotency key for repeated reads and writes of one intent ${validatesCriteria(['Requirement 11.3', 'Design Property 8'])}`, async () => {
    for (let run = 0; run < 128; run += 1) {
      const repository = new MemoryOfflineCheckInRepository();
      const original = await repository.enqueueCheckIn(queueRecord(run));
      const duplicate = await repository.enqueueCheckIn(
        queueRecord(run + 1000, {
          intentId: original.intentId,
          idempotencyKey: `replacement-${run}`,
        }),
      );
      const reread = await repository.listCheckIns();

      expect(duplicate.id).toBe(original.id);
      expect(duplicate.idempotencyKey).toBe(`check-in-key-${run}`);
      expect(reread).toHaveLength(1);
      expect(reread[0]?.idempotencyKey).toBe(`check-in-key-${run}`);
    }
  });

  it(`property: round-trips media blobs, metadata, and valid queue associations ${validatesCriteria(['Requirement 11.4'])}`, async () => {
    for (let run = 0; run < 48; run += 1) {
      const repository = new MemoryOfflineCheckInRepository();
      const queue = await repository.enqueueCheckIn(queueRecord(run));
      const content = Uint8Array.from(
        { length: (Math.imul(run, 17) % 127) + 1 },
        (_, index) => (Math.imul(run + 1, index + 29) + index) % 256,
      );
      const blob = new Blob([content], { type: 'image/png' });
      await repository.saveMediaDrafts([
        mediaDraft(run, blob, { queueId: queue.id, intentId: `linked-intent-${run}` }),
      ]);
      const [restored] = await repository.listMediaDrafts();

      expect(restored).toMatchObject({
        queueId: queue.id,
        taskId: `task-${run}`,
        mimeType: 'image/png',
        size: blob.size,
        status: 'awaiting-confirmation',
      });
      expect(new Uint8Array(await restored!.blob.arrayBuffer())).toEqual(content);
    }
  });

  it('enforces media type, single-file, aggregate, and queue-link limits atomically', async () => {
    const repository = new MemoryOfflineCheckInRepository();
    const tiny = new Blob(['x'], { type: 'image/png' });

    await expect(
      repository.saveMediaDrafts([
        mediaDraft(1, tiny, { mimeType: 'application/pdf', name: 'proof.pdf' }),
      ]),
    ).rejects.toMatchObject({ code: 'INVALID_MEDIA_TYPE' });
    await expect(
      repository.saveMediaDrafts([
        mediaDraft(2, tiny, { size: MEDIA_DRAFT_LIMITS.imageBytes + 1 }),
      ]),
    ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    await expect(
      repository.saveMediaDrafts([mediaDraft(3, tiny, { queueId: 'missing-queue' })]),
    ).rejects.toMatchObject({ code: 'INVALID_QUEUE_LINK' });

    const tooMany = Array.from({ length: MEDIA_DRAFT_LIMITS.totalFiles + 1 }, (_, index) =>
      mediaDraft(index + 10, tiny, { intentId: 'one-batch' }),
    );
    await expect(repository.saveMediaDrafts(tooMany)).rejects.toMatchObject({
      code: 'TOTAL_LIMIT_EXCEEDED',
    });
    expect(await repository.listMediaDrafts()).toEqual([]);
  });

  it(`property: atomically claims only the stable first owned record and honors leases ${validatesCriteria(['Requirement 11.3', 'Design Property 8'])}`, async () => {
    for (let run = 0; run < 64; run += 1) {
      const repository = new MemoryOfflineCheckInRepository();
      await repository.enqueueCheckIn(queueRecord(1));
      await repository.enqueueCheckIn(queueRecord(0));
      const now = new Date('2026-08-07T08:00:00.000Z');

      const [first, concurrent] = await Promise.all([
        repository.claimNextCheckIn(
          { familyId: 'family-1', childId: 'child-1' },
          `runner-a-${run}`,
          now,
          30_000,
        ),
        repository.claimNextCheckIn(
          { familyId: 'family-1', childId: 'child-1' },
          `runner-b-${run}`,
          now,
          30_000,
        ),
      ]);

      expect([first?.id, concurrent?.id].filter(Boolean)).toEqual(['queue-0']);
    }
  });

  it('exposes a versioned two-store schema and safely degrades without browser IndexedDB', () => {
    expect(OFFLINE_CHECK_IN_DB).toEqual({
      name: 'familystar-offline',
      version: 2,
      stores: { checkInQueue: 'check-in-queue', mediaDrafts: 'media-drafts' },
    });
    expect(getOfflineCheckInRepository()).toBeNull();
    expect(new OfflineStorageError('QUOTA_EXCEEDED').message).toContain('存储空间不足');
  });

  it(`keeps ownerless v1 records isolated after the v2 ownership migration ${validatesCriteria(['Requirement 11.3', 'Requirement 11.4', 'Design Property 8'])}`, () => {
    for (let run = 0; run < 64; run += 1) {
      const currentOwner = { familyId: `family-${run}`, childId: `child-${run}` };
      expect(isOfflineRecordOwnedBy({}, currentOwner)).toBe(false);
      expect(
        isOfflineRecordOwnedBy(
          { owner: { familyId: `family-${run + 1}`, childId: `child-${run}` } },
          currentOwner,
        ),
      ).toBe(false);
      expect(isOfflineRecordOwnedBy({ owner: currentOwner }, currentOwner)).toBe(true);
    }
  });
});
