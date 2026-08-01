import type { Prisma, PrismaClient } from '@prisma/client';

import type {
  CollaborationRoundRecord,
  CollaborationSchedulerRepository,
  TaskRecord,
} from './types.js';

type RoundWithParticipants = Prisma.CollaborationRoundGetPayload<{
  include: { participants: true };
}>;

function date(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function roundRecord(value: RoundWithParticipants): CollaborationRoundRecord {
  return {
    id: value.id,
    taskId: value.taskId,
    familyId: value.familyId,
    roundNumber: value.roundNumber,
    startDate: date(value.startDate),
    endDate: date(value.endDate),
    status: value.status,
    participants: value.participants.map((participant) => ({
      childId: participant.childId,
      rewardPointsSnapshot: participant.rewardPointsSnapshot,
    })),
  };
}

export class PrismaCollaborationSchedulerRepository implements CollaborationSchedulerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listDueCollaborationTasks(
    familyId: string,
    dateValue: string,
  ): Promise<readonly TaskRecord[]> {
    const { PrismaTaskRepository } = await import('./prisma-task-repository.js');
    const tasks = await new PrismaTaskRepository(this.prisma).list(familyId);
    return tasks.filter(
      (task) =>
        task.status === 'ACTIVE' &&
        task.collaborationMode === 'COLLAB' &&
        task.assignments.some(
          (assignment) =>
            assignment.startDate <= dateValue &&
            (assignment.endDate === undefined || assignment.endDate >= dateValue),
        ),
    );
  }

  async findRound(taskId: string, startDate: string): Promise<CollaborationRoundRecord | null> {
    const value = await this.prisma.collaborationRound.findFirst({
      where: { taskId, startDate: new Date(`${startDate}T00:00:00.000Z`) },
      include: { participants: true },
    });
    return value ? roundRecord(value) : null;
  }

  async createRound(input: {
    task: TaskRecord;
    startDate: string;
    endDate: string;
    roundNumber: number;
  }): Promise<CollaborationRoundRecord> {
    try {
      const value = await this.prisma.collaborationRound.create({
        data: {
          familyId: input.task.familyId,
          taskId: input.task.id,
          roundNumber: input.roundNumber,
          startDate: new Date(`${input.startDate}T00:00:00.000Z`),
          endDate: new Date(`${input.endDate}T00:00:00.000Z`),
          status: 'ACTIVE',
          participants: {
            create: input.task.assignments.map((assignment) => ({
              familyId: input.task.familyId,
              childId: assignment.childId,
              rewardPointsSnapshot: assignment.customPoints ?? input.task.basePoints,
            })),
          },
        },
        include: { participants: true },
      });
      return roundRecord(value);
    } catch (error) {
      if (
        typeof error !== 'object' ||
        error === null ||
        !('code' in error) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
      const existing = await this.findRound(input.task.id, input.startDate);
      if (!existing) throw error;
      return existing;
    }
  }
}
