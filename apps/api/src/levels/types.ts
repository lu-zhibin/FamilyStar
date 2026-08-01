import type { SessionStore } from '../family-auth/types.js';

export type LevelJson =
  boolean | number | string | null | LevelJson[] | { [key: string]: LevelJson };

export type LevelConfiguration = Readonly<{
  level: number;
  name: string;
  icon: string;
  pointsRequired: number;
  discount: number;
  autoApproveQuota: number;
  wishSlots: number;
  extraDimensions: LevelJson | null;
}>;

export type LevelSubject = Readonly<{
  userId: string;
  pointsEarnedTotal: number;
  currentLevel: number;
  familyAutoApproveQuota: number;
  configurations: readonly LevelConfiguration[];
}>;

export type LevelProgress = Readonly<{
  configuration: LevelConfiguration;
  pointsRemaining: number;
  progressRatio: number;
}>;

export type LevelView = Readonly<{
  userId: string;
  pointsEarnedTotal: number;
  eligibleLevel: number;
  current: LevelConfiguration;
  benefits: Readonly<{
    discount: number;
    levelAutoApproveQuota: number;
    effectiveAutoApproveQuota: number;
    wishSlots: number;
    extraDimensions: LevelJson | null;
  }>;
  next: LevelProgress | null;
}>;

export type LevelRepository = {
  findActiveChildLevel(familyId: string, childId: string): Promise<LevelSubject | null>;
};

export type LevelOperations = {
  getMe(input: { sessionToken?: string }): Promise<{ level: LevelView }>;
  getChild(input: { sessionToken?: string; childId: string }): Promise<{ level: LevelView }>;
};

export type LevelServiceDependencies = Readonly<{
  repository: LevelRepository;
  sessions: SessionStore;
}>;
