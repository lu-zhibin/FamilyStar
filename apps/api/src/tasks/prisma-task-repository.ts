import type { Prisma, PrismaClient } from '@prisma/client';

import { InvalidTaskError } from './task-service.js';
import type {
  TaskAssignmentInput,
  TaskCreateInput,
  TaskFrequency,
  TaskPatch,
  TaskRecord,
  TaskRepository,
} from './types.js';

type TaskWithAssignments = Prisma.TaskGetPayload<{
  include: { assignments: true };
}>;

const taskInclude = {
  assignments: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.TaskInclude;

function date(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function frequency(value: Prisma.JsonValue): TaskFrequency {
  return value as unknown as TaskFrequency;
}

function record(value: TaskWithAssignments): TaskRecord {
  return {
    id: value.id,
    familyId: value.familyId,
    taskTypeId: value.taskTypeId,
    name: value.name,
    description: value.description,
    submissionGuide: value.submissionGuide,
    checkType: value.checkType,
    verifyMode: value.verifyMode,
    collaborationMode: value.collaborationMode,
    frequency: frequency(value.frequency),
    basePoints: value.basePoints,
    status: value.status,
    assignments: value.assignments.map((assignment) => ({
      id: assignment.id,
      taskId: assignment.taskId,
      childId: assignment.childId,
      ...(assignment.customPoints === null ? {} : { customPoints: assignment.customPoints }),
      ...(assignment.customFrequency === null
        ? {}
        : { customFrequency: frequency(assignment.customFrequency) }),
      ...(assignment.customCheckType === null
        ? {}
        : { customCheckType: assignment.customCheckType }),
      ...(assignment.customVerifyMode === null
        ? {}
        : { customVerifyMode: assignment.customVerifyMode }),
      startDate: date(assignment.startDate),
      ...(assignment.endDate === null ? {} : { endDate: date(assignment.endDate) }),
    })),
  };
}

function assignmentData(familyId: string, taskId: string | undefined, input: TaskAssignmentInput) {
  return {
    familyId,
    ...(taskId === undefined ? {} : { taskId }),
    childId: input.childId,
    ...(input.customPoints === undefined ? {} : { customPoints: input.customPoints }),
    ...(input.customFrequency === undefined
      ? {}
      : { customFrequency: input.customFrequency as Prisma.InputJsonObject }),
    ...(input.customCheckType === undefined ? {} : { customCheckType: input.customCheckType }),
    ...(input.customVerifyMode === undefined ? {} : { customVerifyMode: input.customVerifyMode }),
    startDate: new Date(`${input.startDate}T00:00:00.000Z`),
    ...(input.endDate === undefined ? {} : { endDate: new Date(`${input.endDate}T00:00:00.000Z`) }),
    deletedAt: null,
  };
}

async function validateRelations(
  transaction: Prisma.TransactionClient,
  familyId: string,
  taskTypeId: string,
  assignments: readonly TaskAssignmentInput[],
): Promise<void> {
  const [taskType, childCount] = await Promise.all([
    transaction.taskType.findFirst({
      where: { id: taskTypeId, familyId, isEnabled: true, deletedAt: null },
      select: { id: true },
    }),
    transaction.user.count({
      where: {
        id: { in: assignments.map(({ childId }) => childId) },
        familyId,
        role: 'CHILD',
        deletedAt: null,
      },
    }),
  ]);
  if (!taskType || childCount !== assignments.length) throw new InvalidTaskError();
}

export class PrismaTaskRepository implements TaskRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(familyId: string): Promise<readonly TaskRecord[]> {
    const tasks = await this.prisma.task.findMany({
      where: { familyId, deletedAt: null },
      include: taskInclude,
      orderBy: { createdAt: 'desc' },
    });
    return tasks.map(record);
  }

  async listForChild(familyId: string, childId: string): Promise<readonly TaskRecord[]> {
    const assignmentWhere = { familyId, childId, deletedAt: null };
    const tasks = await this.prisma.task.findMany({
      where: {
        familyId,
        status: 'ACTIVE',
        deletedAt: null,
        assignments: { some: assignmentWhere },
      },
      include: {
        assignments: { where: assignmentWhere, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return tasks.map(record);
  }

  async findById(familyId: string, taskId: string): Promise<TaskRecord | null> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, familyId, deletedAt: null },
      include: taskInclude,
    });
    return task ? record(task) : null;
  }

  create(familyId: string, input: TaskCreateInput): Promise<TaskRecord> {
    return this.prisma.$transaction(async (transaction) => {
      await validateRelations(transaction, familyId, input.taskTypeId, input.assignments);
      const task = await transaction.task.create({
        data: {
          familyId,
          taskTypeId: input.taskTypeId,
          name: input.name,
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.submissionGuide === undefined
            ? {}
            : { submissionGuide: input.submissionGuide }),
          checkType: input.checkType,
          verifyMode: input.verifyMode ?? 'MANUAL',
          collaborationMode: input.collaborationMode ?? 'SOLO',
          frequency: input.frequency as Prisma.InputJsonObject,
          basePoints: input.basePoints,
          assignments: {
            create: input.assignments.map((assignment) =>
              assignmentData(familyId, undefined, assignment),
            ),
          },
        },
        include: taskInclude,
      });
      return record(task);
    });
  }

  update(familyId: string, taskId: string, input: TaskPatch): Promise<TaskRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.task.findFirst({
        where: { id: taskId, familyId, deletedAt: null },
        select: { taskTypeId: true },
      });
      if (!current) return null;
      if (input.assignments || input.taskTypeId !== undefined) {
        await validateRelations(
          transaction,
          familyId,
          input.taskTypeId ?? current.taskTypeId,
          input.assignments ?? [],
        );
      }
      await transaction.task.update({
        where: { id: taskId },
        data: {
          ...(input.taskTypeId === undefined ? {} : { taskTypeId: input.taskTypeId }),
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.submissionGuide === undefined
            ? {}
            : { submissionGuide: input.submissionGuide }),
          ...(input.checkType === undefined ? {} : { checkType: input.checkType }),
          ...(input.verifyMode === undefined ? {} : { verifyMode: input.verifyMode }),
          ...(input.collaborationMode === undefined
            ? {}
            : { collaborationMode: input.collaborationMode }),
          ...(input.frequency === undefined
            ? {}
            : { frequency: input.frequency as Prisma.InputJsonObject }),
          ...(input.basePoints === undefined ? {} : { basePoints: input.basePoints }),
        },
      });
      if (input.assignments) {
        await transaction.taskAssignment.updateMany({
          where: {
            taskId,
            familyId,
            childId: { notIn: input.assignments.map(({ childId }) => childId) },
          },
          data: { deletedAt: new Date() },
        });
        for (const assignment of input.assignments) {
          const data = assignmentData(familyId, taskId, assignment);
          await transaction.taskAssignment.upsert({
            where: { taskId_childId: { taskId, childId: assignment.childId } },
            create: data,
            update: data,
          });
        }
      }
      const task = await transaction.task.findUnique({
        where: { id: taskId },
        include: taskInclude,
      });
      return task ? record(task) : null;
    });
  }

  async setStatus(familyId: string, taskId: string, status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED') {
    const result = await this.prisma.task.updateMany({
      where: { id: taskId, familyId, deletedAt: null },
      data: { status },
    });
    return result.count === 1 ? this.findById(familyId, taskId) : null;
  }
}
