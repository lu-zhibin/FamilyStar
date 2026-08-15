import type { BadgeConditionType } from '@prisma/client';

import type { SessionStore } from '../family-auth/types.js';

export type ThresholdBadgeCondition = Readonly<{
  type: Exclude<BadgeConditionType, 'MANUAL'>;
  target: number;
}>;

export type BadgeCondition = ThresholdBadgeCondition | Readonly<{ type: 'MANUAL' }>;

export type BadgeTemplateRecord = Readonly<{
  id: string;
  familyId: string;
  presetCode: string | null;
  name: string;
  description: string | null;
  icon: string;
  category: string;
  condition: BadgeCondition;
  awardLevel: number;
  isVisible: boolean;
  isEnabled: boolean;
  version: number;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export type BadgeTemplateInput = Readonly<{
  name: string;
  description?: string | null;
  icon: string;
  category: string;
  condition: BadgeCondition;
  awardLevel?: number;
  isVisible?: boolean;
  isEnabled?: boolean;
}>;

export type BadgeTemplatePatch = Partial<BadgeTemplateInput>;

export type BadgeAwardRecord = Readonly<{
  id: string;
  familyId: string;
  templateId: string;
  childId: string;
  level: number;
  templateNameSnapshot: string;
  templateDescriptionSnapshot: string | null;
  templateIconSnapshot: string;
  templateCategorySnapshot: string;
  templateConditionSnapshot: BadgeCondition;
  templateVersion: number;
  reason: string | null;
  sourceEventId: string | null;
  awardedById: string | null;
  awardedAt: Date;
}>;

export type BadgeProgressRecord = Readonly<{
  templateId: string;
  childId: string;
  level: number;
  currentValue: number;
  targetValue: number;
  evaluatedAt: Date;
}>;

export type BadgeWallItem = Readonly<{
  template: BadgeTemplateRecord;
  award: BadgeAwardRecord | null;
  progress: BadgeProgressRecord | null;
}>;

export type BadgeRepository = {
  listTemplates(familyId: string): Promise<readonly BadgeTemplateRecord[]>;
  createTemplate(
    familyId: string,
    parentId: string,
    input: BadgeTemplateInput,
  ): Promise<BadgeTemplateRecord>;
  updateTemplate(
    familyId: string,
    templateId: string,
    input: BadgeTemplatePatch,
  ): Promise<BadgeTemplateRecord | null>;
  softDeleteTemplate(familyId: string, templateId: string, now: Date): Promise<boolean>;
  awardManually(input: {
    familyId: string;
    parentId: string;
    childId: string;
    templateId: string;
    reason: string;
    now: Date;
  }): Promise<BadgeAwardRecord>;
  getWall(familyId: string, childId: string): Promise<readonly BadgeWallItem[] | null>;
  findEventChildIds(
    familyId: string,
    eventName: string,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<readonly string[]>;
  evaluateChild(input: {
    familyId: string;
    childId: string;
    sourceEventId: string;
    now: Date;
  }): Promise<{ evaluated: number; awarded: number }>;
};

export type BadgeOperations = {
  listTemplates(input: { sessionToken?: string }): Promise<{
    templates: readonly BadgeTemplateRecord[];
  }>;
  createTemplate(input: {
    sessionToken?: string;
    template: BadgeTemplateInput;
  }): Promise<{ template: BadgeTemplateRecord }>;
  updateTemplate(input: {
    sessionToken?: string;
    templateId: string;
    template: BadgeTemplatePatch;
  }): Promise<{ template: BadgeTemplateRecord }>;
  removeTemplate(input: { sessionToken?: string; templateId: string }): Promise<void>;
  awardManually(input: {
    sessionToken?: string;
    childId: string;
    templateId: string;
    reason: string;
  }): Promise<{ award: BadgeAwardRecord }>;
  getMyWall(input: { sessionToken?: string }): Promise<{ badges: readonly BadgeWallItem[] }>;
};

export type BadgeDependencies = Readonly<{
  repository: BadgeRepository;
  sessions: SessionStore;
  now?: () => Date;
}>;
