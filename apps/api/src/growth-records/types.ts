import type { GrowthRecordType } from '@prisma/client';
import type { CursorPage } from '@familystar/shared';

import type { SessionStore } from '../family-auth/types.js';

export const MANUAL_GROWTH_RECORD_TYPES = ['NOTE', 'MILESTONE'] as const;

export type ManualGrowthRecordType = (typeof MANUAL_GROWTH_RECORD_TYPES)[number];

export type GrowthRecordMedia = Readonly<{
  id: string;
  type: 'IMAGE' | 'VIDEO' | 'AUDIO';
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  createdAt: Date;
}>;

export type GrowthRecordItem = Readonly<{
  id: string;
  familyId: string;
  child: Readonly<{ id: string; nickname: string }>;
  task: Readonly<{ id: string; name: string }> | null;
  type: GrowthRecordType;
  title: string;
  contentText: string | null;
  occurredOn: Date;
  sourceType: string | null;
  sourceId: string | null;
  pointsEarned: number | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  media: readonly GrowthRecordMedia[];
}>;

export type GrowthRecordCursor = Readonly<{ occurredOn: Date; id: string }>;

export type GrowthRecordFilters = Readonly<{
  childId?: string;
  taskId?: string;
  type?: GrowthRecordType;
  startDate?: Date;
  endDateExclusive?: Date;
}>;

export type ManualGrowthRecordInput = Readonly<{
  childId: string;
  taskId?: string | null;
  type: ManualGrowthRecordType;
  title: string;
  contentText?: string | null;
  occurredOn: Date;
  mediaIds: readonly string[];
}>;

export type ManualGrowthRecordPatch = Readonly<{
  childId?: string;
  taskId?: string | null;
  type?: ManualGrowthRecordType;
  title?: string;
  contentText?: string | null;
  occurredOn?: Date;
  mediaIds?: readonly string[];
}>;

export type GrowthRecordRepository = {
  findFamilySettings(familyId: string): Promise<Record<string, unknown> | null>;
  findMany(input: {
    familyId: string;
    filters: GrowthRecordFilters;
    cursor: GrowthRecordCursor | null;
    limit: number;
  }): Promise<readonly GrowthRecordItem[]>;
  createManual(input: {
    familyId: string;
    parentId: string;
    record: ManualGrowthRecordInput;
  }): Promise<GrowthRecordItem>;
  updateManual(input: {
    familyId: string;
    recordId: string;
    record: ManualGrowthRecordPatch;
  }): Promise<GrowthRecordItem | null>;
  softDeleteManual(familyId: string, recordId: string, now: Date): Promise<boolean>;
};

export type GrowthRecordQuery = Readonly<{
  childId?: string;
  taskId?: string;
  type?: GrowthRecordType;
  startDate?: string;
  endDate?: string;
  cursor: Readonly<{ sortValue: string; id: string }> | null;
  limit: number;
}>;

export type GrowthRecordOperations = {
  list(input: GrowthRecordQuery & { sessionToken?: string }): Promise<{
    items: readonly GrowthRecordItem[];
    page: CursorPage;
  }>;
  create(input: {
    sessionToken?: string;
    record: Omit<ManualGrowthRecordInput, 'occurredOn'> & { occurredOn: string };
  }): Promise<{ record: GrowthRecordItem }>;
  update(input: {
    sessionToken?: string;
    recordId: string;
    record: Omit<ManualGrowthRecordPatch, 'occurredOn'> & { occurredOn?: string };
  }): Promise<{ record: GrowthRecordItem }>;
  remove(input: { sessionToken?: string; recordId: string }): Promise<void>;
};

export type GrowthRecordDependencies = Readonly<{
  repository: GrowthRecordRepository;
  sessions: SessionStore;
  now?: () => Date;
}>;
