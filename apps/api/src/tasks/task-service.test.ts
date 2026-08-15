import { describe, expect, it } from 'vitest';

import { InvalidTaskError, TaskService, TaskStateConflictError } from './task-service.js';
import type {
  ChildCollaborationRoundRecord,
  TaskCreateInput,
  TaskRecord,
  TaskRepository,
} from './types.js';

const familyId = 'family-1';
const parentSession = {
  subjectId: 'parent-1',
  familyId,
  role: 'parent' as const,
  issuedAt: new Date().toISOString(),
};
const childSession = { ...parentSession, subjectId: 'child-1', role: 'child' as const };

function input(overrides: Partial<TaskCreateInput> = {}): TaskCreateInput {
  return {
    taskTypeId: 'type-1',
    name: '整理书桌',
    checkType: 'PHOTO',
    verifyMode: 'MANUAL',
    collaborationMode: 'SOLO',
    frequency: { kind: 'daily' },
    basePoints: 10,
    assignments: [{ childId: 'child-1', startDate: '2026-07-31' }],
    ...overrides,
  };
}

function repository(): TaskRepository & {
  values: TaskRecord[];
  rounds: ChildCollaborationRoundRecord[];
} {
  const values: TaskRecord[] = [];
  return {
    values,
    rounds: [],
    async list() {
      return this.values;
    },
    async listForChild() {
      return this.values;
    },
    async listCollaborationRoundsForChild(_familyId, _childId, taskIds) {
      return this.rounds.filter(({ taskId }) => taskIds.includes(taskId));
    },
    async findById(_familyId, taskId) {
      return this.values.find(({ id }) => id === taskId) ?? null;
    },
    async create(_familyId, value) {
      const task: TaskRecord = {
        id: `task-${this.values.length + 1}`,
        familyId,
        taskTypeId: value.taskTypeId,
        name: value.name,
        description: value.description ?? null,
        submissionGuide: value.submissionGuide ?? null,
        checkType: value.checkType,
        verifyMode: value.verifyMode ?? 'MANUAL',
        collaborationMode: value.collaborationMode ?? 'SOLO',
        frequency: value.frequency,
        basePoints: value.basePoints,
        status: 'ACTIVE',
        assignments: value.assignments.map((assignment, index) => ({
          id: `assignment-${index + 1}`,
          taskId: `task-${this.values.length + 1}`,
          ...assignment,
        })),
      };
      this.values.push(task);
      return task;
    },
    async update(_familyId, taskId, patch) {
      const index = this.values.findIndex(({ id }) => id === taskId);
      if (index < 0) return null;
      const current = this.values[index]!;
      const task: TaskRecord = {
        ...current,
        ...patch,
        assignments:
          patch.assignments?.map((assignment, assignmentIndex) => ({
            id: `assignment-${assignmentIndex + 1}`,
            taskId,
            ...assignment,
          })) ?? current.assignments,
      };
      this.values[index] = task;
      return task;
    },
    async setStatus(_familyId, taskId, status) {
      const index = this.values.findIndex(({ id }) => id === taskId);
      if (index < 0) return null;
      const task = { ...this.values[index]!, status };
      this.values[index] = task;
      return task;
    },
  };
}

function service(
  repo = repository(),
  session: {
    subjectId: string;
    familyId: string;
    role: 'parent' | 'child';
    issuedAt: string;
  } = parentSession,
) {
  return {
    repo,
    service: new TaskService({ repository: repo, sessions: { read: async () => session } }),
  };
}

describe('TaskService', () => {
  it('creates a task with per-child overrides', async () => {
    const { service: operations } = service();
    const result = await operations.create({
      sessionToken: 'session',
      task: input({
        assignments: [
          {
            childId: 'child-1',
            customPoints: 15,
            customFrequency: { kind: 'weekdays', weekdays: [1, 3, 5] },
            customCheckType: 'TEXT',
            customVerifyMode: 'AUTO',
            startDate: '2026-07-31',
          },
        ],
      }),
    });

    expect(result.task.assignments[0]).toMatchObject({
      customPoints: 15,
      customCheckType: 'TEXT',
      customVerifyMode: 'AUTO',
    });
  });

  it('requires two distinct children for collaboration tasks', async () => {
    const { service: operations } = service();
    await expect(
      operations.create({
        sessionToken: 'session',
        task: input({ collaborationMode: 'COLLAB' }),
      }),
    ).rejects.toBeInstanceOf(InvalidTaskError);
    await expect(
      operations.create({
        sessionToken: 'session',
        task: input({
          collaborationMode: 'COLLAB',
          assignments: [
            { childId: 'child-1', startDate: '2026-07-31' },
            { childId: 'child-1', startDate: '2026-07-31' },
          ],
        }),
      }),
    ).rejects.toBeInstanceOf(InvalidTaskError);
  });

  it('supports deactivate, activate and irreversible archive transitions', async () => {
    const { service: operations } = service();
    const created = await operations.create({ sessionToken: 'session', task: input() });
    await expect(
      operations.setStatus({
        sessionToken: 'session',
        taskId: created.task.id,
        status: 'INACTIVE',
      }),
    ).resolves.toMatchObject({ task: { status: 'INACTIVE' } });
    await operations.setStatus({
      sessionToken: 'session',
      taskId: created.task.id,
      status: 'ARCHIVED',
    });
    await expect(
      operations.setStatus({ sessionToken: 'session', taskId: created.task.id, status: 'ACTIVE' }),
    ).rejects.toBeInstanceOf(TaskStateConflictError);
  });

  it('updates editable fields while preserving existing assignments', async () => {
    const { service: operations } = service();
    const created = await operations.create({ sessionToken: 'session', task: input() });

    await expect(
      operations.update({
        sessionToken: 'session',
        taskId: created.task.id,
        task: { name: '整理我的书桌', description: null, basePoints: 20 },
      }),
    ).resolves.toMatchObject({
      task: {
        name: '整理我的书桌',
        description: null,
        basePoints: 20,
        assignments: [{ childId: 'child-1' }],
      },
    });
  });

  it('lists only the current child assignments scheduled for the requested date', async () => {
    const repo = repository();
    await repo.create(familyId, input());
    await repo.create(
      familyId,
      input({
        name: '周三阅读',
        basePoints: 12,
        checkType: 'TEXT',
        frequency: { kind: 'daily' },
        assignments: [
          {
            childId: 'child-1',
            customPoints: 18,
            customFrequency: { kind: 'weekdays', weekdays: [3] },
            customCheckType: 'TICK',
            customVerifyMode: 'AUTO',
            startDate: '2026-08-01',
          },
        ],
      }),
    );
    await repo.create(
      familyId,
      input({
        name: '其他孩子任务',
        assignments: [{ childId: 'child-2', startDate: '2026-08-01' }],
      }),
    );
    const { service: operations } = service(repo, childSession);

    await expect(
      operations.listMine({ sessionToken: 'session', date: '2026-08-05' }),
    ).resolves.toEqual({
      date: '2026-08-05',
      tasks: [
        expect.objectContaining({
          taskId: 'task-1',
          taskAssignmentId: 'assignment-1',
          name: '整理书桌',
          points: 10,
        }),
        expect.objectContaining({
          taskId: 'task-2',
          taskAssignmentId: 'assignment-1',
          name: '周三阅读',
          points: 18,
          checkType: 'TICK',
          verifyMode: 'AUTO',
        }),
      ],
    });
  });

  it('attaches the current child collaboration round and preserves solo task shape', async () => {
    const repo = repository();
    await repo.create(familyId, input());
    const collaborationTask = await repo.create(
      familyId,
      input({
        collaborationMode: 'COLLAB',
        assignments: [
          { childId: 'child-1', startDate: '2026-08-01' },
          { childId: 'child-2', startDate: '2026-08-01' },
        ],
      }),
    );
    repo.rounds.push({
      id: 'round-1',
      taskId: collaborationTask.id,
      status: 'COMPLETED',
      startDate: '2026-08-05',
      endDate: '2026-08-05',
      participants: [
        { nickname: '小星', isCurrentChild: true, submissionStatus: 'APPROVED' },
        { nickname: '小月', isCurrentChild: false, submissionStatus: 'APPROVED' },
      ],
      mySubmission: {
        id: 'submission-1',
        status: 'APPROVED',
        submittedAt: new Date('2026-08-05T10:00:00.000Z'),
        reviewComment: null,
      },
    });

    const result = await service(repo, childSession).service.listMine({
      sessionToken: 'session',
      date: '2026-08-05',
    });

    expect(result.tasks[0]).not.toHaveProperty('collaborationRound');
    expect(result.tasks[1]).toMatchObject({
      collaborationMode: 'COLLAB',
      collaborationRound: { id: 'round-1', status: 'COMPLETED' },
    });
  });

  it('returns a null round for a due collaboration task before scheduling', async () => {
    const repo = repository();
    await repo.create(
      familyId,
      input({
        collaborationMode: 'COLLAB',
        assignments: [
          { childId: 'child-1', startDate: '2026-08-01' },
          { childId: 'child-2', startDate: '2026-08-01' },
        ],
      }),
    );

    await expect(
      service(repo, childSession).service.listMine({ sessionToken: 'session', date: '2026-08-05' }),
    ).resolves.toMatchObject({ tasks: [{ collaborationRound: null }] });
  });
});
