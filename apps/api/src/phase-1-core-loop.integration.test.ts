import type { MediaUploadStatus, RedemptionStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from './app.js';
import type { CheckInOperations, CheckInRecord } from './check-ins/types.js';
import type {
  SubmissionReviewOperations,
  SubmissionReviewRecord,
} from './check-ins/review-types.js';
import type { ChildAccountOperations } from './family-auth/child-service.js';
import type { ChildProfile } from './family-auth/child-types.js';
import type { PasswordHasher } from './family-auth/password.js';
import { FamilyAuthService } from './family-auth/service.js';
import type {
  AuthSession,
  FamilyAuthRepository,
  FamilyInitialization,
  ParentIdentity,
  SessionStore,
} from './family-auth/types.js';
import type { LevelOperations, LevelView } from './levels/types.js';
import type { MediaOperations, MediaUploadSessionRecord } from './media/types.js';
import type { RedemptionRecord, RewardOperations, RewardRecord } from './rewards/types.js';
import type { TaskOperations, TaskRecord } from './tasks/types.js';

const NOW = new Date('2026-07-31T12:00:00.000Z');
const FAMILY_ID = '00000000-0000-4000-8000-000000000101';
const FAMILY_CODE = '654321';
const PARENT_ID = '00000000-0000-4000-8000-000000000102';
const CHILD_ID = '00000000-0000-4000-8000-000000000103';
const TASK_TYPE_ID = '00000000-0000-4000-8000-000000000104';
const TASK_ID = '00000000-0000-4000-8000-000000000105';
const ASSIGNMENT_ID = '00000000-0000-4000-8000-000000000106';
const UPLOAD_ID = '00000000-0000-4000-8000-000000000107';
const MEDIA_ID = '00000000-0000-4000-8000-000000000108';
const CHECK_IN_ID = '00000000-0000-4000-8000-000000000109';
const ATTEMPT_ID = '00000000-0000-4000-8000-000000000110';
const REVIEW_ID = '00000000-0000-4000-8000-000000000111';
const REWARD_ID = '00000000-0000-4000-8000-000000000112';
const FIRST_REDEMPTION_ID = '00000000-0000-4000-8000-000000000113';
const SECOND_REDEMPTION_ID = '00000000-0000-4000-8000-000000000114';
const IMAGE_BYTES = 8;
const IMAGE_CHECKSUM = 'a'.repeat(64);

type ApiSuccess<T> = Readonly<{
  success: true;
  data: T;
  meta: Readonly<{ request_id: string; timestamp: string }>;
}>;

type CoreState = {
  familyCreated: boolean;
  taskTypeIds: string[];
  parent: ParentIdentity | null;
  child: ChildProfile | null;
  childCredential: string | null;
  task: TaskRecord | null;
  upload: MediaUploadSessionRecord | null;
  checkIn: CheckInRecord | null;
  review: SubmissionReviewRecord | null;
  pointsBalance: number;
  pointsEarnedTotal: number;
  streakDays: number;
  currentLevel: number;
  reward: RewardRecord | null;
  redemptions: RedemptionRecord[];
};

class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, AuthSession>();
  private sequence = 0;

  async create(session: AuthSession): Promise<string> {
    this.sequence += 1;
    const token = `core-loop-session-${this.sequence}`;
    this.sessions.set(token, structuredClone(session));
    return token;
  }

  async read(token: string): Promise<AuthSession | null> {
    return this.sessions.get(token) ?? null;
  }

  async revoke(token: string): Promise<void> {
    this.sessions.delete(token);
  }

  async revokeSubject(subjectId: string): Promise<void> {
    for (const [token, session] of this.sessions) {
      if (session.subjectId === subjectId) this.sessions.delete(token);
    }
  }
}

const passwordHasher: PasswordHasher = {
  async hash(value) {
    return `hash:${value}`;
  },
  async verify(value, hash) {
    return hash === `hash:${value}`;
  },
};

class CoreLoopFixture implements FamilyAuthRepository {
  readonly state: CoreState = {
    familyCreated: false,
    taskTypeIds: [],
    parent: null,
    child: null,
    childCredential: null,
    task: null,
    upload: null,
    checkIn: null,
    review: null,
    pointsBalance: 0,
    pointsEarnedTotal: 0,
    streakDays: 0,
    currentLevel: 1,
    reward: null,
    redemptions: [],
  };

  constructor(readonly sessions: MemorySessionStore) {}

  async createFamilyWithParent(input: FamilyInitialization): Promise<ParentIdentity> {
    const parent: ParentIdentity = {
      id: PARENT_ID,
      familyId: FAMILY_ID,
      familyCode: input.familyCode,
      nickname: input.nickname,
      email: input.email,
      passwordHash: input.passwordHash,
    };
    this.state.familyCreated = true;
    this.state.taskTypeIds = [TASK_TYPE_ID];
    this.state.parent = parent;
    return parent;
  }

  async findActiveParentByEmail(email: string): Promise<ParentIdentity | null> {
    return this.state.parent?.email === email ? this.state.parent : null;
  }

  async findActiveFamilyCodeById(familyId: string): Promise<string | null> {
    return familyId === FAMILY_ID && this.state.familyCreated ? FAMILY_CODE : null;
  }

  childOperations(): ChildAccountOperations {
    return {
      list: async ({ sessionToken }) => {
        await this.requireSession(sessionToken, 'parent');
        return { children: this.state.child ? [this.state.child] : [] };
      },
      create: async (input) => {
        await this.requireSession(input.sessionToken, 'parent');
        const child: ChildProfile = {
          id: CHILD_ID,
          familyId: FAMILY_ID,
          nickname: input.nickname,
          credentialType: input.credentialType,
          gender: input.gender,
          birthday: input.birthday ?? null,
          grade: input.grade ?? null,
          avatarMediaId: input.avatarMediaId ?? null,
        };
        this.state.child = child;
        this.state.childCredential = input.credential;
        return { child };
      },
      update: async () => this.unused('update child'),
      remove: async () => this.unused('remove child'),
      listSwitchTargets: async ({ sessionToken }) => {
        await this.requireSession(sessionToken);
        return { children: this.state.child ? [this.state.child] : [] };
      },
      findFamily: async ({ familyCode }) => {
        expect(familyCode).toBe(FAMILY_CODE);
        return {
          family: { name: 'Core Loop Family', familyCode: FAMILY_CODE },
          children: this.state.child
            ? [
                {
                  id: this.state.child.id,
                  nickname: this.state.child.nickname,
                  grade: this.state.child.grade,
                  avatarMediaId: this.state.child.avatarMediaId,
                },
              ]
            : [],
        };
      },
      login: async ({ familyCode, childId, credential }) => {
        expect(familyCode).toBe(FAMILY_CODE);
        const child = this.required(this.state.child, 'child');
        expect(childId).toBe(child.id);
        expect(credential).toBe(this.state.childCredential);
        const sessionToken = await this.sessions.create({
          subjectId: child.id,
          familyId: child.familyId,
          role: 'child',
          issuedAt: NOW.toISOString(),
        });
        return {
          child: {
            id: child.id,
            nickname: child.nickname,
            grade: child.grade,
            avatarMediaId: child.avatarMediaId,
          },
          sessionToken,
        };
      },
      switchToChild: async ({ sessionToken, childId, credential }) => {
        const session = await this.requireSession(sessionToken);
        const child = this.required(this.state.child, 'child');
        expect(session.familyId).toBe(FAMILY_ID);
        expect(childId).toBe(child.id);
        expect(credential).toBe(this.state.childCredential);
        const childSession = await this.sessions.create({
          subjectId: child.id,
          familyId: child.familyId,
          role: 'child',
          issuedAt: NOW.toISOString(),
        });
        return { child, sessionToken: childSession };
      },
      changeOwnPassword: async () => this.unused('change child password'),
    };
  }

  taskOperations(): TaskOperations {
    return {
      list: async ({ sessionToken }) => {
        await this.requireSession(sessionToken, 'parent');
        return { tasks: this.state.task ? [this.state.task] : [] };
      },
      listMine: async ({ sessionToken, date }) => {
        const session = await this.requireSession(sessionToken, 'child');
        const task = this.required(this.state.task, 'task');
        const assignment = task.assignments.find(({ childId }) => childId === session.subjectId);
        return {
          date,
          tasks: assignment
            ? [
                {
                  taskId: task.id,
                  taskAssignmentId: assignment.id,
                  name: task.name,
                  description: task.description,
                  submissionGuide: task.submissionGuide,
                  collaborationMode: task.collaborationMode,
                  frequency: assignment.customFrequency ?? task.frequency,
                  points: assignment.customPoints ?? task.basePoints,
                  checkType: assignment.customCheckType ?? task.checkType,
                  verifyMode: assignment.customVerifyMode ?? task.verifyMode,
                  startDate: assignment.startDate,
                  endDate: assignment.endDate ?? null,
                },
              ]
            : [],
        };
      },
      create: async ({ sessionToken, task: input }) => {
        await this.requireSession(sessionToken, 'parent');
        expect(this.state.taskTypeIds).toContain(input.taskTypeId);
        expect(input.assignments).toHaveLength(1);
        const assignment = this.required(input.assignments[0], 'task assignment');
        const task: TaskRecord = {
          id: TASK_ID,
          familyId: FAMILY_ID,
          taskTypeId: input.taskTypeId,
          name: input.name,
          description: input.description ?? null,
          submissionGuide: input.submissionGuide ?? null,
          checkType: input.checkType,
          verifyMode: input.verifyMode ?? 'AUTO',
          collaborationMode: input.collaborationMode ?? 'SOLO',
          frequency: input.frequency,
          basePoints: input.basePoints,
          status: 'ACTIVE',
          assignments: [{ ...assignment, id: ASSIGNMENT_ID, taskId: TASK_ID }],
        };
        this.state.task = task;
        return { task };
      },
      update: async () => this.unused('update task'),
      setStatus: async () => this.unused('set task status'),
    };
  }

  mediaOperations(): MediaOperations {
    return {
      initialize: async (input) => {
        await this.requireSession(input.sessionToken, 'child');
        expect(input).toMatchObject({
          idempotencyKey: 'core-upload',
          type: 'IMAGE',
          mimeType: 'image/png',
          checksum: IMAGE_CHECKSUM,
          sizeBytes: IMAGE_BYTES,
        });
        const upload: MediaUploadSessionRecord = {
          id: UPLOAD_ID,
          familyId: FAMILY_ID,
          idempotencyKey: input.idempotencyKey,
          uploadId: 'cos-multipart-upload-1',
          status: 'UPLOADING',
          failureCode: null,
          asset: {
            id: MEDIA_ID,
            familyId: FAMILY_ID,
            type: input.type,
            objectKey: `${FAMILY_ID}/core-loop-image`,
            mimeType: input.mimeType,
            checksum: input.checksum,
            sizeBytes: input.sizeBytes,
            duration: null,
            uploadStatus: 'UPLOADING',
          },
          parts: [],
        };
        this.state.upload = upload;
        return { upload };
      },
      authorizePart: async ({ sessionToken, uploadId, partNumber }) => {
        await this.requireSession(sessionToken, 'child');
        expect(uploadId).toBe(UPLOAD_ID);
        expect(partNumber).toBe(1);
        return {
          url: 'https://cos.example.test/multipart/part-1',
          expiresAt: new Date(NOW.getTime() + 15 * 60 * 1000),
        };
      },
      confirmPart: async (input) => {
        await this.requireSession(input.sessionToken, 'child');
        const upload = this.required(this.state.upload, 'upload');
        const updated: MediaUploadSessionRecord = {
          ...upload,
          parts: [
            {
              partNumber: input.partNumber,
              etag: input.etag,
              checksum: input.checksum,
              sizeBytes: input.sizeBytes,
            },
          ],
        };
        this.state.upload = updated;
        return { upload: updated };
      },
      complete: async ({ sessionToken, uploadId }) => {
        await this.requireSession(sessionToken, 'child');
        expect(uploadId).toBe(UPLOAD_ID);
        const upload = this.required(this.state.upload, 'upload');
        expect(upload.parts).toHaveLength(1);
        const status: MediaUploadStatus = 'READY';
        const ready: MediaUploadSessionRecord = {
          ...upload,
          status,
          asset: { ...upload.asset, uploadStatus: status },
        };
        this.state.upload = ready;
        return { upload: ready };
      },
      retry: async () => this.unused('retry upload'),
      accessUrl: async () => this.unused('read media URL'),
    };
  }

  checkInOperations(): CheckInOperations {
    return {
      submit: async (input) => {
        const session = await this.requireSession(input.sessionToken, 'child');
        const task = this.required(this.state.task, 'task');
        const upload = this.required(this.state.upload, 'upload');
        expect(input).toMatchObject({
          assignmentId: ASSIGNMENT_ID,
          idempotencyKey: 'core-check-in',
          checkDate: '2026-07-31',
          content: { mediaIds: [MEDIA_ID] },
        });
        expect(upload.status).toBe('READY');
        const checkIn: CheckInRecord = {
          id: CHECK_IN_ID,
          familyId: FAMILY_ID,
          assignmentId: ASSIGNMENT_ID,
          childId: session.subjectId,
          taskId: task.id,
          checkDate: input.checkDate ?? '2026-07-31',
          isMakeup: false,
          text: input.content.text ?? null,
          mediaIds: input.content.mediaIds,
          status: 'PENDING',
          submittedAt: NOW,
          attempts: [
            {
              id: ATTEMPT_ID,
              attemptNumber: 1,
              idempotencyKey: input.idempotencyKey,
              text: input.content.text ?? null,
              mediaIds: input.content.mediaIds,
              status: 'PENDING',
              submittedAt: NOW,
              priorStatus: null,
              priorReviewerId: null,
              priorReviewedAt: null,
              priorReviewComment: null,
            },
          ],
        };
        this.state.checkIn = checkIn;
        return { checkIn };
      },
      get: async ({ sessionToken }) => {
        await this.requireSession(sessionToken, 'child');
        return { checkIn: this.required(this.state.checkIn, 'check-in') };
      },
      submitCollaboration: async () => this.unused('submit collaboration'),
      listCollaboration: async () => this.unused('list collaboration'),
    };
  }

  reviewOperations(): SubmissionReviewOperations {
    return {
      reviewCheckIn: async (input) => {
        const parent = await this.requireSession(input.sessionToken, 'parent');
        const checkIn = this.required(this.state.checkIn, 'check-in');
        expect(input).toMatchObject({
          checkInId: CHECK_IN_ID,
          idempotencyKey: 'core-review',
          decision: 'APPROVED',
        });
        const review: SubmissionReviewRecord = {
          id: REVIEW_ID,
          familyId: FAMILY_ID,
          targetType: 'CHECK_IN',
          targetId: checkIn.id,
          attemptId: ATTEMPT_ID,
          idempotencyKey: input.idempotencyKey,
          decision: input.decision,
          source: 'PARENT',
          reason: input.reason ?? null,
          reviewerId: parent.subjectId,
          reviewedAt: NOW,
        };
        this.state.checkIn = { ...checkIn, status: 'APPROVED' };
        this.state.review = review;
        this.state.streakDays = 3;
        this.state.pointsBalance += 30;
        this.state.pointsEarnedTotal += 30;
        this.state.currentLevel = 2;
        return { review };
      },
      reviewCollaborationSubmission: async () => this.unused('review collaboration'),
      listCheckInReviews: async ({ sessionToken }) => {
        await this.requireSession(sessionToken, 'parent');
        return { reviews: this.state.review ? [this.state.review] : [] };
      },
      listCollaborationSubmissionReviews: async () => this.unused('list collaboration reviews'),
      listPendingReviews: async () => this.unused('list pending reviews'),
    };
  }

  levelOperations(): LevelOperations {
    return {
      getMe: async ({ sessionToken }) => {
        await this.requireSession(sessionToken, 'child');
        return { level: this.levelView() };
      },
      getChild: async ({ sessionToken, childId }) => {
        await this.requireSession(sessionToken, 'parent');
        expect(childId).toBe(CHILD_ID);
        return { level: this.levelView() };
      },
    };
  }

  rewardOperations(): RewardOperations {
    return {
      listRewards: async ({ sessionToken }) => {
        await this.requireSession(sessionToken);
        return { rewards: this.state.reward ? [this.state.reward] : [] };
      },
      getReward: async ({ sessionToken }) => {
        await this.requireSession(sessionToken);
        return { reward: this.required(this.state.reward, 'reward') };
      },
      createReward: async ({ sessionToken, reward: input }) => {
        await this.requireSession(sessionToken, 'parent');
        const reward: RewardRecord = {
          id: REWARD_ID,
          familyId: FAMILY_ID,
          name: input.name,
          description: input.description ?? null,
          imageMediaId: input.imageMediaId ?? null,
          pointsCost: input.pointsCost,
          type: input.type,
          stockTotal: input.stockTotal ?? null,
          stockReserved: 0,
          stockConsumed: 0,
          prerequisites: input.prerequisites ?? {},
          status: input.status ?? 'ACTIVE',
          createdAt: NOW,
          updatedAt: NOW,
        };
        this.state.reward = reward;
        return { reward };
      },
      updateReward: async () => this.unused('update reward'),
      removeReward: async () => this.unused('remove reward'),
      requestRedemption: async ({ sessionToken, rewardId, idempotencyKey }) => {
        const child = await this.requireSession(sessionToken, 'child');
        const reward = this.required(this.state.reward, 'reward');
        expect(rewardId).toBe(reward.id);
        expect(idempotencyKey).toMatch(/^core-redemption-[12]$/);
        expect(this.state.pointsBalance).toBeGreaterThanOrEqual(reward.pointsCost);
        const id = this.state.redemptions.length === 0 ? FIRST_REDEMPTION_ID : SECOND_REDEMPTION_ID;
        const redemption = this.redemption(id, child.subjectId, 'PENDING');
        this.state.pointsBalance -= reward.pointsCost;
        this.state.reward = { ...reward, stockReserved: reward.stockReserved + 1 };
        this.state.redemptions.push(redemption);
        return { redemption };
      },
      listRedemptions: async ({ sessionToken }) => {
        await this.requireSession(sessionToken);
        return { redemptions: this.state.redemptions };
      },
      approveRedemption: async ({ sessionToken, redemptionId }) => {
        const parent = await this.requireSession(sessionToken, 'parent');
        return {
          redemption: this.updateRedemption(redemptionId, (redemption) => ({
            ...redemption,
            status: 'APPROVED',
            approvedById: parent.subjectId,
            approvedAt: NOW,
            updatedAt: NOW,
          })),
        };
      },
      fulfillRedemption: async ({ sessionToken, redemptionId }) => {
        const parent = await this.requireSession(sessionToken, 'parent');
        const reward = this.required(this.state.reward, 'reward');
        const redemption = this.updateRedemption(redemptionId, (current) => ({
          ...current,
          status: 'FULFILLED',
          fulfilledById: parent.subjectId,
          fulfilledAt: NOW,
          updatedAt: NOW,
        }));
        this.state.reward = {
          ...reward,
          stockReserved: reward.stockReserved - 1,
          stockConsumed: reward.stockConsumed + 1,
        };
        return { redemption };
      },
      rejectRedemption: async ({ sessionToken, redemptionId, reason }) => {
        const parent = await this.requireSession(sessionToken, 'parent');
        const reward = this.required(this.state.reward, 'reward');
        const redemption = this.updateRedemption(redemptionId, (current) => ({
          ...current,
          status: 'REJECTED',
          rejectedById: parent.subjectId,
          rejectedAt: NOW,
          rejectionReason: reason,
          updatedAt: NOW,
        }));
        this.state.pointsBalance += redemption.pointsSpent;
        this.state.reward = { ...reward, stockReserved: reward.stockReserved - 1 };
        return { redemption };
      },
      listWishes: async () => ({ wishes: [] }),
      createWish: async () => this.unused('create wish'),
      cancelWish: async () => this.unused('cancel wish'),
      adoptWish: async () => this.unused('adopt wish'),
    };
  }

  private async requireSession(token?: string, role?: AuthSession['role']): Promise<AuthSession> {
    const session = token ? await this.sessions.read(token) : null;
    if (!session || (role !== undefined && session.role !== role)) {
      throw new Error(`Expected ${role ?? 'family'} session`);
    }
    return session;
  }

  private levelView(): LevelView {
    const levelOne = {
      level: 1,
      name: 'Starter',
      icon: 'star',
      pointsRequired: 0,
      discount: 1,
      autoApproveQuota: 0,
      wishSlots: 1,
      extraDimensions: null,
    } as const;
    const levelTwo = {
      ...levelOne,
      level: 2,
      name: 'Rising Star',
      pointsRequired: 25,
      wishSlots: 2,
    } as const;
    return {
      userId: CHILD_ID,
      pointsEarnedTotal: this.state.pointsEarnedTotal,
      eligibleLevel: this.state.currentLevel,
      current: levelTwo,
      benefits: {
        discount: 1,
        levelAutoApproveQuota: 0,
        effectiveAutoApproveQuota: 0,
        wishSlots: 2,
        extraDimensions: null,
      },
      next: {
        configuration: { ...levelTwo, level: 3, name: 'Explorer', pointsRequired: 100 },
        pointsRemaining: 70,
        progressRatio: 5 / 75,
      },
    };
  }

  private redemption(id: string, childId: string, status: RedemptionStatus): RedemptionRecord {
    const reward = this.required(this.state.reward, 'reward');
    return {
      id,
      familyId: FAMILY_ID,
      rewardId: reward.id,
      childId,
      listedPointsCost: reward.pointsCost,
      discount: 1,
      pointsSpent: reward.pointsCost,
      status,
      isAutoApproved: false,
      approvedById: null,
      approvedAt: null,
      rejectedById: null,
      rejectedAt: null,
      rejectionReason: null,
      fulfilledById: null,
      fulfilledAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
  }

  private updateRedemption(
    id: string,
    update: (redemption: RedemptionRecord) => RedemptionRecord,
  ): RedemptionRecord {
    const index = this.state.redemptions.findIndex((redemption) => redemption.id === id);
    const current = this.required(this.state.redemptions[index], 'redemption');
    const updated = update(current);
    this.state.redemptions[index] = updated;
    return updated;
  }

  private required<Value>(value: Value | null | undefined, name: string): Value {
    if (value === null || value === undefined) throw new Error(`Missing ${name}`);
    return value;
  }

  private unused(operation: string): never {
    throw new Error(`Unexpected operation: ${operation}`);
  }
}

type App = ReturnType<typeof createApp>;

async function request(
  app: App,
  path: string,
  options: Readonly<{
    method?: string;
    cookie?: string;
    idempotencyKey?: string;
    body?: unknown;
  }> = {},
): Promise<Response> {
  const headers = new Headers();
  if (options.cookie) headers.set('cookie', options.cookie);
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  return app.request(path, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

async function success<T>(response: Response, status = 200): Promise<T> {
  expect(response.status).toBe(status);
  const envelope = (await response.json()) as ApiSuccess<T>;
  expect(envelope.success).toBe(true);
  expect(envelope.meta.request_id).toBeTruthy();
  return envelope.data;
}

function cookie(response: Response): string {
  const value = response.headers.get('set-cookie');
  const match = value ? /familystar_session=([^;]+)/.exec(value) : null;
  const token = match?.[1];
  if (!token) throw new Error('Session cookie was not set');
  return `familystar_session=${token}`;
}

describe('Phase 1 core loop HTTP integration', () => {
  beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('completes earning, leveling, fulfillment, and refund through createApp routes', async () => {
    const sessions = new MemorySessionStore();
    const fixture = new CoreLoopFixture(sessions);
    const auth = new FamilyAuthService(
      fixture,
      sessions,
      passwordHasher,
      () => new Date(NOW),
      () => FAMILY_CODE,
    );
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      familyAuthService: auth,
      childAccountService: fixture.childOperations(),
      taskOperations: fixture.taskOperations(),
      mediaOperations: fixture.mediaOperations(),
      checkInOperations: fixture.checkInOperations(),
      submissionReviewOperations: fixture.reviewOperations(),
      levelOperations: fixture.levelOperations(),
      rewardOperations: fixture.rewardOperations(),
      sessionStore: sessions,
    });

    const registrationResponse = await request(app, '/api/v1/auth/parent/register', {
      method: 'POST',
      body: {
        family_name: 'Core Loop Family',
        nickname: 'Parent One',
        email: 'parent@example.com',
        password: 'parent-password-123',
        time_zone: 'Asia/Shanghai',
      },
    });
    const registration = await success<{
      parent: { id: string; familyId: string; familyCode: string; email: string };
    }>(registrationResponse, 201);
    const parentCookie = cookie(registrationResponse);
    expect(registration.parent).toEqual({
      id: PARENT_ID,
      familyId: FAMILY_ID,
      familyCode: FAMILY_CODE,
      nickname: 'Parent One',
      email: 'parent@example.com',
    });
    expect(fixture.state.familyCreated).toBe(true);
    expect(fixture.state.taskTypeIds).toEqual([TASK_TYPE_ID]);

    const childResponse = await request(app, '/api/v1/family/children', {
      method: 'POST',
      cookie: parentCookie,
      body: {
        nickname: 'Child One',
        credential_type: 'pin',
        credential: '1234',
        gender: 'female',
      },
    });
    const child = await success<{ child: { id: string; credentialType: string } }>(
      childResponse,
      201,
    );
    expect(child.child).toMatchObject({ id: CHILD_ID, credentialType: 'pin' });

    const switchResponse = await request(app, '/api/v1/auth/child/switch', {
      method: 'POST',
      cookie: parentCookie,
      body: { child_id: CHILD_ID, credential: '1234' },
    });
    expect(await success<{ child: { id: string } }>(switchResponse)).toEqual({
      child: expect.objectContaining({ id: CHILD_ID }),
    });
    const childCookie = cookie(switchResponse);

    const taskResponse = await request(app, '/api/v1/family/tasks', {
      method: 'POST',
      cookie: parentCookie,
      body: {
        task_type_id: TASK_TYPE_ID,
        name: 'Photo chore',
        submission_guide: 'Upload completion evidence',
        check_type: 'PHOTO',
        verify_mode: 'MANUAL',
        collaboration_mode: 'SOLO',
        frequency: { kind: 'daily' },
        base_points: 20,
        assignments: [{ child_id: CHILD_ID, start_date: '2026-07-31' }],
      },
    });
    const task = await success<{
      task: { id: string; verify_mode: string; assignments: Array<{ id: string }> };
    }>(taskResponse, 201);
    expect(task.task).toMatchObject({
      id: TASK_ID,
      verify_mode: 'MANUAL',
      assignments: [{ id: ASSIGNMENT_ID }],
    });

    const assignedTasks = await success<{
      date: string;
      tasks: Array<{
        task_id: string;
        task_assignment_id: string;
        name: string;
        points: number;
        check_type: string;
      }>;
    }>(
      await request(app, '/api/v1/tasks/me?date=2026-07-31', {
        cookie: childCookie,
      }),
    );
    expect(assignedTasks).toEqual({
      date: '2026-07-31',
      tasks: [
        expect.objectContaining({
          task_id: TASK_ID,
          task_assignment_id: ASSIGNMENT_ID,
          name: 'Photo chore',
          points: 20,
          check_type: 'PHOTO',
        }),
      ],
    });
    const discoveredAssignmentId = assignedTasks.tasks[0]!.task_assignment_id;

    const uploadResponse = await request(app, '/api/v1/media/uploads', {
      method: 'POST',
      cookie: childCookie,
      idempotencyKey: 'core-upload',
      body: {
        type: 'IMAGE',
        mime_type: 'image/png',
        checksum: IMAGE_CHECKSUM,
        size_bytes: IMAGE_BYTES,
      },
    });
    expect(
      await success<{ upload: { id: string; media_id: string; status: string } }>(
        uploadResponse,
        201,
      ),
    ).toMatchObject({ upload: { id: UPLOAD_ID, media_id: MEDIA_ID, status: 'UPLOADING' } });

    const authorization = await success<{ url: string }>(
      await request(app, `/api/v1/media/uploads/${UPLOAD_ID}/parts/1/authorize`, {
        method: 'POST',
        cookie: childCookie,
      }),
    );
    expect(authorization.url).toContain('/multipart/part-1');

    const part = await success<{
      upload: { status: string; parts: Array<{ part_number: number; etag: string }> };
    }>(
      await request(app, `/api/v1/media/uploads/${UPLOAD_ID}/parts/1`, {
        method: 'PUT',
        cookie: childCookie,
        body: {
          etag: 'cos-etag-part-1',
          checksum: IMAGE_CHECKSUM,
          size_bytes: IMAGE_BYTES,
        },
      }),
    );
    expect(part.upload.parts).toEqual([
      {
        part_number: 1,
        etag: 'cos-etag-part-1',
        checksum: IMAGE_CHECKSUM,
        size_bytes: IMAGE_BYTES,
      },
    ]);

    const completed = await success<{ upload: { media_id: string; status: string } }>(
      await request(app, `/api/v1/media/uploads/${UPLOAD_ID}/complete`, {
        method: 'POST',
        cookie: childCookie,
        body: {},
      }),
    );
    expect(completed.upload).toMatchObject({ media_id: MEDIA_ID, status: 'READY' });

    const submitted = await success<{
      check_in: { id: string; status: string; content: { media_ids: string[] } };
    }>(
      await request(app, '/api/v1/check-ins', {
        method: 'POST',
        cookie: childCookie,
        idempotencyKey: 'core-check-in',
        body: {
          task_assignment_id: discoveredAssignmentId,
          check_date: '2026-07-31',
          content: { media_ids: [MEDIA_ID] },
        },
      }),
      201,
    );
    expect(submitted.check_in).toMatchObject({
      id: CHECK_IN_ID,
      status: 'PENDING',
      content: { media_ids: [MEDIA_ID] },
    });

    const reviewed = await success<{
      review: { target_id: string; status: string; source: string };
    }>(
      await request(app, `/api/v1/check-ins/${CHECK_IN_ID}/reviews`, {
        method: 'POST',
        cookie: parentCookie,
        idempotencyKey: 'core-review',
        body: { status: 'APPROVED' },
      }),
    );
    expect(reviewed.review).toEqual(
      expect.objectContaining({ target_id: CHECK_IN_ID, status: 'APPROVED', source: 'PARENT' }),
    );
    expect(fixture.state).toMatchObject({
      pointsBalance: 30,
      pointsEarnedTotal: 30,
      streakDays: 3,
      currentLevel: 2,
    });

    const level = await success<{
      level: { points_earned_total: number; eligible_level: number; current_level: number };
    }>(
      await request(app, `/api/v1/family/children/${CHILD_ID}/level`, {
        cookie: parentCookie,
      }),
    );
    expect(level.level).toMatchObject({
      points_earned_total: 30,
      eligible_level: 2,
      current_level: 2,
    });

    const reward = await success<{
      reward: { id: string; stock_total: number; stock_reserved: number; stock_consumed: number };
    }>(
      await request(app, '/api/v1/rewards', {
        method: 'POST',
        cookie: parentCookie,
        body: {
          name: 'Family movie night',
          points_cost: 10,
          type: 'PRIVILEGE',
          stock_total: 2,
          status: 'ACTIVE',
        },
      }),
      201,
    );
    expect(reward.reward).toMatchObject({
      id: REWARD_ID,
      stock_total: 2,
      stock_reserved: 0,
      stock_consumed: 0,
    });

    const firstRequested = await success<{
      redemption: { id: string; status: string; points_spent: number };
    }>(
      await request(app, `/api/v1/rewards/${REWARD_ID}/redemptions`, {
        method: 'POST',
        cookie: childCookie,
        idempotencyKey: 'core-redemption-1',
      }),
      201,
    );
    expect(firstRequested.redemption).toMatchObject({
      id: FIRST_REDEMPTION_ID,
      status: 'PENDING',
      points_spent: 10,
    });
    expect(fixture.state).toMatchObject({ pointsBalance: 20, pointsEarnedTotal: 30 });
    expect(fixture.state.reward).toMatchObject({ stockReserved: 1, stockConsumed: 0 });

    const approved = await success<{ redemption: { id: string; status: string } }>(
      await request(app, `/api/v1/redemptions/${FIRST_REDEMPTION_ID}/approve`, {
        method: 'POST',
        cookie: parentCookie,
      }),
    );
    expect(approved.redemption).toMatchObject({ id: FIRST_REDEMPTION_ID, status: 'APPROVED' });

    const fulfilled = await success<{ redemption: { id: string; status: string } }>(
      await request(app, `/api/v1/redemptions/${FIRST_REDEMPTION_ID}/fulfill`, {
        method: 'POST',
        cookie: parentCookie,
      }),
    );
    expect(fulfilled.redemption).toMatchObject({ id: FIRST_REDEMPTION_ID, status: 'FULFILLED' });
    expect(fixture.state.reward).toMatchObject({ stockReserved: 0, stockConsumed: 1 });

    const secondRequested = await success<{ redemption: { id: string; status: string } }>(
      await request(app, `/api/v1/rewards/${REWARD_ID}/redemptions`, {
        method: 'POST',
        cookie: childCookie,
        idempotencyKey: 'core-redemption-2',
      }),
      201,
    );
    expect(secondRequested.redemption).toMatchObject({
      id: SECOND_REDEMPTION_ID,
      status: 'PENDING',
    });
    expect(fixture.state).toMatchObject({ pointsBalance: 10, pointsEarnedTotal: 30 });
    expect(fixture.state.reward).toMatchObject({ stockReserved: 1, stockConsumed: 1 });

    const rejected = await success<{
      redemption: { id: string; status: string; rejection_reason: string };
    }>(
      await request(app, `/api/v1/redemptions/${SECOND_REDEMPTION_ID}/reject`, {
        method: 'POST',
        cookie: parentCookie,
        body: { reason: 'Choose another reward' },
      }),
    );
    expect(rejected.redemption).toMatchObject({
      id: SECOND_REDEMPTION_ID,
      status: 'REJECTED',
      rejection_reason: 'Choose another reward',
    });
    expect(fixture.state).toMatchObject({
      pointsBalance: 20,
      pointsEarnedTotal: 30,
      streakDays: 3,
      currentLevel: 2,
    });
    expect(fixture.state.reward).toMatchObject({
      stockTotal: 2,
      stockReserved: 0,
      stockConsumed: 1,
    });
  });
});
