import type {
  CollaborationRoundStatus,
  SubmissionStatus,
  TaskCheckType,
  VerifyMode,
} from '@prisma/client';

import type { SessionStore } from '../family-auth/types.js';
import type { FamilySettings } from '../family-settings/types.js';
import type { MediaAssetRecord } from '../media/types.js';
import type { TaskFrequency } from '../tasks/types.js';

export type SubmissionContent = Readonly<{
  text?: string;
  mediaIds: readonly string[];
}>;

export type SubmissionAttemptRecord = Readonly<{
  id: string;
  attemptNumber: number;
  idempotencyKey: string;
  text: string | null;
  mediaIds: readonly string[];
  status: SubmissionStatus;
  submittedAt: Date;
  priorStatus: SubmissionStatus | null;
  priorReviewerId: string | null;
  priorReviewedAt: Date | null;
  priorReviewComment: string | null;
}>;

export type CheckInRecord = Readonly<{
  id: string;
  familyId: string;
  assignmentId: string;
  childId: string;
  taskId: string;
  checkDate: string;
  isMakeup: boolean;
  text: string | null;
  mediaIds: readonly string[];
  status: SubmissionStatus;
  submittedAt: Date;
  attempts: readonly SubmissionAttemptRecord[];
}>;

export type SoloAssignmentContext = Readonly<{
  assignmentId: string;
  familyId: string;
  childId: string;
  taskId: string;
  taskStatus: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  collaborationMode: 'SOLO' | 'COLLAB';
  checkType: TaskCheckType;
  verifyMode: VerifyMode;
  rewardPoints: number;
  frequency: TaskFrequency;
  startDate: string;
  endDate: string | null;
  settings: FamilySettings;
}>;

export type CollaborationSubmissionRecord = Readonly<{
  id: string;
  familyId: string;
  roundId: string;
  childId: string;
  text: string | null;
  mediaIds: readonly string[];
  status: SubmissionStatus;
  submittedAt: Date;
  attempts: readonly SubmissionAttemptRecord[];
}>;

export type CollaborationParticipantState = Readonly<{
  childId: string;
  active: boolean;
  submissionStatus: SubmissionStatus | null;
}>;

export type CollaborationRoundContext = Readonly<{
  id: string;
  familyId: string;
  status: CollaborationRoundStatus;
  startDate: string;
  endDate: string;
  checkType: TaskCheckType;
  verifyMode: VerifyMode;
  childIsActiveParticipant: boolean;
  participants: readonly CollaborationParticipantState[];
}>;

export type CheckInRepository = {
  findSoloAssignment(
    familyId: string,
    childId: string,
    assignmentId: string,
  ): Promise<SoloAssignmentContext | null>;
  findReadyMedia(
    familyId: string,
    mediaIds: readonly string[],
  ): Promise<readonly MediaAssetRecord[]>;
  findCheckInByIdempotencyKey(
    familyId: string,
    idempotencyKey: string,
  ): Promise<CheckInRecord | null>;
  findCheckIn(familyId: string, childId: string, checkInId: string): Promise<CheckInRecord | null>;
  submitSolo(input: {
    context: SoloAssignmentContext;
    idempotencyKey: string;
    checkDate: string;
    isMakeup: boolean;
    status: SubmissionStatus;
    text?: string;
    mediaIds: readonly string[];
    submittedAt: Date;
  }): Promise<CheckInRecord>;
  findRound(
    familyId: string,
    childId: string,
    roundId: string,
  ): Promise<CollaborationRoundContext | null>;
  findCollaborationByIdempotencyKey(
    familyId: string,
    idempotencyKey: string,
  ): Promise<CollaborationSubmissionRecord | null>;
  submitCollaboration(input: {
    context: CollaborationRoundContext;
    childId: string;
    idempotencyKey: string;
    status: SubmissionStatus;
    text?: string;
    mediaIds: readonly string[];
    submittedAt: Date;
  }): Promise<CollaborationSubmissionRecord>;
  listCollaborationSubmissions(
    familyId: string,
    childId: string,
    roundId: string,
  ): Promise<readonly CollaborationSubmissionRecord[]>;
};

export type CheckInOperations = {
  submit(input: {
    sessionToken?: string;
    assignmentId: string;
    idempotencyKey: string;
    checkDate?: string;
    content: SubmissionContent;
  }): Promise<{ checkIn: CheckInRecord }>;
  get(input: { sessionToken?: string; checkInId: string }): Promise<{ checkIn: CheckInRecord }>;
  submitCollaboration(input: {
    sessionToken?: string;
    roundId: string;
    idempotencyKey: string;
    content: SubmissionContent;
  }): Promise<{ submission: CollaborationSubmissionRecord }>;
  listCollaboration(input: {
    sessionToken?: string;
    roundId: string;
  }): Promise<{ submissions: readonly CollaborationSubmissionRecord[] }>;
};

export type CheckInDependencies = Readonly<{
  repository: CheckInRepository;
  sessions: SessionStore;
  now?: () => Date;
}>;
