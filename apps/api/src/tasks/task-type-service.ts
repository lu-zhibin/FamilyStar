import type {
  TaskTypeCreateInput,
  TaskTypeDependencies,
  TaskTypeOperations,
  TaskTypePatch,
} from './types.js';

export class TaskTypeSessionRequiredError extends Error {
  constructor() {
    super('An active parent session is required.');
    this.name = 'TaskTypeSessionRequiredError';
  }
}

export class TaskTypeNotFoundError extends Error {
  constructor() {
    super('The task type was not found.');
    this.name = 'TaskTypeNotFoundError';
  }
}

export class InvalidTaskTypeError extends Error {
  constructor() {
    super('Invalid task type.');
    this.name = 'InvalidTaskTypeError';
  }
}

export class TaskTypeDeleteConflictError extends Error {
  readonly taskCount: number;

  constructor(taskCount: number) {
    super('The task type is used by active tasks.');
    this.name = 'TaskTypeDeleteConflictError';
    this.taskCount = taskCount;
  }
}

export class PresetTaskTypeDeleteError extends Error {
  constructor() {
    super('Preset task types cannot be deleted.');
    this.name = 'PresetTaskTypeDeleteError';
  }
}

function normalizeText(value: string): string {
  return value.trim();
}

function validateCreate(input: TaskTypeCreateInput): TaskTypeCreateInput {
  const name = normalizeText(input.name);
  const icon = normalizeText(input.icon);
  if (
    name.length === 0 ||
    name.length > 80 ||
    icon.length === 0 ||
    icon.length > 80 ||
    (input.sortOrder !== undefined &&
      (!Number.isSafeInteger(input.sortOrder) || input.sortOrder < 0))
  ) {
    throw new InvalidTaskTypeError();
  }
  return {
    name,
    icon,
    ...(input.defaultVerifyMode === undefined
      ? {}
      : { defaultVerifyMode: input.defaultVerifyMode }),
    ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
  };
}

function validatePatch(input: TaskTypePatch): TaskTypePatch {
  if (Object.keys(input).length === 0) throw new InvalidTaskTypeError();
  const normalized = validateCreate({
    name: input.name ?? 'valid',
    icon: input.icon ?? 'valid',
    ...(input.defaultVerifyMode === undefined
      ? {}
      : { defaultVerifyMode: input.defaultVerifyMode }),
    ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
  });
  return {
    ...(input.name === undefined ? {} : { name: normalized.name }),
    ...(input.icon === undefined ? {} : { icon: normalized.icon }),
    ...(input.defaultVerifyMode === undefined
      ? {}
      : { defaultVerifyMode: normalized.defaultVerifyMode }),
    ...(input.sortOrder === undefined ? {} : { sortOrder: normalized.sortOrder }),
  };
}

export class TaskTypeService implements TaskTypeOperations {
  constructor(private readonly dependencies: TaskTypeDependencies) {}

  async list(input: { sessionToken?: string }) {
    const familyId = await this.requireParentFamily(input.sessionToken);
    return { taskTypes: await this.dependencies.repository.list(familyId) };
  }

  async create(input: { sessionToken?: string; taskType: TaskTypeCreateInput }) {
    const familyId = await this.requireParentFamily(input.sessionToken);
    return {
      taskType: await this.dependencies.repository.create(familyId, validateCreate(input.taskType)),
    };
  }

  async update(input: { sessionToken?: string; taskTypeId: string; taskType: TaskTypePatch }) {
    const familyId = await this.requireParentFamily(input.sessionToken);
    const existing = await this.dependencies.repository.findById(familyId, input.taskTypeId);
    if (!existing) throw new TaskTypeNotFoundError();
    const patch = validatePatch({
      ...input.taskType,
      name: input.taskType.name ?? existing.name,
      icon: input.taskType.icon ?? existing.icon,
    });
    const taskType = await this.dependencies.repository.update(familyId, input.taskTypeId, patch);
    if (!taskType) throw new TaskTypeNotFoundError();
    return { taskType };
  }

  async remove(input: { sessionToken?: string; taskTypeId: string }): Promise<void> {
    const familyId = await this.requireParentFamily(input.sessionToken);
    const existing = await this.dependencies.repository.findById(familyId, input.taskTypeId);
    if (!existing) throw new TaskTypeNotFoundError();
    if (existing.templateCode) throw new PresetTaskTypeDeleteError();
    const taskCount = await this.dependencies.repository.countActiveTasks(
      familyId,
      input.taskTypeId,
    );
    if (taskCount > 0) throw new TaskTypeDeleteConflictError(taskCount);
    if (!(await this.dependencies.repository.softDelete(familyId, input.taskTypeId))) {
      throw new TaskTypeNotFoundError();
    }
  }

  private async requireParentFamily(token?: string): Promise<string> {
    const session = token ? await this.dependencies.sessions.read(token) : null;
    if (!session || session.role !== 'parent') throw new TaskTypeSessionRequiredError();
    return session.familyId;
  }
}
