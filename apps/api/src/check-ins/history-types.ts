import type { CursorPage } from '@familystar/shared';

import type { SessionStore } from '../family-auth/types.js';

export const HISTORY_SUBMISSION_TYPES = ['SOLO', 'COLLABORATION'] as const;

export type HistorySubmissionType = (typeof HISTORY_SUBMISSION_TYPES)[number];

export type HistoryCursor = Readonly<{
  submittedAt: Date;
  submissionType: HistorySubmissionType;
  attemptId: string;
}>;

export type HistoryMedia = Readonly<{
  id: string;
  type: 'IMAGE' | 'VIDEO' | 'AUDIO';
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  createdAt: Date;
}>;

export type HistoryReview = Readonly<{
  id: string;
  decision: 'APPROVED' | 'REJECTED';
  source: 'PARENT' | 'TIMEOUT';
  reason: string | null;
  reviewerId: string | null;
  reviewedAt: Date;
}>;

export type HistoryItem = Readonly<{
  attemptId: string;
  submissionId: string;
  submissionType: HistorySubmissionType;
  attemptNumber: number;
  child: Readonly<{ id: string; nickname: string }>;
  task: Readonly<{ id: string; name: string }>;
  contentText: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submittedAt: Date;
  checkDate: Date;
  collaborationRound: Readonly<{
    id: string;
    roundNumber: number;
    startDate: Date;
    endDate: Date;
  }> | null;
  review: HistoryReview | null;
  pointsEarned: number | null;
  media: readonly HistoryMedia[];
}>;

export type HistoryFilters = Readonly<{
  childId?: string;
  taskId?: string;
  submissionType?: HistorySubmissionType;
  startDate?: Date;
  endDateExclusive?: Date;
}>;

export type HistoryRepository = {
  findFamilySettings(familyId: string): Promise<Record<string, unknown> | null>;
  findHistory(input: {
    familyId: string;
    filters: HistoryFilters;
    cursor: HistoryCursor | null;
    limit: number;
  }): Promise<readonly HistoryItem[]>;
};

export type HistoryQuery = Readonly<{
  childId?: string;
  taskId?: string;
  submissionType?: HistorySubmissionType;
  startDate?: string;
  endDate?: string;
  cursor: Readonly<{ sortValue: string; id: string }> | null;
  limit: number;
}>;

export type HistoryPage = Readonly<{
  items: readonly HistoryItem[];
  page: CursorPage;
}>;

export type HistoryOperations = {
  getMine(input: HistoryQuery & { sessionToken?: string }): Promise<HistoryPage>;
  getFamily(input: HistoryQuery & { sessionToken?: string }): Promise<HistoryPage>;
};

export type HistoryServiceDependencies = Readonly<{
  repository: HistoryRepository;
  sessions: SessionStore;
}>;
