import { describe, expect, it, vi } from 'vitest';

import { ChildApiError } from './child-portal';
import type { UploadApi } from './media-upload';
import { createOfflineCheckInRunner, startOfflineCheckInRecovery } from './offline-check-in-runner';
import {
  MemoryOfflineCheckInRepository,
  type NewCheckInQueueRecord,
  type NewMediaDraftRecord,
} from './offline-check-in-repository';

const owner = { familyId: 'family-1', childId: 'child-1' };

function validatesCriteria(criteria: readonly string[]): string {
  return `[validatesCriteria: ${criteria.join(', ')}]`;
}

function apiMock(implementation: (path: string, init?: RequestInit) => Promise<unknown>) {
  const mock = vi.fn(implementation);
  const api: UploadApi = async <T>(path: string, init?: RequestInit) =>
    (await mock(path, init)) as T;
  return { api, mock };
}

function queue(index: number, recordOwner = owner): NewCheckInQueueRecord {
  return {
    id: `queue-${index}`,
    intentId: `intent-${index}`,
    createdAt: new Date(Date.UTC(2026, 7, 7, 0, 0, index)).toISOString(),
    endpoint: '/check-ins',
    taskId: `task-${index}`,
    taskAssignmentId: `assignment-${index}`,
    checkDate: '2026-08-07',
    submissionType: index % 2 === 0 ? 'TICK' : 'TEXT',
    ...(index % 2 === 0 ? {} : { text: `记录 ${index}` }),
    idempotencyKey: `check-in-key-${index}`,
    owner: recordOwner,
  };
}

function draft(index: number, intentId = 'media-intent'): NewMediaDraftRecord {
  const blob = new Blob([`media-${index}`], { type: 'image/png' });
  return {
    id: `draft-${index}`,
    intentId,
    createdAt: new Date(Date.UTC(2026, 7, 7, 1, 0, index)).toISOString(),
    taskId: 'task-media',
    taskAssignmentId: 'assignment-media',
    checkDate: '2026-08-07',
    queueId: null,
    submissionType: 'PHOTO',
    checkInIdempotencyKey: 'check-in-media-key',
    uploadIdempotencyKey: `upload-key-${index}`,
    owner,
    name: `proof-${index}.png`,
    mimeType: 'image/png',
    size: blob.size,
    blob,
  };
}

describe('offline check-in runner', () => {
  it(`property: replays every record in stable order with its original key ${validatesCriteria(['Requirement 11.3', 'Design Property 8'])}`, async () => {
    for (let count = 1; count <= 24; count += 1) {
      const repository = new MemoryOfflineCheckInRepository();
      for (let index = count - 1; index >= 0; index -= 1)
        await repository.enqueueCheckIn(queue(index));
      const calls: string[] = [];
      const { api } = apiMock(async (_path: string, init?: RequestInit) => {
        calls.push(new Headers(init?.headers).get('Idempotency-Key') ?? '');
        return {};
      });

      await createOfflineCheckInRunner({
        repository,
        owner,
        api,
        createRunnerId: () => 'runner-order',
      }).run();

      expect(calls).toEqual(Array.from({ length: count }, (_, index) => `check-in-key-${index}`));
      expect(await repository.listCheckIns()).toEqual([]);
    }
  });

  it('coalesces repeated online events and prevents concurrent runners from double replaying', async () => {
    const repository = new MemoryOfflineCheckInRepository();
    await repository.enqueueCheckIn(queue(1));
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { api, mock: apiCall } = apiMock(async () => pending);
    const first = createOfflineCheckInRunner({
      repository,
      owner,
      api,
      createRunnerId: () => 'runner-a',
    });
    const second = createOfflineCheckInRunner({
      repository,
      owner,
      api,
      createRunnerId: () => 'runner-b',
    });
    const listeners = new Set<EventListenerOrEventListenerObject>();
    const target = {
      addEventListener: (_name: string, listener: EventListenerOrEventListenerObject) =>
        listeners.add(listener),
      removeEventListener: (_name: string, listener: EventListenerOrEventListenerObject) =>
        listeners.delete(listener),
    } as Pick<Window, 'addEventListener' | 'removeEventListener'>;
    const stop = startOfflineCheckInRecovery(first, target, () => true);
    for (const listener of listeners) {
      if (typeof listener === 'function') listener(new Event('online'));
      else listener.handleEvent(new Event('online'));
    }
    const secondRun = second.run();
    await vi.waitFor(() => expect(apiCall).toHaveBeenCalledTimes(1));
    release();
    await Promise.all([first.run(), secondRun]);
    stop();

    expect(apiCall).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
  });

  it.each([
    [409, 'conflict', 'CONFLICT'],
    [400, 'business-failed', 'INVALID_REQUEST'],
  ] as const)(
    'stores HTTP %s as %s and stops the ordered queue',
    async (status, expected, code) => {
      const repository = new MemoryOfflineCheckInRepository();
      await repository.enqueueCheckIn(queue(0));
      await repository.enqueueCheckIn(queue(1));
      const { api, mock: apiCall } = apiMock(async () => {
        throw new ChildApiError('权威状态已变化', status, code, { status: 'APPROVED' });
      });

      await createOfflineCheckInRunner({ repository, owner, api }).run();
      const records = await repository.listCheckIns();

      expect(apiCall).toHaveBeenCalledTimes(1);
      expect(records[0]).toMatchObject({
        status: expected,
        failure: { code, authoritativeState: { status: 'APPROVED' } },
      });
      expect(records[1]?.status).toBe('pending');
    },
  );

  it.each([
    [401, 'AUTH_REQUIRED'],
    [403, 'IDENTITY_FORBIDDEN'],
  ] as const)(
    'pauses on %s and never sends records owned by another family or child',
    async (status, code) => {
      const repository = new MemoryOfflineCheckInRepository();
      await repository.enqueueCheckIn(queue(0));
      await repository.enqueueCheckIn(queue(1, { familyId: 'family-2', childId: 'child-2' }));
      const { api, mock: apiCall } = apiMock(async () => {
        throw new ChildApiError(
          '身份边界已变化',
          status,
          status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
        );
      });

      const runner = createOfflineCheckInRunner({ repository, owner, api });
      await runner.run();
      await runner.run();
      const records = await repository.listCheckIns();

      expect(apiCall).toHaveBeenCalledTimes(1);
      expect(records.find(({ id }) => id === 'queue-0')?.attempt.lastErrorCode).toBe(code);
      expect(records.find(({ id }) => id === 'queue-1')?.attempt.attemptCount).toBe(0);
    },
  );

  it('keeps 5xx pending with backoff and prevents immediate loops', async () => {
    const repository = new MemoryOfflineCheckInRepository();
    await repository.enqueueCheckIn(queue(0));
    const { api, mock: apiCall } = apiMock(async () => {
      throw new ChildApiError('暂时不可用', 503, 'UNAVAILABLE');
    });
    const now = () => new Date('2026-08-07T08:00:00.000Z');
    const runner = createOfflineCheckInRunner({ repository, owner, api, now });

    await runner.run();
    await runner.run();
    const [record] = await repository.listCheckIns();

    expect(apiCall).toHaveBeenCalledTimes(1);
    expect(record).toMatchObject({ status: 'pending', attempt: { lastErrorCode: 'UNAVAILABLE' } });
    expect(record!.attempt.nextAttemptAt).toBe('2026-08-07T08:00:01.000Z');
  });

  it('records a network attempt, stops, and remains manually retryable', async () => {
    const repository = new MemoryOfflineCheckInRepository();
    await repository.enqueueCheckIn(queue(0));
    await repository.enqueueCheckIn(queue(1));
    const { api, mock: apiCall } = apiMock(async () => {
      throw new TypeError('Failed to fetch');
    });

    await createOfflineCheckInRunner({ repository, owner, api }).run();
    const records = await repository.listCheckIns();

    expect(apiCall).toHaveBeenCalledTimes(1);
    expect(records[0]).toMatchObject({
      status: 'pending',
      attempt: { attemptCount: 1, lastErrorCode: 'NETWORK_ERROR' },
    });
    expect(records[1]?.attempt.attemptCount).toBe(0);
  });

  it('uploads media only after confirmation and resumes partial uploads with stable keys', async () => {
    const repository = new MemoryOfflineCheckInRepository();
    await repository.saveMediaDrafts([draft(0), draft(1)]);
    const { api, mock: apiCall } = apiMock(async () => ({}));
    const firstUpload = vi
      .fn()
      .mockResolvedValueOnce('media-0')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const firstRunner = createOfflineCheckInRunner({ repository, owner, api, upload: firstUpload });

    expect(firstUpload).not.toHaveBeenCalled();
    await expect(firstRunner.confirmMediaDrafts('media-intent')).rejects.toBeInstanceOf(TypeError);
    expect((await repository.listMediaDrafts())[0]?.uploadedMediaId).toBe('media-0');

    const retryUpload = vi.fn().mockResolvedValue('media-1');
    await createOfflineCheckInRunner({
      repository,
      owner,
      api,
      upload: retryUpload,
    }).confirmMediaDrafts('media-intent');

    expect(retryUpload).toHaveBeenCalledTimes(1);
    expect(retryUpload).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ idempotencyKey: 'upload-key-1' }),
    );
    expect(apiCall).toHaveBeenCalledWith(
      '/check-ins',
      expect.objectContaining({ headers: { 'Idempotency-Key': 'check-in-media-key' } }),
    );
    expect(await repository.listMediaDrafts()).toEqual([]);
  });
});
