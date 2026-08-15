import { describe, expect, it } from 'vitest';

import type { MediaAssetRecord } from '../media/types.js';
import type {
  CheckInRecord,
  CheckInRepository,
  CollaborationRoundContext,
  CollaborationSubmissionRecord,
  SoloAssignmentContext,
  SubmissionAttemptRecord,
} from './types.js';
import {
  CheckInError,
  CheckInService,
  isCollaborationRoundComplete,
  resolveCheckInEligibility,
} from './service.js';

const familyId = 'family-1';
const now = new Date('2026-07-31T12:00:00.000Z');

function assignment(overrides: Partial<SoloAssignmentContext> = {}): SoloAssignmentContext {
  return {
    assignmentId: 'assignment-1',
    familyId,
    childId: 'child-1',
    taskId: 'task-1',
    taskStatus: 'ACTIVE',
    collaborationMode: 'SOLO',
    checkType: 'TICK',
    verifyMode: 'MANUAL',
    rewardPoints: 10,
    frequency: { kind: 'daily' },
    startDate: '2026-07-01',
    endDate: null,
    settings: {
      timeZone: 'UTC',
      checkInDeadline: '23:59',
      makeupDays: 3,
      reviewTimeoutHours: 48,
      autoApproveQuota: 0,
      streakMultipliers: [],
    },
    ...overrides,
  };
}

function attempt(input: {
  number: number;
  key: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submittedAt: Date;
  priorStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
}): SubmissionAttemptRecord {
  return {
    id: `attempt-${input.number}`,
    attemptNumber: input.number,
    idempotencyKey: input.key,
    text: null,
    mediaIds: [],
    status: input.status,
    submittedAt: input.submittedAt,
    priorStatus: input.priorStatus ?? null,
    priorReviewerId: input.priorStatus ? 'parent-1' : null,
    priorReviewedAt: input.priorStatus ? new Date('2026-07-31T11:00:00Z') : null,
    priorReviewComment: input.priorStatus ? 'Try again' : null,
  };
}

class MemoryCheckInRepository implements CheckInRepository {
  context = assignment();
  current: CheckInRecord | null = null;
  readonly keys = new Map<string, CheckInRecord>();
  readonly media = new Map<string, MediaAssetRecord>();
  roundStatus: 'PENDING' | 'ACTIVE' | 'COMPLETED' = 'PENDING';
  readonly collaboration = new Map<string, CollaborationSubmissionRecord>();
  readonly collaborationKeys = new Map<string, CollaborationSubmissionRecord>();
  collaborationVerifyMode: 'AUTO' | 'MANUAL' = 'MANUAL';

  async findSoloAssignment(scope: string, childId: string, assignmentId: string) {
    return scope === familyId &&
      childId === this.context.childId &&
      assignmentId === this.context.assignmentId
      ? this.context
      : null;
  }

  async findReadyMedia(scope: string, mediaIds: readonly string[]) {
    return mediaIds
      .map((id) => this.media.get(id))
      .filter((value): value is MediaAssetRecord =>
        Boolean(value && value.familyId === scope && value.uploadStatus === 'READY'),
      );
  }

  async findCheckInByIdempotencyKey(scope: string, key: string) {
    return scope === familyId ? (this.keys.get(key) ?? null) : null;
  }

  async findCheckIn(scope: string, childId: string, id: string) {
    return this.current?.familyId === scope &&
      this.current.childId === childId &&
      this.current.id === id
      ? this.current
      : null;
  }

  async submitSolo(input: Parameters<CheckInRepository['submitSolo']>[0]) {
    const duplicate = this.keys.get(input.idempotencyKey);
    if (duplicate) return duplicate;
    if (this.current && this.current.status !== 'REJECTED') throw new Error('conflict');
    const attempts = [
      ...(this.current?.attempts ?? []),
      attempt({
        number: (this.current?.attempts.length ?? 0) + 1,
        key: input.idempotencyKey,
        status: input.status,
        submittedAt: input.submittedAt,
        ...(this.current ? { priorStatus: this.current.status } : {}),
      }),
    ];
    this.current = {
      id: this.current?.id ?? 'check-in-1',
      familyId,
      assignmentId: input.context.assignmentId,
      childId: input.context.childId,
      taskId: input.context.taskId,
      checkDate: input.checkDate,
      isMakeup: input.isMakeup,
      text: input.text ?? null,
      mediaIds: input.mediaIds,
      status: input.status,
      submittedAt: input.submittedAt,
      attempts,
    };
    this.keys.set(input.idempotencyKey, this.current);
    return this.current;
  }

  async findRound(
    scope: string,
    childId: string,
    roundId: string,
  ): Promise<CollaborationRoundContext | null> {
    if (scope !== familyId || roundId !== 'round-1') return null;
    return {
      id: roundId,
      familyId,
      status: this.roundStatus,
      startDate: '2026-07-31',
      endDate: '2026-07-31',
      checkType: 'TICK',
      verifyMode: this.collaborationVerifyMode,
      childIsActiveParticipant: childId === 'child-1' || childId === 'child-2',
      participants: ['child-1', 'child-2'].map((id) => ({
        childId: id,
        active: true,
        submissionStatus: this.collaboration.get(id)?.status ?? null,
      })),
    };
  }

  async findCollaborationByIdempotencyKey(scope: string, key: string) {
    return scope === familyId ? (this.collaborationKeys.get(key) ?? null) : null;
  }

  async submitCollaboration(input: Parameters<CheckInRepository['submitCollaboration']>[0]) {
    const duplicate = this.collaborationKeys.get(input.idempotencyKey);
    if (duplicate) return duplicate;
    const current = this.collaboration.get(input.childId);
    if (current && current.status !== 'REJECTED') throw new Error('conflict');
    const submission: CollaborationSubmissionRecord = {
      id: current?.id ?? `submission-${input.childId}`,
      familyId,
      roundId: input.context.id,
      childId: input.childId,
      text: input.text ?? null,
      mediaIds: input.mediaIds,
      status: input.status,
      submittedAt: input.submittedAt,
      attempts: [
        ...(current?.attempts ?? []),
        attempt({
          number: (current?.attempts.length ?? 0) + 1,
          key: input.idempotencyKey,
          status: input.status,
          submittedAt: input.submittedAt,
          ...(current ? { priorStatus: current.status } : {}),
        }),
      ],
    };
    this.collaboration.set(input.childId, submission);
    this.collaborationKeys.set(input.idempotencyKey, submission);
    if (['child-1', 'child-2'].every((id) => this.collaboration.has(id)))
      this.roundStatus = 'ACTIVE';
    return submission;
  }

  async listCollaborationSubmissions(scope: string, _childId: string, roundId: string) {
    return scope === familyId && roundId === 'round-1' ? [...this.collaboration.values()] : [];
  }

  rejectCurrent(): void {
    if (!this.current) throw new Error('missing current');
    this.current = { ...this.current, status: 'REJECTED' };
  }

  approveCollaboration(childId: string): void {
    const current = this.collaboration.get(childId);
    if (!current) throw new Error('missing submission');
    this.collaboration.set(childId, { ...current, status: 'APPROVED' });
  }
}

function fixture() {
  const repository = new MemoryCheckInRepository();
  const service = new CheckInService({
    repository,
    sessions: {
      async create() {
        return 'unused';
      },
      async read(token: string) {
        const childId =
          token === 'child-1-token' ? 'child-1' : token === 'child-2-token' ? 'child-2' : null;
        return childId
          ? { subjectId: childId, familyId, role: 'child' as const, issuedAt: now.toISOString() }
          : null;
      },
      async revoke() {},
      async revokeSubject() {},
    },
    now: () => now,
  });
  return { repository, service };
}

describe('CheckInService solo submissions', () => {
  it('uses assignment AUTO and MANUAL overrides', async () => {
    const manual = fixture();
    const pending = await manual.service.submit({
      sessionToken: 'child-1-token',
      assignmentId: 'assignment-1',
      idempotencyKey: 'manual',
      content: { mediaIds: [] },
    });
    expect(pending.checkIn.status).toBe('PENDING');

    const automatic = fixture();
    automatic.repository.context = assignment({ verifyMode: 'AUTO' });
    const approved = await automatic.service.submit({
      sessionToken: 'child-1-token',
      assignmentId: 'assignment-1',
      idempotencyKey: 'auto',
      content: { mediaIds: [] },
    });
    expect(approved.checkIn.status).toBe('APPROVED');
  });

  it('returns the current result for a repeated idempotency key and conflicts on another key', async () => {
    const { service } = fixture();
    const input = {
      sessionToken: 'child-1-token',
      assignmentId: 'assignment-1',
      idempotencyKey: 'same-key',
      content: { mediaIds: [] },
    };
    const first = await service.submit(input);
    const duplicate = await service.submit(input);
    expect(duplicate.checkIn.id).toBe(first.checkIn.id);
    await expect(service.submit({ ...input, idempotencyKey: 'new-key' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('keeps immutable history when a rejected check-in is resubmitted', async () => {
    const { repository, service } = fixture();
    await service.submit({
      sessionToken: 'child-1-token',
      assignmentId: 'assignment-1',
      idempotencyKey: 'first',
      content: { mediaIds: [] },
    });
    repository.rejectCurrent();
    const resubmitted = await service.submit({
      sessionToken: 'child-1-token',
      assignmentId: 'assignment-1',
      idempotencyKey: 'second',
      content: { mediaIds: [] },
    });
    expect(resubmitted.checkIn.attempts).toHaveLength(2);
    expect(resubmitted.checkIn.attempts[1]).toMatchObject({
      priorStatus: 'REJECTED',
      priorReviewerId: 'parent-1',
      priorReviewComment: 'Try again',
    });
  });

  it('enforces explicit-date makeup windows and makeupDays zero', () => {
    expect(resolveCheckInEligibility(assignment(), '2026-07-30', now)).toEqual({ isMakeup: true });
    expect(() =>
      resolveCheckInEligibility(
        assignment({ settings: { ...assignment().settings, makeupDays: 0 } }),
        '2026-07-30',
        now,
      ),
    ).toThrow(CheckInError);
    expect(() => resolveCheckInEligibility(assignment(), '2026-08-01', now)).toThrow(CheckInError);
    expect(() =>
      resolveCheckInEligibility(
        assignment({ frequency: { kind: 'weekdays', weekdays: [1] } }),
        '2026-07-31',
        now,
      ),
    ).toThrow(CheckInError);
    expect(() =>
      resolveCheckInEligibility(
        assignment({ settings: { ...assignment().settings, checkInDeadline: '11:59' } }),
        '2026-07-31',
        now,
      ),
    ).toThrow(CheckInError);
  });

  it('rejects cross-family or non-ready media references', async () => {
    const { repository, service } = fixture();
    repository.context = assignment({ checkType: 'PHOTO' });
    repository.media.set('foreign', {
      id: 'foreign',
      familyId: 'family-2',
      type: 'IMAGE',
      objectKey: 'foreign',
      mimeType: 'image/jpeg',
      checksum: 'a'.repeat(64),
      sizeBytes: 10,
      duration: null,
      uploadStatus: 'READY',
    });
    await expect(
      service.submit({
        sessionToken: 'child-1-token',
        assignmentId: 'assignment-1',
        idempotencyKey: 'foreign-media',
        content: { mediaIds: ['foreign'] },
      }),
    ).rejects.toMatchObject({ code: 'INVALID' });
  });
});

describe('CheckInService collaboration submissions', () => {
  it('submits an AUTO collaboration attempt directly as approved', async () => {
    const { repository, service } = fixture();
    repository.collaborationVerifyMode = 'AUTO';

    const result = await service.submitCollaboration({
      sessionToken: 'child-1-token',
      roundId: 'round-1',
      idempotencyKey: 'automatic',
      content: { mediaIds: [] },
    });

    expect(result.submission.status).toBe('APPROVED');
    expect(result.submission.attempts[0]?.status).toBe('APPROVED');
  });

  it('moves to active after all snapshot participants submit', async () => {
    const { repository, service } = fixture();
    await service.submitCollaboration({
      sessionToken: 'child-1-token',
      roundId: 'round-1',
      idempotencyKey: 'child-1',
      content: { mediaIds: [] },
    });
    expect(repository.roundStatus).toBe('PENDING');
    await service.submitCollaboration({
      sessionToken: 'child-2-token',
      roundId: 'round-1',
      idempotencyKey: 'child-2',
      content: { mediaIds: [] },
    });
    expect(repository.roundStatus).toBe('ACTIVE');
    await expect(
      service.listCollaboration({ sessionToken: 'child-1-token', roundId: 'round-1' }),
    ).resolves.toMatchObject({ submissions: [{ childId: 'child-1' }, { childId: 'child-2' }] });
  });

  it('preserves approved participants and completes only when every active participant is approved', async () => {
    const { repository, service } = fixture();
    for (const childId of ['child-1', 'child-2']) {
      await service.submitCollaboration({
        sessionToken: `${childId}-token`,
        roundId: 'round-1',
        idempotencyKey: childId,
        content: { mediaIds: [] },
      });
    }
    repository.approveCollaboration('child-1');
    await expect(
      service.submitCollaboration({
        sessionToken: 'child-1-token',
        roundId: 'round-1',
        idempotencyKey: 'approved-resubmit',
        content: { mediaIds: [] },
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(
      isCollaborationRoundComplete([
        { childId: 'child-1', active: true, submissionStatus: 'APPROVED' },
        { childId: 'child-2', active: true, submissionStatus: 'PENDING' },
      ]),
    ).toBe(false);
    expect(
      isCollaborationRoundComplete([
        { childId: 'child-1', active: true, submissionStatus: 'APPROVED' },
        { childId: 'child-2', active: true, submissionStatus: 'APPROVED' },
        { childId: 'removed', active: false, submissionStatus: null },
      ]),
    ).toBe(true);
  });
});
