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

export type SubmissionReviewRepository = {
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
