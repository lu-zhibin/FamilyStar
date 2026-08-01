import { isScheduledOnDate } from './frequency.js';
import type {
  CollaborationRoundRecord,
  CollaborationSchedulerRepository,
  TaskAssignmentRecord,
  TaskRecord,
} from './types.js';

function activeOnDate(assignment: TaskAssignmentRecord, date: string): boolean {
  return (
    assignment.startDate <= date &&
    (assignment.endDate === undefined || assignment.endDate >= date) &&
    isScheduledOnDate(assignment.customFrequency ?? { kind: 'daily' }, date)
  );
}

function roundNumber(date: string): number {
  return Number(date.replaceAll('-', ''));
}

export class CollaborationScheduler {
  constructor(private readonly repository: CollaborationSchedulerRepository) {}

  async generate(input: {
    familyId: string;
    date: string;
  }): Promise<readonly CollaborationRoundRecord[]> {
    const tasks = await this.repository.listDueCollaborationTasks(input.familyId, input.date);
    const rounds: CollaborationRoundRecord[] = [];
    for (const task of tasks) {
      if (!isScheduledOnDate(task.frequency, input.date)) continue;
      const scheduledTask = this.withActiveParticipants(task, input.date);
      if (scheduledTask.assignments.length < 2) continue;
      const existing = await this.repository.findRound(task.id, input.date);
      rounds.push(
        existing ??
          (await this.repository.createRound({
            task: scheduledTask,
            startDate: input.date,
            endDate: input.date,
            roundNumber: roundNumber(input.date),
          })),
      );
    }
    return rounds;
  }

  private withActiveParticipants(task: TaskRecord, date: string): TaskRecord {
    return {
      ...task,
      assignments: task.assignments.filter((assignment) => {
        const frequency = assignment.customFrequency ?? task.frequency;
        return activeOnDate({ ...assignment, customFrequency: frequency }, date);
      }),
    };
  }
}
