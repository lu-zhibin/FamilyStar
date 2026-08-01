import type { PrismaClient, TaskType } from '@prisma/client';

import type {
  TaskTypeCreateInput,
  TaskTypePatch,
  TaskTypeRecord,
  TaskTypeRepository,
} from './types.js';

function record(value: TaskType): TaskTypeRecord {
  return {
    id: value.id,
    familyId: value.familyId,
    templateCode: value.templateCode,
    name: value.name,
    icon: value.icon,
    defaultVerifyMode: value.defaultVerifyMode,
    isEnabled: value.isEnabled,
    sortOrder: value.sortOrder,
  };
}

export class PrismaTaskTypeRepository implements TaskTypeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(familyId: string): Promise<readonly TaskTypeRecord[]> {
    const values = await this.prisma.taskType.findMany({
      where: { familyId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return values.map(record);
  }

  async findById(familyId: string, taskTypeId: string): Promise<TaskTypeRecord | null> {
    const value = await this.prisma.taskType.findFirst({
      where: { id: taskTypeId, familyId, deletedAt: null },
    });
    return value ? record(value) : null;
  }

  async create(familyId: string, input: TaskTypeCreateInput): Promise<TaskTypeRecord> {
    const value = await this.prisma.taskType.create({
      data: {
        familyId,
        name: input.name,
        icon: input.icon,
        ...(input.defaultVerifyMode === undefined
          ? {}
          : { defaultVerifyMode: input.defaultVerifyMode }),
        ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
      },
    });
    return record(value);
  }

  async update(
    familyId: string,
    taskTypeId: string,
    input: TaskTypePatch,
  ): Promise<TaskTypeRecord | null> {
    const result = await this.prisma.taskType.updateMany({
      where: { id: taskTypeId, familyId, deletedAt: null },
      data: input,
    });
    if (result.count !== 1) return null;
    return this.findById(familyId, taskTypeId);
  }

  countActiveTasks(familyId: string, taskTypeId: string): Promise<number> {
    return this.prisma.task.count({
      where: { familyId, taskTypeId, deletedAt: null, status: { not: 'ARCHIVED' } },
    });
  }

  async softDelete(familyId: string, taskTypeId: string): Promise<boolean> {
    const result = await this.prisma.taskType.updateMany({
      where: { id: taskTypeId, familyId, deletedAt: null },
      data: { deletedAt: new Date(), isEnabled: false },
    });
    return result.count === 1;
  }
}
