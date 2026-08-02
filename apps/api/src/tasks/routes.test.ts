import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { TaskTypeSessionRequiredError } from './task-type-service.js';
import type { TaskOperations, TaskRecord, TaskTypeOperations, TaskTypeRecord } from './types.js';

const taskType: TaskTypeRecord = {
  id: 'type-1',
  familyId: 'family-1',
  templateCode: null,
  name: '家务',
  icon: 'home',
  defaultVerifyMode: 'MANUAL',
  isEnabled: true,
  sortOrder: 1,
};

function operations(): TaskTypeOperations {
  return {
    async list(input) {
      expect(input.sessionToken).toBe('parent-session');
      return { taskTypes: [taskType] };
    },
    async create(input) {
      expect(input.taskType).toMatchObject({
        name: '运动',
        icon: 'run',
        defaultVerifyMode: 'AUTO',
      });
      return { taskType: { ...taskType, ...input.taskType, id: 'type-2' } };
    },
    async update() {
      return { taskType };
    },
    async remove() {},
  };
}

const task: TaskRecord = {
  id: 'task-1',
  familyId: 'family-1',
  taskTypeId: 'type-1',
  name: '一起整理房间',
  description: null,
  submissionGuide: '拍照提交',
  checkType: 'PHOTO',
  verifyMode: 'MANUAL',
  collaborationMode: 'COLLAB',
  frequency: { kind: 'weekdays', weekdays: [5] },
  basePoints: 10,
  status: 'ACTIVE',
  assignments: [
    { id: 'a-1', taskId: 'task-1', childId: 'child-1', startDate: '2026-07-31' },
    { id: 'a-2', taskId: 'task-1', childId: 'child-2', customPoints: 15, startDate: '2026-07-31' },
  ],
};

function taskOperations(): TaskOperations {
  return {
    async list() {
      return { tasks: [task] };
    },
    async listMine(input) {
      return {
        date: input.date,
        tasks: [
          {
            taskId: task.id,
            taskAssignmentId: task.assignments[0]!.id,
            name: task.name,
            description: task.description,
            submissionGuide: task.submissionGuide,
            collaborationMode: task.collaborationMode,
            frequency: task.frequency,
            points: task.basePoints,
            checkType: task.checkType,
            verifyMode: task.verifyMode,
            startDate: task.assignments[0]!.startDate,
            endDate: null,
          },
        ],
      };
    },
    async create(input) {
      expect(input.task).toMatchObject({
        taskTypeId: 'type-1',
        collaborationMode: 'COLLAB',
        assignments: [{ childId: 'child-1' }, { childId: 'child-2', customPoints: 15 }],
      });
      return { task };
    },
    async update() {
      return { task };
    },
    async setStatus(input) {
      return { task: { ...task, status: input.status } };
    },
  };
}

describe('task type HTTP routes', () => {
  beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('returns task types in the public API shape', async () => {
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      taskTypeOperations: operations(),
    });
    const response = await app.request('/api/v1/family/task-types', {
      headers: { cookie: 'familystar_session=parent-session' },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { task_types: [{ id: 'type-1', family_id: 'family-1', name: '家务' }] },
    });
  });

  it('validates input and creates a task type', async () => {
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      taskTypeOperations: operations(),
    });
    const response = await app.request('/api/v1/family/task-types', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'familystar_session=parent-session' },
      body: JSON.stringify({ name: '运动', icon: 'run', default_verify_mode: 'AUTO' }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ data: { task_type: { name: '运动' } } });
  });

  it('maps missing parent authentication to unauthorized', async () => {
    const taskTypeOperations = operations();
    taskTypeOperations.list = async () => {
      throw new TaskTypeSessionRequiredError();
    };
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', taskTypeOperations });
    const response = await app.request('/api/v1/family/task-types');

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });

  it('creates collaboration tasks and maps assignment overrides', async () => {
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      taskOperations: taskOperations(),
    });
    const response = await app.request('/api/v1/family/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'familystar_session=parent-session' },
      body: JSON.stringify({
        task_type_id: 'type-1',
        name: '一起整理房间',
        submission_guide: '拍照提交',
        check_type: 'PHOTO',
        collaboration_mode: 'COLLAB',
        frequency: { kind: 'weekdays', weekdays: [5] },
        base_points: 10,
        assignments: [
          { child_id: 'child-1', start_date: '2026-07-31' },
          { child_id: 'child-2', custom_points: 15, start_date: '2026-07-31' },
        ],
      }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      data: { task: { collaboration_mode: string; assignments: { child_id: string }[] } };
    };
    expect(body.data.task.collaboration_mode).toBe('COLLAB');
    expect(body.data.task.assignments).toHaveLength(2);
    expect(body.data.task.assignments[0]).toMatchObject({ child_id: 'child-1' });
  });

  it('supports explicit task status endpoints', async () => {
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      taskOperations: taskOperations(),
    });
    const response = await app.request('/api/v1/family/tasks/task-1/archive', {
      method: 'POST',
      headers: { cookie: 'familystar_session=parent-session' },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { task: { status: 'ARCHIVED' } } });
  });

  it('maps editable task fields into a partial update', async () => {
    const operations = taskOperations();
    const update = vi.fn().mockResolvedValue({
      task: { ...task, name: '整理我的房间', description: null, basePoints: 20 },
    });
    operations.update = update;
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      taskOperations: operations,
    });
    const response = await app.request('/api/v1/family/tasks/task-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: 'familystar_session=parent-session' },
      body: JSON.stringify({
        task_type_id: 'type-1',
        name: '整理我的房间',
        description: null,
        check_type: 'TICK',
        verify_mode: 'AUTO',
        base_points: 20,
      }),
    });

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      sessionToken: 'parent-session',
      taskId: 'task-1',
      task: {
        taskTypeId: 'type-1',
        name: '整理我的房间',
        description: null,
        checkType: 'TICK',
        verifyMode: 'AUTO',
        basePoints: 20,
      },
    });
    expect(await response.json()).toMatchObject({
      data: { task: { name: '整理我的房间', description: null, base_points: 20 } },
    });
  });

  it('returns only the child task assignment API shape', async () => {
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      taskOperations: taskOperations(),
    });
    const response = await app.request('/api/v1/tasks/me?date=2026-08-01', {
      headers: { cookie: 'familystar_session=child-session' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({
      date: '2026-08-01',
      tasks: [
        {
          task_id: 'task-1',
          task_assignment_id: 'a-1',
          name: '一起整理房间',
          points: 10,
          check_type: 'PHOTO',
        },
      ],
    });
    expect(JSON.stringify(body.data)).not.toContain('family_id');
    expect(JSON.stringify(body.data)).not.toContain('child_id');
  });
});
