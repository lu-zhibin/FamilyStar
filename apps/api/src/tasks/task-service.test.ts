import { describe, expect, it } from 'vitest';

import { InvalidTaskError, TaskService, TaskStateConflictError } from './task-service.js';
import type { TaskCreateInput, TaskRecord, TaskRepository } from './types.js';

const familyId = 'family-1';
const parentSession = {
  subjectId: 'parent-1',
  familyId,
  role: 'parent' as const,
  issuedAt: new Date().toISOString(),
};

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

function repository(): TaskRepository & { values: TaskRecord[] } {
  const values: TaskRecord[] = [];
  return {
    values,
    async list() {
      return this.values;
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

function service(repo = repository()) {
  return {
    repo,
    service: new TaskService({ repository: repo, sessions: { read: async () => parentSession } }),
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
});
