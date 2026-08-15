import type { CollaborationMode, TaskStatus, VerifyMode } from '@prisma/client';

import { isScheduledOnDate, normalizeFrequency } from './frequency.js';
import type {
  ChildTaskRecord,
  TaskCreateInput,
  TaskDependencies,
  TaskOperations,
  TaskPatch,
  TaskRecord,
} from './types.js';

export class TaskSessionRequiredError extends Error {
  constructor() {
    super('An active parent session is required.');
    this.name = 'TaskSessionRequiredError';
  }
}

export class ChildTaskSessionRequiredError extends Error {
  constructor() {
    super('An active child session is required.');
    this.name = 'ChildTaskSessionRequiredError';
  }
}

export class TaskNotFoundError extends Error {
  constructor() {
    super('The task was not found.');
    this.name = 'TaskNotFoundError';
  }
}

export class InvalidTaskError extends Error {
  constructor() {
    super('Invalid task.');
    this.name = 'InvalidTaskError';
  }
}

export class TaskStateConflictError extends Error {
  constructor() {
    super('The task cannot be changed in its current state.');
    this.name = 'TaskStateConflictError';
  }
}

function text(value: string, max: number): string {
  const result = value.trim();
  if (result.length === 0 || result.length > max) throw new InvalidTaskError();
  return result;
}

function validateAssignments(input: TaskCreateInput): TaskCreateInput {
  if (input.assignments.length === 0) throw new InvalidTaskError();
  if (input.collaborationMode === 'COLLAB' && input.assignments.length < 2) {
    throw new InvalidTaskError();
  }
  const children = new Set<string>();
  const assignments = input.assignments.map((assignment) => {
    if (children.has(assignment.childId)) throw new InvalidTaskError();
    children.add(assignment.childId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(assignment.startDate)) throw new InvalidTaskError();
    if (assignment.endDate !== undefined && assignment.endDate < assignment.startDate) {
      throw new InvalidTaskError();
    }
    if (
      assignment.customPoints !== undefined &&
      (!Number.isSafeInteger(assignment.customPoints) || assignment.customPoints <= 0)
    ) {
      throw new InvalidTaskError();
    }
    return {
      ...assignment,
      ...(assignment.customFrequency === undefined
        ? {}
        : { customFrequency: normalizeFrequency(assignment.customFrequency) }),
    };
  });
  return { ...input, assignments };
}

function normalizeCreate(input: TaskCreateInput): TaskCreateInput {
  const name = text(input.name, 120);
  if (!name || !Number.isSafeInteger(input.basePoints) || input.basePoints <= 0) {
    throw new InvalidTaskError();
  }
  return validateAssignments({
    ...input,
    name,
    ...(input.description === undefined ? {} : { description: text(input.description, 10_000) }),
    ...(input.submissionGuide === undefined
      ? {}
      : { submissionGuide: text(input.submissionGuide, 10_000) }),
    verifyMode: input.verifyMode ?? ('MANUAL' as VerifyMode),
    collaborationMode: input.collaborationMode ?? ('SOLO' as CollaborationMode),
    frequency: normalizeFrequency(input.frequency),
  });
}

function normalizePatch(input: TaskPatch): TaskPatch {
  if (Object.keys(input).length === 0) throw new InvalidTaskError();
  return {
    ...(input.name === undefined ? {} : { name: text(input.name, 120) }),
    ...(input.description === undefined
      ? {}
      : { description: input.description === null ? null : text(input.description, 10_000) }),
    ...(input.submissionGuide === undefined
      ? {}
      : {
          submissionGuide:
            input.submissionGuide === null ? null : text(input.submissionGuide, 10_000),
        }),
    ...(input.basePoints === undefined ? {} : { basePoints: input.basePoints }),
    ...(input.taskTypeId === undefined ? {} : { taskTypeId: input.taskTypeId }),
    ...(input.checkType === undefined ? {} : { checkType: input.checkType }),
    ...(input.verifyMode === undefined ? {} : { verifyMode: input.verifyMode }),
    ...(input.collaborationMode === undefined
      ? {}
      : { collaborationMode: input.collaborationMode }),
    ...(input.frequency === undefined ? {} : { frequency: normalizeFrequency(input.frequency) }),
    ...(input.assignments === undefined ? {} : { assignments: input.assignments }),
  };
}

export class TaskService implements TaskOperations {
  constructor(private readonly dependencies: TaskDependencies) {}

  async list(input: { sessionToken?: string }) {
    const familyId = await this.requireParentFamily(input.sessionToken);
    return { tasks: await this.dependencies.repository.list(familyId) };
  }

  async listMine(input: { sessionToken?: string; date: string }) {
    const session = await this.requireChildSession(input.sessionToken);
    const tasks = await this.dependencies.repository.listForChild(
      session.familyId,
      session.subjectId,
    );
    const visibleTasks: ChildTaskRecord[] = [];
    for (const task of tasks) {
      if (task.status !== 'ACTIVE') continue;
      const assignment = task.assignments.find(
        (value) =>
          value.childId === session.subjectId &&
          value.startDate <= input.date &&
          (value.endDate === undefined || value.endDate >= input.date),
      );
      if (!assignment) continue;
      const frequency = assignment.customFrequency ?? task.frequency;
      if (!isScheduledOnDate(frequency, input.date)) continue;
      visibleTasks.push({
        taskId: task.id,
        taskAssignmentId: assignment.id,
        name: task.name,
        description: task.description,
        submissionGuide: task.submissionGuide,
        collaborationMode: task.collaborationMode,
        frequency,
        points: assignment.customPoints ?? task.basePoints,
        checkType: assignment.customCheckType ?? task.checkType,
        verifyMode: assignment.customVerifyMode ?? task.verifyMode,
        startDate: assignment.startDate,
        endDate: assignment.endDate ?? null,
      });
    }
    const collaborationTaskIds = visibleTasks
      .filter(({ collaborationMode }) => collaborationMode === 'COLLAB')
      .map(({ taskId }) => taskId);
    const rounds = await this.dependencies.repository.listCollaborationRoundsForChild(
      session.familyId,
      session.subjectId,
      collaborationTaskIds,
      input.date,
    );
    const roundByTaskId = new Map<string, (typeof rounds)[number]>();
    for (const round of rounds) {
      if (!roundByTaskId.has(round.taskId)) roundByTaskId.set(round.taskId, round);
    }
    return {
      date: input.date,
      tasks: visibleTasks.map((task) =>
        task.collaborationMode === 'COLLAB'
          ? { ...task, collaborationRound: roundByTaskId.get(task.taskId) ?? null }
          : task,
      ),
    };
  }

  async create(input: { sessionToken?: string; task: TaskCreateInput }) {
    const familyId = await this.requireParentFamily(input.sessionToken);
    return {
      task: await this.dependencies.repository.create(familyId, normalizeCreate(input.task)),
    };
  }

  async update(input: { sessionToken?: string; taskId: string; task: TaskPatch }) {
    const familyId = await this.requireParentFamily(input.sessionToken);
    const current = await this.requireTask(familyId, input.taskId);
    if (current.status === 'ARCHIVED') throw new TaskStateConflictError();
    const patch = normalizePatch(input.task);
    if (
      patch.basePoints !== undefined &&
      (!Number.isSafeInteger(patch.basePoints) || patch.basePoints <= 0)
    ) {
      throw new InvalidTaskError();
    }
    if (patch.assignments !== undefined || patch.collaborationMode !== undefined) {
      validateAssignments({
        taskTypeId: patch.taskTypeId ?? current.taskTypeId,
        name: patch.name ?? current.name,
        checkType: patch.checkType ?? current.checkType,
        verifyMode: patch.verifyMode ?? current.verifyMode,
        collaborationMode: patch.collaborationMode ?? current.collaborationMode,
        frequency: patch.frequency ?? current.frequency,
        basePoints: patch.basePoints ?? current.basePoints,
        assignments: patch.assignments ?? current.assignments,
      });
    }
    const task = await this.dependencies.repository.update(familyId, input.taskId, patch);
    if (!task) throw new TaskNotFoundError();
    return { task };
  }

  async setStatus(input: {
    sessionToken?: string;
    taskId: string;
    status: Extract<TaskStatus, 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'>;
  }) {
    const familyId = await this.requireParentFamily(input.sessionToken);
    const current = await this.requireTask(familyId, input.taskId);
    if (current.status === 'ARCHIVED' && input.status !== 'ARCHIVED') {
      throw new TaskStateConflictError();
    }
    const task = await this.dependencies.repository.setStatus(familyId, input.taskId, input.status);
    if (!task) throw new TaskNotFoundError();
    return { task };
  }

  private async requireTask(familyId: string, taskId: string): Promise<TaskRecord> {
    const task = await this.dependencies.repository.findById(familyId, taskId);
    if (!task) throw new TaskNotFoundError();
    return task;
  }

  private async requireParentFamily(token?: string): Promise<string> {
    const session = token ? await this.dependencies.sessions.read(token) : null;
    if (!session || session.role !== 'parent') throw new TaskSessionRequiredError();
    return session.familyId;
  }

  private async requireChildSession(token?: string) {
    const session = token ? await this.dependencies.sessions.read(token) : null;
    if (!session || session.role !== 'child') throw new ChildTaskSessionRequiredError();
    return session;
  }
}
