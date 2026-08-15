import type { SessionStore } from '../family-auth/types.js';
import type { RedisKeyspace } from '../infrastructure/redis/keys.js';
import type { RedisCommandPort } from '../infrastructure/redis/primitives.js';

export type ReviewTargetType = 'CHECK_IN' | 'COLLABORATION_SUBMISSION';
export type ReviewDecision = 'APPROVED' | 'REJECTED';
export type ReviewSource = 'PARENT' | 'TIMEOUT';

export type SubmissionReviewRecord = Readonly<{
  id: string;
  familyId: string;
  targetType: ReviewTargetType;
  targetId: string;
  attemptId: string;
  idempotencyKey: string;
  decision: ReviewDecision;
  source: ReviewSource;
  reason: string | null;
  reviewerId: string | null;
  reviewedAt: Date;
}>;

export type PendingSubmissionReviewItem = Readonly<{
  targetType: ReviewTargetType;
  targetId: string;
  attemptId: string;
  task: Readonly<{ id: string; name: string }>;
  child: Readonly<{ id: string; nickname: string }>;
  contentText: string | null;
  media: readonly Readonly<{
    id: string;
    type: 'IMAGE' | 'VIDEO' | 'AUDIO';
    mimeType: string;
  }>[];
  submittedAt: Date;
}>;

export type PendingSubmissionReviewRecord = PendingSubmissionReviewItem &
  Readonly<{
    reviewDeadlineAt: Date | null;
    isOverdue: boolean;
  }>;

export type ReviewHistoryRecord = SubmissionReviewRecord &
  Readonly<{
    task: Readonly<{ id: string; name: string }>;
    child: Readonly<{ id: string; nickname: string }>;
  }>;

export type ReviewHistoryCursor = Readonly<{
  reviewedAt: Date;
  reviewId: string;
}>;

export type ReviewHistoryQuery = Readonly<{
  childId?: string;
  taskId?: string;
  decision?: ReviewDecision;
  startDate?: string;
  endDate?: string;
  cursor: Readonly<{ sortValue: string; id: string }> | null;
  limit: number;
}>;

export type SubmissionReviewRepository = {
  listPendingReviews(
    familyId: string,
    limit: number,
  ): Promise<readonly PendingSubmissionReviewItem[]>;
  findFamilySettings(familyId: string): Promise<Record<string, unknown> | null>;
  listReviewHistory(input: {
    familyId: string;
    childId?: string;
    taskId?: string;
    decision?: ReviewDecision;
    startAt?: Date;
    endAtExclusive?: Date;
    cursor: ReviewHistoryCursor | null;
    limit: number;
  }): Promise<readonly ReviewHistoryRecord[]>;
  findByIdempotencyKey(
    familyId: string,
    idempotencyKey: string,
  ): Promise<SubmissionReviewRecord | null>;
  reviewCheckIn(input: {
    familyId: string;
    checkInId: string;
    reviewerId: string;
    idempotencyKey: string;
    decision: ReviewDecision;
    reason?: string;
    reviewedAt: Date;
  }): Promise<SubmissionReviewRecord>;
  reviewCollaborationSubmission(input: {
    familyId: string;
    submissionId: string;
    reviewerId: string;
    idempotencyKey: string;
    decision: ReviewDecision;
    reason?: string;
    reviewedAt: Date;
  }): Promise<SubmissionReviewRecord>;
  listCheckInReviews(
    familyId: string,
    checkInId: string,
  ): Promise<readonly SubmissionReviewRecord[]>;
  listCollaborationSubmissionReviews(
    familyId: string,
    submissionId: string,
  ): Promise<readonly SubmissionReviewRecord[]>;
};

export type PendingReviewCandidate = Readonly<{
  familyId: string;
  familySettings: Record<string, unknown>;
  targetType: ReviewTargetType;
  targetId: string;
  attemptId: string;
  submittedAt: Date;
}>;

export type SubmissionReviewTimeoutRepository = {
  listPendingReviewCandidates(limit: number): Promise<readonly PendingReviewCandidate[]>;
  approveTimedOutSubmission(input: {
    candidate: PendingReviewCandidate;
    idempotencyKey: string;
    reviewedAt: Date;
  }): Promise<SubmissionReviewRecord | null>;
};

export type SubmissionReviewTimeoutBatch = {
  runBatch(): Promise<{ scanned: number; approved: number; skipped: number }>;
};

export type SubmissionReviewTimeoutDependencies = Readonly<{
  repository: SubmissionReviewTimeoutRepository;
  redis: RedisCommandPort;
  keys: RedisKeyspace;
  batchSize?: number;
  now?: () => Date;
  ownerTokenFactory?: () => string;
}>;

type ReviewInput = {
  sessionToken?: string;
  idempotencyKey: string;
  decision: ReviewDecision;
  reason?: string;
};

export type SubmissionReviewOperations = {
  listPendingReviews(input: { sessionToken?: string }): Promise<{
    reviews: readonly PendingSubmissionReviewRecord[];
  }>;
  listReviewHistory?(input: ReviewHistoryQuery & { sessionToken?: string }): Promise<{
    reviews: readonly ReviewHistoryRecord[];
    page: Readonly<{ has_more: boolean; next_cursor: string | null }>;
  }>;
  reviewCheckIn(input: ReviewInput & { checkInId: string }): Promise<{
    review: SubmissionReviewRecord;
  }>;
  reviewCollaborationSubmission(input: ReviewInput & { submissionId: string }): Promise<{
    review: SubmissionReviewRecord;
  }>;
  listCheckInReviews(input: { sessionToken?: string; checkInId: string }): Promise<{
    reviews: readonly SubmissionReviewRecord[];
  }>;
  listCollaborationSubmissionReviews(input: {
    sessionToken?: string;
    submissionId: string;
  }): Promise<{ reviews: readonly SubmissionReviewRecord[] }>;
};

export type SubmissionReviewDependencies = Readonly<{
  repository: SubmissionReviewRepository;
  sessions: SessionStore;
  redis: RedisCommandPort;
  keys: RedisKeyspace;
  now?: () => Date;
  ownerTokenFactory?: () => string;
}>;
