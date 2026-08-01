import type {
  CollaborationMode,
  CollaborationRoundStatus,
  TaskCheckType,
  TaskStatus,
  TaskTypeTemplate,
  VerifyMode,
} from '@prisma/client';

export type TaskTypeRecord = Readonly<{
  id: string;
  familyId: string;
  templateCode: string | null;
  name: string;
  icon: string;
  defaultVerifyMode: VerifyMode;
  isEnabled: boolean;
  sortOrder: number;
}>;

export type TaskTypeCreateInput = Readonly<{
  name: string;
  icon: string;
  defaultVerifyMode?: VerifyMode;
  sortOrder?: number;
}>;

export type TaskTypePatch = Partial<TaskTypeCreateInput>;

export type TaskTypeRepository = {
  list(familyId: string): Promise<readonly TaskTypeRecord[]>;
  findById(familyId: string, taskTypeId: string): Promise<TaskTypeRecord | null>;
  create(familyId: string, input: TaskTypeCreateInput): Promise<TaskTypeRecord>;
  update(
    familyId: string,
    taskTypeId: string,
    input: TaskTypePatch,
  ): Promise<TaskTypeRecord | null>;
  countActiveTasks(familyId: string, taskTypeId: string): Promise<number>;
  softDelete(familyId: string, taskTypeId: string): Promise<boolean>;
};

export type TaskTypeOperations = {
  list(input: { sessionToken?: string }): Promise<{ taskTypes: readonly TaskTypeRecord[] }>;
  create(input: {
    sessionToken?: string;
    taskType: TaskTypeCreateInput;
  }): Promise<{ taskType: TaskTypeRecord }>;
  update(input: {
    sessionToken?: string;
    taskTypeId: string;
    taskType: TaskTypePatch;
  }): Promise<{ taskType: TaskTypeRecord }>;
  remove(input: { sessionToken?: string; taskTypeId: string }): Promise<void>;
};

export type TaskTypeDependencies = {
  repository: TaskTypeRepository;
  sessions: {
    read(token: string): Promise<{
      subjectId: string;
      familyId: string;
      role: 'parent' | 'child';
      issuedAt: string;
    } | null>;
  };
};

export type TaskTypeTemplateDefaults = Pick<
  TaskTypeTemplate,
  'name' | 'icon' | 'defaultVerifyMode' | 'sortOrder'
>;

export type TaskFrequency =
  | Readonly<{ kind: 'daily' }>
  | Readonly<{ kind: 'weekly_count'; count: number }>
  | Readonly<{ kind: 'weekdays'; weekdays: readonly number[] }>
  | Readonly<{ kind: 'date_range'; startDate: string; endDate: string }>;

export type TaskAssignmentInput = Readonly<{
  childId: string;
  customPoints?: number;
  customFrequency?: TaskFrequency;
  customCheckType?: TaskCheckType;
  customVerifyMode?: VerifyMode;
  startDate: string;
  endDate?: string;
}>;

export type TaskAssignmentRecord = TaskAssignmentInput & Readonly<{ id: string; taskId: string }>;

export type TaskRecord = Readonly<{
  id: string;
  familyId: string;
  taskTypeId: string;
  name: string;
  description: string | null;
  submissionGuide: string | null;
  checkType: TaskCheckType;
  verifyMode: VerifyMode;
  collaborationMode: CollaborationMode;
  frequency: TaskFrequency;
  basePoints: number;
  status: TaskStatus;
  assignments: readonly TaskAssignmentRecord[];
}>;

export type TaskCreateInput = Readonly<{
  taskTypeId: string;
  name: string;
  description?: string;
  submissionGuide?: string;
  checkType: TaskCheckType;
  verifyMode?: VerifyMode;
  collaborationMode?: CollaborationMode;
  frequency: TaskFrequency;
  basePoints: number;
  assignments: readonly TaskAssignmentInput[];
}>;

export type TaskPatch = Partial<Omit<TaskCreateInput, 'assignments'>> & {
  assignments?: readonly TaskAssignmentInput[];
};

export type TaskRepository = {
  list(familyId: string): Promise<readonly TaskRecord[]>;
  findById(familyId: string, taskId: string): Promise<TaskRecord | null>;
  create(familyId: string, input: TaskCreateInput): Promise<TaskRecord>;
  update(familyId: string, taskId: string, input: TaskPatch): Promise<TaskRecord | null>;
  setStatus(familyId: string, taskId: string, status: TaskStatus): Promise<TaskRecord | null>;
};

export type TaskOperations = {
  list(input: { sessionToken?: string }): Promise<{ tasks: readonly TaskRecord[] }>;
  create(input: { sessionToken?: string; task: TaskCreateInput }): Promise<{ task: TaskRecord }>;
  update(input: {
    sessionToken?: string;
    taskId: string;
    task: TaskPatch;
  }): Promise<{ task: TaskRecord }>;
  setStatus(input: {
    sessionToken?: string;
    taskId: string;
    status: Extract<TaskStatus, 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'>;
  }): Promise<{ task: TaskRecord }>;
};

export type TaskDependencies = {
  repository: TaskRepository;
  sessions: TaskTypeDependencies['sessions'];
};

export type CollaborationRoundRecord = Readonly<{
  id: string;
  taskId: string;
  familyId: string;
  roundNumber: number;
  startDate: string;
  endDate: string;
  status: CollaborationRoundStatus;
  participants: readonly Readonly<{
    childId: string;
    rewardPointsSnapshot: number;
  }>[];
}>;

export type CollaborationSchedulerRepository = {
  listDueCollaborationTasks(familyId: string, date: string): Promise<readonly TaskRecord[]>;
  findRound(taskId: string, startDate: string): Promise<CollaborationRoundRecord | null>;
  createRound(input: {
    task: TaskRecord;
    startDate: string;
    endDate: string;
    roundNumber: number;
  }): Promise<CollaborationRoundRecord>;
};
