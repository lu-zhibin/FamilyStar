import { describe, expect, it, vi } from 'vitest';

import { createRedisKeyspace } from '../infrastructure/redis/keys.js';
import type { RedisCommandPort } from '../infrastructure/redis/primitives.js';
import { SubmissionReviewTimeoutService } from './review-timeout-service.js';
import type {
  PendingReviewCandidate,
  SubmissionReviewRecord,
  SubmissionReviewTimeoutRepository,
} from './review-types.js';

const now = new Date('2026-07-31T12:00:00.000Z');

function candidate(overrides: Partial<PendingReviewCandidate> = {}): PendingReviewCandidate {
  return {
    familyId: 'family-1',
    familySettings: { reviewTimeoutHours: 48 },
    targetType: 'CHECK_IN',
    targetId: 'check-in-1',
    attemptId: 'attempt-1',
    submittedAt: new Date('2026-07-29T12:00:00.000Z'),
    ...overrides,
  };
}

function review(value: PendingReviewCandidate): SubmissionReviewRecord {
  return {
    id: 'review-1',
    familyId: value.familyId,
    targetType: value.targetType,
    targetId: value.targetId,
    attemptId: value.attemptId,
    idempotencyKey: `timeout:${value.targetType}:${value.attemptId}`,
    decision: 'APPROVED',
    source: 'TIMEOUT',
    reason: null,
    reviewerId: null,
    reviewedAt: now,
  };
}

function dependencies(candidates: readonly PendingReviewCandidate[]) {
  const repository: SubmissionReviewTimeoutRepository = {
    listPendingReviewCandidates: vi.fn().mockResolvedValue(candidates),
    approveTimedOutSubmission: vi.fn(async ({ candidate: value }) => review(value)),
  };
  const redis: RedisCommandPort = {
    sendCommand: vi.fn(async (arguments_) => (arguments_[0] === 'SET' ? 'OK' : 1)),
  };
  return { repository, redis };
}

function service(values: ReturnType<typeof dependencies>, options: { batchSize?: number } = {}) {
  return new SubmissionReviewTimeoutService({
    ...values,
    keys: createRedisKeyspace('test'),
    now: () => now,
    ownerTokenFactory: () => 'owner-1',
    ...options,
  });
}

describe('SubmissionReviewTimeoutService', () => {
  it('approves a submission exactly at its 48-hour boundary', async () => {
    const value = candidate();
    const values = dependencies([value]);

    await expect(service(values).runBatch()).resolves.toEqual({
      scanned: 1,
      approved: 1,
      skipped: 0,
    });
    expect(values.repository.approveTimedOutSubmission).toHaveBeenCalledWith({
      candidate: value,
      idempotencyKey: 'timeout:CHECK_IN:attempt-1',
      reviewedAt: now,
    });
  });

  it('uses each family timeout and skips disabled or unexpired candidates', async () => {
    const disabled = candidate({
      targetId: 'disabled',
      attemptId: 'attempt-disabled',
      familySettings: { reviewTimeoutHours: 0 },
      submittedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const unexpired = candidate({
      targetId: 'unexpired',
      attemptId: 'attempt-unexpired',
      familySettings: { reviewTimeoutHours: 49 },
    });
    const values = dependencies([disabled, unexpired]);

    await expect(service(values).runBatch()).resolves.toEqual({
      scanned: 2,
      approved: 0,
      skipped: 2,
    });
    expect(values.repository.approveTimedOutSubmission).not.toHaveBeenCalled();
    expect(values.redis.sendCommand).not.toHaveBeenCalled();
  });

  it('supports collaboration submissions with the same target lock', async () => {
    const value = candidate({
      targetType: 'COLLABORATION_SUBMISSION',
      targetId: 'submission-1',
    });
    const values = dependencies([value]);

    await service(values).runBatch();

    expect(values.redis.sendCommand).toHaveBeenNthCalledWith(1, [
      'SET',
      'test:review-lock:COLLABORATION_SUBMISSION:submission-1',
      'owner-1',
      'PX',
      '10000',
      'NX',
    ]);
  });

  it('safely skips parent lock contention and repository conflicts', async () => {
    const lockConflict = dependencies([candidate()]);
    vi.mocked(lockConflict.redis.sendCommand).mockResolvedValue(null);
    await expect(service(lockConflict).runBatch()).resolves.toEqual({
      scanned: 1,
      approved: 0,
      skipped: 1,
    });

    const stateConflict = dependencies([candidate()]);
    vi.mocked(stateConflict.repository.approveTimedOutSubmission).mockResolvedValue(null);
    await expect(service(stateConflict).runBatch()).resolves.toEqual({
      scanned: 1,
      approved: 0,
      skipped: 1,
    });
  });

  it('treats a repeated deterministic approval as skipped', async () => {
    const values = dependencies([candidate()]);
    vi.mocked(values.repository.approveTimedOutSubmission)
      .mockResolvedValueOnce(review(candidate()))
      .mockResolvedValueOnce(null);

    await expect(service(values).runBatch()).resolves.toMatchObject({ approved: 1 });
    await expect(service(values).runBatch()).resolves.toEqual({
      scanned: 1,
      approved: 0,
      skipped: 1,
    });
    expect(values.repository.approveTimedOutSubmission).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ idempotencyKey: 'timeout:CHECK_IN:attempt-1' }),
    );
  });

  it('requests only one bounded batch', async () => {
    const values = dependencies([]);

    await service(values, { batchSize: 25 }).runBatch();

    expect(values.repository.listPendingReviewCandidates).toHaveBeenCalledTimes(1);
    expect(values.repository.listPendingReviewCandidates).toHaveBeenCalledWith(25);
  });

  it('property: approves every positive timeout exactly at its boundary', async () => {
    const candidates = Array.from({ length: 72 }, (_, index) => {
      const timeoutHours = index + 1;
      return candidate({
        targetId: `check-in-${timeoutHours}`,
        attemptId: `attempt-${timeoutHours}`,
        familySettings: { reviewTimeoutHours: timeoutHours },
        submittedAt: new Date(now.getTime() - timeoutHours * 60 * 60 * 1000),
      });
    });
    const values = dependencies(candidates);

    await expect(service(values, { batchSize: candidates.length }).runBatch()).resolves.toEqual({
      scanned: candidates.length,
      approved: candidates.length,
      skipped: 0,
    });
    expect(values.repository.approveTimedOutSubmission).toHaveBeenCalledTimes(candidates.length);
  });

  it('property: keeps every positive timeout pending one millisecond before its boundary', async () => {
    const candidates = Array.from({ length: 72 }, (_, index) => {
      const timeoutHours = index + 1;
      return candidate({
        targetId: `check-in-${timeoutHours}`,
        attemptId: `attempt-${timeoutHours}`,
        familySettings: { reviewTimeoutHours: timeoutHours },
        submittedAt: new Date(now.getTime() - timeoutHours * 60 * 60 * 1000 + 1),
      });
    });
    const values = dependencies(candidates);

    await expect(service(values, { batchSize: candidates.length }).runBatch()).resolves.toEqual({
      scanned: candidates.length,
      approved: 0,
      skipped: candidates.length,
    });
    expect(values.repository.approveTimedOutSubmission).not.toHaveBeenCalled();
  });
});
