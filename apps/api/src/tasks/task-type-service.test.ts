import { describe, expect, it } from 'vitest';

import {
  PresetTaskTypeDeleteError,
  TaskTypeDeleteConflictError,
  TaskTypeService,
} from './task-type-service.js';
import type { TaskTypeRecord, TaskTypeRepository } from './types.js';

const familyId = 'family-1';
const parentSession = {
  subjectId: 'parent-1',
  familyId,
  role: 'parent' as const,
  issuedAt: new Date().toISOString(),
};

function typeRecord(overrides: Partial<TaskTypeRecord> = {}): TaskTypeRecord {
  return {
    id: 'type-1',
    familyId,
    templateCode: null,
    name: '家务',
    icon: 'home',
    defaultVerifyMode: 'MANUAL',
    isEnabled: true,
    sortOrder: 1,
    ...overrides,
  };
}

function repository(): TaskTypeRepository & { values: TaskTypeRecord[] } {
  const values = [
    typeRecord(),
    typeRecord({ id: 'preset-1', templateCode: 'study', name: '学习' }),
  ];
  return {
    values,
    async list() {
      return this.values;
    },
    async findById(_familyId, id) {
      return this.values.find((value) => value.id === id) ?? null;
    },
    async create(_familyId, input) {
      const value = typeRecord({ id: 'new-type', ...input });
      this.values.push(value);
      return value;
    },
    async update(_familyId, id, input) {
      const index = this.values.findIndex((value) => value.id === id);
      if (index < 0) return null;
      const value = { ...this.values[index], ...input } as TaskTypeRecord;
      this.values[index] = value;
      return value;
    },
    async countActiveTasks(_familyId, id) {
      return id === 'type-with-task' ? 2 : 0;
    },
    async softDelete(_familyId, id) {
      const index = this.values.findIndex((value) => value.id === id);
      if (index < 0) return false;
      this.values.splice(index, 1);
      return true;
    },
  };
}

function service(repo = repository()) {
  return new TaskTypeService({
    repository: repo,
    sessions: { read: async () => parentSession },
  });
}

describe('TaskTypeService', () => {
  it('lists and creates task types inside the parent family', async () => {
    const result = await service().create({
      sessionToken: 'session',
      taskType: { name: '阅读', icon: 'book', defaultVerifyMode: 'AUTO' },
    });

    expect(result.taskType).toMatchObject({
      name: '阅读',
      icon: 'book',
      defaultVerifyMode: 'AUTO',
    });
  });

  it('allows preset overrides while preserving the preset identity', async () => {
    const result = await service().update({
      sessionToken: 'session',
      taskTypeId: 'preset-1',
      taskType: { name: '学习打卡' },
    });

    expect(result.taskType).toMatchObject({ templateCode: 'study', name: '学习打卡' });
  });

  it('protects preset types and types referenced by active tasks', async () => {
    await expect(
      service().remove({ sessionToken: 'session', taskTypeId: 'preset-1' }),
    ).rejects.toBeInstanceOf(PresetTaskTypeDeleteError);

    const repo = repository();
    repo.values.push(typeRecord({ id: 'type-with-task' }));
    await expect(
      service(repo).remove({ sessionToken: 'session', taskTypeId: 'type-with-task' }),
    ).rejects.toBeInstanceOf(TaskTypeDeleteConflictError);
  });
});
