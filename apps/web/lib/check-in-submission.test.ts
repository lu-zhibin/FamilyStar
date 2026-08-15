import { describe, expect, it, vi } from 'vitest';

import {
  createCheckInIntent,
  submitChildCheckIn,
  type SubmitCheckInInput,
} from './check-in-submission';
import type { UploadApi } from './media-upload';
import { MemoryOfflineCheckInRepository } from './offline-check-in-repository';

function intent(fileCount = 0) {
  let sequence = 0;
  return createCheckInIntent(
    fileCount,
    () => `stable-${sequence++}`,
    () => new Date('2026-08-07T08:00:00.000Z'),
  );
}

function input(overrides: Partial<SubmitCheckInInput> = {}): SubmitCheckInInput {
  return {
    intent: intent(),
    taskId: 'task-1',
    taskAssignmentId: 'assignment-1',
    submissionType: 'TEXT',
    text: '完成阅读',
    checkDate: '2026-08-07',
    ...overrides,
  };
}

describe('child check-in submission', () => {
  const owner = { familyId: 'family-1', childId: 'child-1' };

  it('keeps online TICK/TEXT submission on the API path with the first intent key', async () => {
    const apiCall = vi.fn();
    const api: UploadApi = async <T>(path: string, init?: RequestInit) => {
      apiCall(path, init);
      return { check_in: { id: 'check-in-1' } } as T;
    };
    const stableIntent = intent();

    await expect(
      submitChildCheckIn(input({ intent: stableIntent }), {
        repository: new MemoryOfflineCheckInRepository(),
        api,
        online: true,
      }),
    ).resolves.toEqual({ status: 'submitted' });
    expect(apiCall).toHaveBeenCalledWith(
      '/check-ins',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Idempotency-Key': stableIntent.idempotencyKey },
      }),
    );
  });

  it.each([
    ['offline before fetch', false, null],
    ['fetch network failure', true, new TypeError('Failed to fetch')],
  ] as const)(
    'queues TEXT after %s and presents a stable local result',
    async (_, online, failure) => {
      const repository = new MemoryOfflineCheckInRepository();
      const api = failure ? vi.fn().mockRejectedValue(failure) : vi.fn();
      const stableIntent = intent();
      const result = await submitChildCheckIn(input({ intent: stableIntent }), {
        repository,
        owner,
        api,
        online,
        createId: () => 'queue-id',
      });

      expect(result).toEqual({ status: 'queued', queueId: 'queue-id' });
      expect(await repository.listCheckIns()).toEqual([
        expect.objectContaining({
          intentId: stableIntent.id,
          idempotencyKey: stableIntent.idempotencyKey,
          status: 'pending',
          submissionType: 'TEXT',
          text: '完成阅读',
        }),
      ]);
    },
  );

  it('stores an offline media Blob as awaiting confirmation without calling upload or check-in APIs', async () => {
    const repository = new MemoryOfflineCheckInRepository();
    const file = new File(['photo-bytes'], 'proof.png', { type: 'image/png' });
    const api = vi.fn();
    const upload = vi.fn();

    const result = await submitChildCheckIn(
      {
        intent: intent(1),
        taskId: 'task-1',
        taskAssignmentId: 'assignment-1',
        submissionType: 'PHOTO',
        checkDate: '2026-08-07',
        files: [file],
      },
      { repository, api, upload, online: false, createId: () => 'draft-id', owner },
    );

    expect(result).toEqual({ status: 'media-drafted', draftIds: ['draft-id'] });
    expect(api).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    const [draft] = await repository.listMediaDrafts();
    expect(draft).toMatchObject({
      name: 'proof.png',
      mimeType: 'image/png',
      taskId: 'task-1',
      queueId: null,
      status: 'awaiting-confirmation',
    });
    expect(await draft?.blob.text()).toBe('photo-bytes');
  });

  it('fails explicitly when offline persistence is unavailable', async () => {
    await expect(
      submitChildCheckIn(input(), { repository: null, online: false, owner }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED' });
  });
});
