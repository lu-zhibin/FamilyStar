import { describe, expect, it } from 'vitest';

import { CollaborationScheduler } from './collaboration-scheduler.js';
import type {
  CollaborationRoundRecord,
  CollaborationSchedulerRepository,
  TaskRecord,
} from './types.js';

function task(): TaskRecord {
  return {
    id: 'task-1',
    familyId: 'family-1',
    taskTypeId: 'type-1',
    name: '一起整理房间',
    description: null,
    submissionGuide: null,
    checkType: 'PHOTO',
    verifyMode: 'MANUAL',
    collaborationMode: 'COLLAB',
    frequency: { kind: 'weekdays', weekdays: [5] },
    basePoints: 10,
    status: 'ACTIVE',
    assignments: [
      {
        id: 'a-1',
        taskId: 'task-1',
        childId: 'child-1',
        customPoints: 15,
        startDate: '2026-07-01',
      },
      { id: 'a-2', taskId: 'task-1', childId: 'child-2', startDate: '2026-07-01' },
    ],
  };
}

function repository(): CollaborationSchedulerRepository & { rounds: CollaborationRoundRecord[] } {
  return {
    rounds: [],
    async listDueCollaborationTasks() {
      return [task()];
    },
    async findRound(taskId, startDate) {
      return (
        this.rounds.find((round) => round.taskId === taskId && round.startDate === startDate) ??
        null
      );
    },
    async createRound(input) {
      const value: CollaborationRoundRecord = {
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
      this.rounds.push(value);
      return value;
    },
  };
}

describe('CollaborationScheduler', () => {
  it('creates participant and reward snapshots for a due collaboration task', async () => {
    const result = await new CollaborationScheduler(repository()).generate({
      familyId: 'family-1',
      date: '2026-07-31',
    });
    expect(result[0]).toMatchObject({
      roundNumber: 20260731,
      participants: [
        { childId: 'child-1', rewardPointsSnapshot: 15 },
        { childId: 'child-2', rewardPointsSnapshot: 10 },
      ],
    });
  });

  it('returns the existing round when scheduling the same task and date twice', async () => {
    const repo = repository();
    const scheduler = new CollaborationScheduler(repo);
    const first = await scheduler.generate({ familyId: 'family-1', date: '2026-07-31' });
    const second = await scheduler.generate({ familyId: 'family-1', date: '2026-07-31' });
    expect(second[0]).toEqual(first[0]);
    expect(repo.rounds).toHaveLength(1);
  });
});
