import type { Prisma, PrismaClient } from '@prisma/client';

import { InvalidTaskError, TaskStateConflictError } from './task-service.js';
import type {
  ChildCollaborationRoundRecord,
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

function semanticAssignment(input: TaskAssignmentInput) {
  return {
    childId: input.childId,
    customPoints: input.customPoints ?? null,
    customFrequency: input.customFrequency ?? null,
    customCheckType: input.customCheckType ?? null,
    customVerifyMode: input.customVerifyMode ?? null,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
  };
}

function changesHistoricalMeaning(current: TaskRecord, input: TaskPatch): boolean {
  const fields = [
    ['taskTypeId', current.taskTypeId],
    ['name', current.name],
    ['checkType', current.checkType],
    ['verifyMode', current.verifyMode],
    ['collaborationMode', current.collaborationMode],
    ['basePoints', current.basePoints],
  ] as const;
  if (fields.some(([key, value]) => input[key] !== undefined && input[key] !== value)) return true;
  if (
    input.frequency !== undefined &&
    JSON.stringify(input.frequency) !== JSON.stringify(current.frequency)
  ) {
    return true;
  }
  if (input.assignments !== undefined) {
    const next = [...input.assignments]
      .map(semanticAssignment)
      .sort((left, right) => left.childId.localeCompare(right.childId));
    const existing = [...current.assignments]
      .map(semanticAssignment)
      .sort((left, right) => left.childId.localeCompare(right.childId));
    return JSON.stringify(next) !== JSON.stringify(existing);
  }
  return false;
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

  async listCollaborationRoundsForChild(
    familyId: string,
    childId: string,
    taskIds: readonly string[],
    dateValue: string,
  ): Promise<readonly ChildCollaborationRoundRecord[]> {
    if (taskIds.length === 0) return [];
    const roundDate = new Date(`${dateValue}T00:00:00.000Z`);
    const rounds = await this.prisma.collaborationRound.findMany({
      where: {
        familyId,
        taskId: { in: [...taskIds] },
        startDate: { lte: roundDate },
        endDate: { gte: roundDate },
        participants: { some: { familyId, childId, status: 'ACTIVE' } },
      },
      select: {
        id: true,
        taskId: true,
        status: true,
        startDate: true,
        endDate: true,
        participants: {
          where: { familyId, status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
          select: { childId: true, child: { select: { nickname: true } } },
        },
        submissions: {
          where: { familyId },
          select: {
            id: true,
            childId: true,
            status: true,
            submittedAt: true,
            reviewComment: true,
          },
        },
      },
      orderBy: [{ taskId: 'asc' }, { startDate: 'desc' }],
    });
    return rounds.map((round) => {
      const submissionByChild = new Map(
        round.submissions.map((submission) => [submission.childId, submission]),
      );
      const mySubmission = submissionByChild.get(childId);
      return {
        id: round.id,
        taskId: round.taskId,
        status: round.status,
        startDate: date(round.startDate),
        endDate: date(round.endDate),
        participants: round.participants.map((participant) => ({
          nickname: participant.child.nickname,
          isCurrentChild: participant.childId === childId,
          submissionStatus: submissionByChild.get(participant.childId)?.status ?? null,
        })),
        mySubmission: mySubmission
          ? {
              id: mySubmission.id,
              status: mySubmission.status,
              submittedAt: mySubmission.submittedAt,
              reviewComment: mySubmission.reviewComment,
            }
          : null,
      };
    });
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
        include: {
          ...taskInclude,
          _count: { select: { checkIns: true, collaborationRounds: true } },
        },
      });
      if (!current) return null;
      if (
        (current._count.checkIns > 0 || current._count.collaborationRounds > 0) &&
        changesHistoricalMeaning(record(current), input)
      ) {
        throw new TaskStateConflictError();
      }
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
