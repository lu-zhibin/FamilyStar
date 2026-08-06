import type { DomainEvent } from '@familystar/shared';
import { createDomainEvent } from '@familystar/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { CheckInService } from './check-ins/service.js';
import type {
  CheckInRecord,
  CheckInRepository,
  CollaborationRoundContext,
  CollaborationSubmissionRecord,
  SoloAssignmentContext,
} from './check-ins/types.js';
import type { AuthSession, SessionStore } from './family-auth/types.js';
import { requestContext } from './http/request-context.js';
import type { AppEnvironment } from './http/types.js';
import {
  OutboxDispatcher,
  type ClaimOutboxOptions,
  type OutboxRepository,
  type OutboxWriter,
} from './events/outbox.js';
import { PrismaPointsTransactionWriter } from './points/prisma-writer.js';
import type { PointsLogRecord } from './points/types.js';
import { RewardAccessError, RewardEligibilityError, RewardService } from './rewards/service.js';
import type {
  RedemptionRecord,
  RewardInput,
  RewardPatch,
  RewardRecord,
  RewardRepository,
  WishRecord,
} from './rewards/types.js';
import { createSecurityMiddleware } from './security/middleware.js';
import { CollaborationScheduler } from './tasks/collaboration-scheduler.js';
import type {
  CollaborationRoundRecord,
  CollaborationSchedulerRepository,
  TaskRecord,
} from './tasks/types.js';

const NOW = new Date('2026-07-31T12:00:00.000Z');
const FAMILY_A = '10000000-0000-4000-8000-000000000001';
const FAMILY_B = '10000000-0000-4000-8000-000000000002';
const CHILD_A = '20000000-0000-4000-8000-000000000001';
const CHILD_B = '20000000-0000-4000-8000-000000000002';
const PARENT_A = '30000000-0000-4000-8000-000000000001';
const REWARD_ID = '40000000-0000-4000-8000-000000000001';

class MemorySessions implements SessionStore {
  private readonly sessions = new Map<string, AuthSession>();

  set(token: string, session: AuthSession): void {
    this.sessions.set(token, session);
  }

  async create(session: AuthSession): Promise<string> {
    const token = `session-${this.sessions.size + 1}`;
    this.sessions.set(token, session);
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

function childSession(familyId: string, subjectId: string): AuthSession {
  return { familyId, subjectId, role: 'child', issuedAt: NOW.toISOString() };
}

function parentSession(familyId: string, subjectId: string): AuthSession {
  return { familyId, subjectId, role: 'parent', issuedAt: NOW.toISOString() };
}

class MemoryCheckIns implements CheckInRepository {
  readonly records = new Map<string, CheckInRecord>();
  soloWrites = 0;

  constructor(private readonly context: SoloAssignmentContext) {}

  async findSoloAssignment(
    familyId: string,
    childId: string,
    assignmentId: string,
  ): Promise<SoloAssignmentContext | null> {
    return familyId === this.context.familyId &&
      childId === this.context.childId &&
      assignmentId === this.context.assignmentId
      ? this.context
      : null;
  }

  async findReadyMedia(): Promise<[]> {
    return [];
  }

  async findCheckInByIdempotencyKey(
    familyId: string,
    idempotencyKey: string,
  ): Promise<CheckInRecord | null> {
    return this.records.get(`${familyId}:${idempotencyKey}`) ?? null;
  }

  async findCheckIn(
    familyId: string,
    childId: string,
    checkInId: string,
  ): Promise<CheckInRecord | null> {
    return (
      [...this.records.values()].find(
        (record) =>
          record.familyId === familyId && record.childId === childId && record.id === checkInId,
      ) ?? null
    );
  }

  async submitSolo(input: Parameters<CheckInRepository['submitSolo']>[0]): Promise<CheckInRecord> {
    await Promise.resolve();
    const key = `${input.context.familyId}:${input.idempotencyKey}`;
    const repeated = this.records.get(key);
    if (repeated) return repeated;
    const record: CheckInRecord = {
      id: 'check-in-1',
      familyId: input.context.familyId,
      assignmentId: input.context.assignmentId,
      childId: input.context.childId,
      taskId: input.context.taskId,
      checkDate: input.checkDate,
      isMakeup: input.isMakeup,
      text: input.text ?? null,
      mediaIds: input.mediaIds,
      status: input.status,
      submittedAt: input.submittedAt,
      attempts: [],
    };
    this.records.set(key, record);
    this.soloWrites += 1;
    return record;
  }

  async findRound(): Promise<CollaborationRoundContext | null> {
    return null;
  }

  async findCollaborationByIdempotencyKey(): Promise<CollaborationSubmissionRecord | null> {
    return null;
  }

  async submitCollaboration(): Promise<CollaborationSubmissionRecord> {
    throw new Error('Collaboration is outside this fixture.');
  }

  async listCollaborationSubmissions(): Promise<[]> {
    return [];
  }
}

function collaborationTask(): TaskRecord {
  return {
    id: 'task-1',
    familyId: FAMILY_A,
    taskTypeId: 'type-1',
    name: '协作任务',
    description: null,
    submissionGuide: null,
    checkType: 'TICK',
    verifyMode: 'AUTO',
    collaborationMode: 'COLLAB',
    frequency: { kind: 'daily' },
    basePoints: 10,
    status: 'ACTIVE',
    assignments: [
      { id: 'assignment-1', taskId: 'task-1', childId: CHILD_A, startDate: '2026-07-01' },
      { id: 'assignment-2', taskId: 'task-1', childId: CHILD_B, startDate: '2026-07-01' },
    ],
  };
}

class MemoryRounds implements CollaborationSchedulerRepository {
  readonly rounds = new Map<string, CollaborationRoundRecord>();
  createEffects = 0;

  async listDueCollaborationTasks(): Promise<readonly TaskRecord[]> {
    return [collaborationTask()];
  }

  async findRound(taskId: string, startDate: string): Promise<CollaborationRoundRecord | null> {
    return this.rounds.get(`${taskId}:${startDate}`) ?? null;
  }

  async createRound(
    input: Parameters<CollaborationSchedulerRepository['createRound']>[0],
  ): Promise<CollaborationRoundRecord> {
    await Promise.resolve();
    const key = `${input.task.id}:${input.startDate}`;
    const repeated = this.rounds.get(key);
    if (repeated) return repeated;
    const round: CollaborationRoundRecord = {
      id: 'round-1',
      taskId: input.task.id,
      familyId: input.task.familyId,
      roundNumber: input.roundNumber,
      startDate: input.startDate,
      endDate: input.endDate,
      status: 'ACTIVE',
      participants: input.task.assignments.map((assignment) => ({
        childId: assignment.childId,
        rewardPointsSnapshot: assignment.customPoints ?? input.task.basePoints,
      })),
    };
    this.rounds.set(key, round);
    this.createEffects += 1;
    return round;
  }
}

type MemoryOutboxRecord = {
  event: DomainEvent;
  attempts: number;
  availableAt: Date;
  publishedAt: Date | null;
  owner: string | null;
};

class MemoryOutbox implements OutboxRepository {
  constructor(readonly record: MemoryOutboxRecord) {}

  async claimBatch(options: ClaimOutboxOptions) {
    if (
      this.record.publishedAt !== null ||
      this.record.owner !== null ||
      this.record.availableAt > options.now
    ) {
      return [];
    }
    this.record.owner = options.workerId;
    this.record.attempts += 1;
    return [{ event: this.record.event, attempts: this.record.attempts }];
  }

  async markPublished(eventId: string, workerId: string, publishedAt: Date): Promise<void> {
    if (eventId !== this.record.event.event_id || workerId !== this.record.owner) {
      throw new Error('Outbox lease mismatch.');
    }
    this.record.publishedAt = publishedAt;
    this.record.owner = null;
  }

  async reschedule(eventId: string, workerId: string, availableAt: Date): Promise<void> {
    if (eventId !== this.record.event.event_id || workerId !== this.record.owner) {
      throw new Error('Outbox lease mismatch.');
    }
    this.record.availableAt = availableAt;
    this.record.owner = null;
  }
}

type MemoryPointsState = {
  balance: number;
  earnedTotal: number;
  version: number;
  snapshotWrites: number;
  logs: PointsLogRecord[];
  events: DomainEvent[];
};

function clonePointsState(state: MemoryPointsState): MemoryPointsState {
  return {
    ...state,
    logs: [...state.logs],
    events: [...state.events],
  };
}

type PointsLogCreateInput = {
  data: {
    familyId: string;
    userId: string;
    type: 'EARN';
    businessType: string;
    businessId: string;
    delta: number;
    balanceBefore: number;
    balanceAfter: number;
    earnedTotalAfter: number;
  };
};

class MemoryPointsDatabase {
  readonly transactionStates = new WeakMap<object, MemoryPointsState>();
  readonly client: PrismaClient;

  constructor(
    readonly state: MemoryPointsState,
    private conflictsRemaining: number,
  ) {
    this.client = {
      $transaction: <Result>(
        operation: (transaction: Prisma.TransactionClient) => Promise<Result>,
      ) => this.transaction(operation),
      pointsLog: {
        findUnique: async () => this.state.logs[0] ?? null,
      },
    } as unknown as PrismaClient;
  }

  private async transaction<Result>(
    operation: (transaction: Prisma.TransactionClient) => Promise<Result>,
  ): Promise<Result> {
    const draft = clonePointsState(this.state);
    const transaction = this.createTransaction(draft);
    this.transactionStates.set(transaction, draft);
    const result = await operation(transaction);
    Object.assign(this.state, draft);
    return result;
  }

  private createTransaction(draft: MemoryPointsState): Prisma.TransactionClient {
    return {
      pointsLog: {
        findUnique: async () => draft.logs[0] ?? null,
        create: async ({ data }: PointsLogCreateInput) => {
          const value: PointsLogRecord = {
            id: `points-log-${draft.logs.length + 1}`,
            ...data,
            createdAt: NOW,
          };
          draft.logs.push(value);
          return value;
        },
      },
      user: {
        findFirst: async () => ({
          pointsBalance: draft.balance,
          pointsEarnedTotal: draft.earnedTotal,
          currentLevel: 1,
          version: draft.version,
        }),
        updateMany: async () => {
          if (this.conflictsRemaining > 0) {
            this.conflictsRemaining -= 1;
            return { count: 0 };
          }
          draft.balance += 10;
          draft.earnedTotal += 10;
          draft.version += 1;
          return { count: 1 };
        },
      },
      levelConfig: {
        findMany: async () => [{ level: 1, pointsRequired: 0 }],
      },
      family: { findFirst: async () => ({ settings: {} }) },
      checkIn: {
        findFirst: async ({ where }: { where: { id: string; childId: string } }) => ({
          id: where.id,
          childId: where.childId,
          contentText: '完成今日任务',
          checkDate: NOW,
          task: { id: 'task-1', name: '今日任务' },
          media: [],
        }),
        findMany: async () => [],
        updateMany: async () => {
          draft.snapshotWrites += 1;
          return { count: 1 };
        },
      },
      collaborationRoundParticipant: {
        findMany: async () => [],
        updateMany: async () => ({ count: 1 }),
      },
    } as unknown as Prisma.TransactionClient;
  }
}

function pointsOutbox(
  database: MemoryPointsDatabase,
  fail = false,
): OutboxWriter<Prisma.TransactionClient> {
  return {
    async append(transaction, event) {
      if (fail) throw new Error('outbox unavailable');
      const state = database.transactionStates.get(transaction);
      if (!state) throw new Error('Unknown transaction.');
      state.events.push(event);
    },
  };
}

type CommerceState = {
  rewards: Map<string, RewardRecord>;
  redemptions: Map<string, RedemptionRecord>;
  balances: Map<string, number>;
  idempotency: Map<string, { fingerprint: string; redemptionId: string }>;
  effects: string[];
};

class MemoryCommerce implements RewardRepository {
  private queue: Promise<void> = Promise.resolve();

  constructor(readonly state: CommerceState) {}

  private exclusive<Result>(work: () => Promise<Result>): Promise<Result> {
    const result = this.queue.then(work, work);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async listRewards(familyId: string, activeOnly: boolean): Promise<readonly RewardRecord[]> {
    return [...this.state.rewards.values()].filter(
      (reward) => reward.familyId === familyId && (!activeOnly || reward.status === 'ACTIVE'),
    );
  }

  async findReward(
    familyId: string,
    rewardId: string,
    activeOnly = false,
  ): Promise<RewardRecord | null> {
    const reward = this.state.rewards.get(rewardId);
    return reward?.familyId === familyId && (!activeOnly || reward.status === 'ACTIVE')
      ? reward
      : null;
  }

  async createReward(familyId: string, input: RewardInput): Promise<RewardRecord> {
    const reward = rewardRecord({ familyId, ...input });
    this.state.rewards.set(reward.id, reward);
    return reward;
  }

  async updateReward(
    familyId: string,
    rewardId: string,
    input: RewardPatch,
  ): Promise<RewardRecord | null> {
    const current = await this.findReward(familyId, rewardId);
    if (!current) return null;
    const updated = { ...current, ...input, updatedAt: NOW };
    this.state.rewards.set(rewardId, updated);
    return updated;
  }

  async softDeleteReward(familyId: string, rewardId: string): Promise<boolean> {
    return (await this.findReward(familyId, rewardId)) !== null;
  }

  requestRedemption(
    input: Parameters<RewardRepository['requestRedemption']>[0],
  ): Promise<RedemptionRecord> {
    return this.exclusive(async () => {
      const idempotencyKey = `${input.familyId}:${input.idempotencyKey}`;
      const repeated = this.state.idempotency.get(idempotencyKey);
      if (repeated) {
        if (repeated.fingerprint !== input.requestFingerprint) {
          throw new Error('Idempotency fingerprint conflict.');
        }
        return this.requireRedemption(repeated.redemptionId, input.familyId);
      }
      const reward = await this.findReward(input.familyId, input.rewardId, true);
      const balance = this.state.balances.get(input.childId);
      if (!reward || balance === undefined) throw new RewardAccessError('NOT_FOUND', 'Missing.');
      if (
        reward.stockTotal !== null &&
        reward.stockReserved + reward.stockConsumed >= reward.stockTotal
      ) {
        throw new RewardEligibilityError('The reward is out of stock.');
      }
      if (balance < reward.pointsCost) {
        throw new RewardEligibilityError('The points balance is insufficient.');
      }
      const id = `redemption-${this.state.redemptions.size + 1}`;
      const value = redemptionRecord({
        id,
        familyId: input.familyId,
        rewardId: input.rewardId,
        childId: input.childId,
        pointsSpent: reward.pointsCost,
      });
      this.state.redemptions.set(id, value);
      this.state.idempotency.set(idempotencyKey, {
        fingerprint: input.requestFingerprint,
        redemptionId: id,
      });
      this.state.balances.set(input.childId, balance - reward.pointsCost);
      if (reward.stockTotal !== null) {
        this.state.rewards.set(reward.id, { ...reward, stockReserved: reward.stockReserved + 1 });
      }
      this.state.effects.push(`redeem:${id}`, `event:requested:${id}`);
      return value;
    });
  }

  async listRedemptions(familyId: string, childId?: string): Promise<readonly RedemptionRecord[]> {
    return [...this.state.redemptions.values()].filter(
      (value) =>
        value.familyId === familyId && (childId === undefined || value.childId === childId),
    );
  }

  async approveRedemption(
    input: Parameters<RewardRepository['approveRedemption']>[0],
  ): Promise<RedemptionRecord> {
    return this.requireRedemption(input.redemptionId, input.familyId);
  }

  async fulfillRedemption(
    input: Parameters<RewardRepository['fulfillRedemption']>[0],
  ): Promise<RedemptionRecord> {
    return this.requireRedemption(input.redemptionId, input.familyId);
  }

  rejectRedemption(
    input: Parameters<RewardRepository['rejectRedemption']>[0],
  ): Promise<RedemptionRecord> {
    return this.exclusive(async () => {
      const current = this.requireRedemption(input.redemptionId, input.familyId);
      if (current.status === 'REJECTED') return current;
      const reward = this.state.rewards.get(current.rewardId);
      const balance = this.state.balances.get(current.childId);
      if (!reward || balance === undefined) throw new Error('Invalid redemption state.');
      const rejected: RedemptionRecord = {
        ...current,
        status: 'REJECTED',
        rejectedById: input.parentId,
        rejectedAt: input.now,
        rejectionReason: input.reason,
        updatedAt: input.now,
      };
      this.state.redemptions.set(current.id, rejected);
      this.state.balances.set(current.childId, balance + current.pointsSpent);
      if (reward.stockTotal !== null) {
        this.state.rewards.set(reward.id, { ...reward, stockReserved: reward.stockReserved - 1 });
      }
      this.state.effects.push(`refund:${current.id}`, `event:rejected:${current.id}`);
      return rejected;
    });
  }

  async listWishes(): Promise<readonly WishRecord[]> {
    return [];
  }

  async createWish(): Promise<WishRecord> {
    throw new Error('Wishes are outside this fixture.');
  }

  async cancelWish(): Promise<WishRecord> {
    throw new Error('Wishes are outside this fixture.');
  }

  async adoptWish(): Promise<{ wish: WishRecord; reward: RewardRecord }> {
    throw new Error('Wishes are outside this fixture.');
  }

  private requireRedemption(redemptionId: string, familyId: string): RedemptionRecord {
    const value = this.state.redemptions.get(redemptionId);
    if (!value || value.familyId !== familyId) {
      throw new RewardAccessError('NOT_FOUND', 'The redemption was not found.');
    }
    return value;
  }
}

function rewardRecord(overrides: Partial<RewardRecord> = {}): RewardRecord {
  return {
    id: REWARD_ID,
    familyId: FAMILY_A,
    name: '最后一个奖励',
    description: null,
    imageMediaId: null,
    pointsCost: 30,
    type: 'PHYSICAL',
    stockTotal: 2,
    stockReserved: 0,
    stockConsumed: 0,
    prerequisites: {},
    status: 'ACTIVE',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function redemptionRecord(
  input: Pick<RedemptionRecord, 'id' | 'familyId' | 'rewardId' | 'childId' | 'pointsSpent'>,
): RedemptionRecord {
  return {
    ...input,
    listedPointsCost: input.pointsSpent,
    discount: 1,
    status: 'PENDING',
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

function commerceHarness(stockTotal = 2) {
  const sessions = new MemorySessions();
  sessions.set('child-a', childSession(FAMILY_A, CHILD_A));
  sessions.set('child-b', childSession(FAMILY_A, CHILD_B));
  sessions.set('parent-a', parentSession(FAMILY_A, PARENT_A));
  sessions.set('family-b-child', childSession(FAMILY_B, 'family-b-child'));
  const state: CommerceState = {
    rewards: new Map([[REWARD_ID, rewardRecord({ stockTotal })]]),
    redemptions: new Map(),
    balances: new Map([
      [CHILD_A, 100],
      [CHILD_B, 100],
      ['family-b-child', 100],
    ]),
    idempotency: new Map(),
    effects: [],
  };
  const repository = new MemoryCommerce(state);
  return {
    state,
    repository,
    service: new RewardService({ repository, sessions, now: () => NOW }),
  };
}

describe('phase 1 concurrency and rollback e2e regression', () => {
  it('deduplicates concurrent check-ins into one final record and one write', async () => {
    const sessions = new MemorySessions();
    sessions.set('child-a', childSession(FAMILY_A, CHILD_A));
    const repository = new MemoryCheckIns({
      assignmentId: 'assignment-1',
      familyId: FAMILY_A,
      childId: CHILD_A,
      taskId: 'task-1',
      taskStatus: 'ACTIVE',
      collaborationMode: 'SOLO',
      checkType: 'TICK',
      verifyMode: 'AUTO',
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
    });
    const service = new CheckInService({ repository, sessions, now: () => NOW });
    const input = {
      sessionToken: 'child-a',
      assignmentId: 'assignment-1',
      idempotencyKey: 'same-check-in',
      checkDate: '2026-07-31',
      content: { mediaIds: [] },
    } as const;

    const results = await Promise.all([service.submit(input), service.submit(input)]);

    expect(results[0]?.checkIn).toEqual(results[1]?.checkIn);
    expect(repository.records).toHaveLength(1);
    expect(repository.soloWrites).toBe(1);
  });

  it('deduplicates concurrent collaboration scheduling and participant snapshots', async () => {
    const repository = new MemoryRounds();
    const scheduler = new CollaborationScheduler(repository);

    const [first, second] = await Promise.all([
      scheduler.generate({ familyId: FAMILY_A, date: '2026-07-31' }),
      scheduler.generate({ familyId: FAMILY_A, date: '2026-07-31' }),
    ]);

    expect(first).toEqual(second);
    expect(repository.rounds).toHaveLength(1);
    expect(repository.createEffects).toBe(1);
    expect(first[0]?.participants).toHaveLength(2);
  });

  it('retries a failed Outbox publication and publishes its side effect once', async () => {
    let clock = NOW;
    const event = createDomainEvent({
      event_id: '50000000-0000-4000-8000-000000000001',
      event_name: 'tasks.task.archived.v1',
      occurred_at: NOW.toISOString(),
      family_id: FAMILY_A,
      actor_id: PARENT_A,
      correlation_id: 'outbox-regression',
      payload: { task_id: 'task-1' },
    });
    const repository = new MemoryOutbox({
      event,
      attempts: 0,
      availableAt: NOW,
      publishedAt: null,
      owner: null,
    });
    let attempts = 0;
    const sideEffects: string[] = [];
    const dispatcher = new OutboxDispatcher(
      repository,
      {
        async publish(value) {
          attempts += 1;
          if (attempts === 1) throw new Error('temporary failure');
          sideEffects.push(value.event_id);
        },
      },
      {
        workerId: 'worker-1',
        batchSize: 1,
        leaseMilliseconds: 1_000,
        retryBaseMilliseconds: 1_000,
        retryMaxMilliseconds: 8_000,
        clock: () => clock,
      },
    );

    await expect(dispatcher.dispatchBatch()).resolves.toEqual({
      claimed: 1,
      published: 0,
      failed: 1,
    });
    expect(repository.record.publishedAt).toBeNull();
    clock = new Date(NOW.getTime() + 1_000);
    await expect(dispatcher.dispatchBatch()).resolves.toEqual({
      claimed: 1,
      published: 1,
      failed: 0,
    });
    await expect(dispatcher.dispatchBatch()).resolves.toEqual({
      claimed: 0,
      published: 0,
      failed: 0,
    });
    expect(repository.record.attempts).toBe(2);
    expect(sideEffects).toEqual([event.event_id]);
  });

  it('retries balance conflicts and rolls back every state change after an Outbox failure', async () => {
    const initial: MemoryPointsState = {
      balance: 20,
      earnedTotal: 20,
      version: 1,
      snapshotWrites: 0,
      logs: [],
      events: [],
    };
    const database = new MemoryPointsDatabase(initial, 2);
    const writer = new PrismaPointsTransactionWriter(
      database.client,
      pointsOutbox(database),
      () => '60000000-0000-4000-8000-000000000001',
    );
    const award = {
      familyId: FAMILY_A,
      userId: CHILD_A,
      checkInId: 'check-in-1',
      basePoints: 10,
      awardDate: '2026-07-31',
      actorId: CHILD_A,
      occurredAt: NOW,
    } as const;

    await writer.run((_transaction, points) => points.earnCheckIn(award));
    expect(initial).toMatchObject({ balance: 30, earnedTotal: 30, version: 2, snapshotWrites: 1 });
    expect(initial.logs).toHaveLength(1);
    expect(initial.events).toHaveLength(2);

    const failureState: MemoryPointsState = {
      balance: initial.balance,
      earnedTotal: initial.earnedTotal,
      version: initial.version,
      snapshotWrites: initial.snapshotWrites,
      logs: [],
      events: [],
    };
    const beforeFailure = clonePointsState(failureState);
    const failingDatabase = new MemoryPointsDatabase(failureState, 0);
    const failingWriter = new PrismaPointsTransactionWriter(
      failingDatabase.client,
      pointsOutbox(failingDatabase, true),
    );
    await expect(
      failingWriter.run((_transaction, points) =>
        points.earnCheckIn({ ...award, checkInId: 'check-in-2' }),
      ),
    ).rejects.toThrow('outbox unavailable');
    expect(failureState).toEqual(beforeFailure);
  });

  it('deduplicates concurrent redemption into one debit, reservation, record and event', async () => {
    const { service, state } = commerceHarness();
    const input = {
      sessionToken: 'child-a',
      rewardId: REWARD_ID,
      idempotencyKey: 'same-redemption',
    } as const;

    const results = await Promise.all([
      service.requestRedemption(input),
      service.requestRedemption(input),
    ]);

    expect(results[0]?.redemption).toEqual(results[1]?.redemption);
    expect(state.redemptions).toHaveLength(1);
    expect(state.balances.get(CHILD_A)).toBe(70);
    expect(state.rewards.get(REWARD_ID)?.stockReserved).toBe(1);
    expect(state.effects.filter((effect) => effect.startsWith('redeem:'))).toHaveLength(1);
    expect(state.effects.filter((effect) => effect.startsWith('event:requested:'))).toHaveLength(1);
  });

  it('deduplicates concurrent refunds and restores balance and stock once', async () => {
    const { service, state } = commerceHarness();
    const requested = await service.requestRedemption({
      sessionToken: 'child-a',
      rewardId: REWARD_ID,
      idempotencyKey: 'refund-target',
    });
    const input = {
      sessionToken: 'parent-a',
      redemptionId: requested.redemption.id,
      reason: '家长拒绝',
    } as const;

    const results = await Promise.all([
      service.rejectRedemption(input),
      service.rejectRedemption(input),
    ]);

    expect(results[0]?.redemption.status).toBe('REJECTED');
    expect(results[1]?.redemption).toEqual(results[0]?.redemption);
    expect(state.balances.get(CHILD_A)).toBe(100);
    expect(state.rewards.get(REWARD_ID)?.stockReserved).toBe(0);
    expect(state.effects.filter((effect) => effect.startsWith('refund:'))).toHaveLength(1);
    expect(state.effects.filter((effect) => effect.startsWith('event:rejected:'))).toHaveLength(1);
  });

  it('allows one winner for the last stock item without debiting the loser', async () => {
    const { service, state } = commerceHarness(1);
    const settled = await Promise.allSettled([
      service.requestRedemption({
        sessionToken: 'child-a',
        rewardId: REWARD_ID,
        idempotencyKey: 'last-stock-a',
      }),
      service.requestRedemption({
        sessionToken: 'child-b',
        rewardId: REWARD_ID,
        idempotencyKey: 'last-stock-b',
      }),
    ]);

    expect(settled.map(({ status }) => status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(state.redemptions).toHaveLength(1);
    expect(state.rewards.get(REWARD_ID)).toMatchObject({ stockReserved: 1, stockConsumed: 0 });
    expect([...state.balances.values()].filter((balance) => balance === 70)).toHaveLength(1);
    expect(state.effects.filter((effect) => effect.startsWith('redeem:'))).toHaveLength(1);
  });

  it('rejects forged family context and keeps another family resource invisible', async () => {
    const { repository, service } = commerceHarness();
    const sessions = new MemorySessions();
    sessions.set('family-b-child', childSession(FAMILY_B, 'family-b-child'));
    const app = new Hono<AppEnvironment>();
    app.use('*', requestContext);
    app.use(
      '/api/*',
      createSecurityMiddleware({ publicBaseUrl: 'http://localhost:3000', sessions }),
    );
    let routeCalls = 0;
    app.get('/api/v1/rewards', (context) => {
      routeCalls += 1;
      return context.json({ familyId: context.get('authSession')?.familyId });
    });

    const response = await app.request('/api/v1/rewards', {
      headers: {
        Cookie: 'familystar_session=family-b-child',
        'X-Family-Id': FAMILY_A,
      },
    });

    expect(response.status).toBe(403);
    expect(routeCalls).toBe(0);
    await expect(
      service.getReward({ sessionToken: 'family-b-child', rewardId: REWARD_ID }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(repository.findReward(FAMILY_B, REWARD_ID, true)).resolves.toBeNull();
  });
});
