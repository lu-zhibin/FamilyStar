import type { NotificationType } from '@prisma/client';
import type { CursorPage } from '@familystar/shared';

import type { SessionStore } from '../family-auth/types.js';
import type { CursorPosition } from '../http/cursor.js';

export const NOTIFICATION_TYPES = [
  'REVIEW',
  'POINTS',
  'LEVEL',
  'REDEMPTION',
  'WISH',
  'BADGE',
  'INVITATION',
] as const satisfies readonly NotificationType[];

export type NotificationRecord = Readonly<{
  id: string;
  type: NotificationType;
  title: string;
  content: string;
  targetType: string;
  targetId: string | null;
  targetUrl: string;
  readAt: Date | null;
  createdAt: Date;
}>;

export type NotificationTypeSettings = Readonly<Record<NotificationType, boolean>>;

export type NotificationPreference = Readonly<{
  inAppEnabled: boolean;
  browserEnabled: boolean;
  typeSettings: NotificationTypeSettings;
  quietHoursEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}>;

export type NotificationPreferencePatch = Readonly<{
  inAppEnabled?: boolean;
  browserEnabled?: boolean;
  typeSettings?: Readonly<Partial<Record<NotificationType, boolean>>>;
  quietHoursEnabled?: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
}>;

export type StoredNotificationPreference = Readonly<{
  inAppEnabled: boolean;
  browserEnabled: boolean;
  typeSettings: unknown;
  quietHoursEnabled: boolean;
  quietHoursStart: Date | null;
  quietHoursEnd: Date | null;
}>;

export type NotificationWrite = Readonly<{
  familyId: string;
  recipientIds: readonly string[];
  type: NotificationType;
  title: string;
  content: string;
  targetType: string;
  targetId: string | null;
  targetUrl: string;
  sourceEventId: string;
  sourceEventName: string;
  createdAt: Date;
}>;

export type NotificationEventRepository = {
  listActiveParentIds(familyId: string): Promise<readonly string[]>;
  createFromEvent(input: NotificationWrite): Promise<number>;
};

export type NotificationRepository = {
  list(input: {
    familyId: string;
    recipientId: string;
    cursor: Readonly<{ createdAt: Date; id: string }> | null;
    limit: number;
  }): Promise<readonly NotificationRecord[]>;
  countUnread(familyId: string, recipientId: string): Promise<number>;
  markRead(input: {
    familyId: string;
    recipientId: string;
    notificationId: string;
    readAt: Date;
  }): Promise<NotificationRecord | null>;
  markAllRead(input: { familyId: string; recipientId: string; readAt: Date }): Promise<number>;
  findPreference(
    familyId: string,
    userId: string,
  ): Promise<StoredNotificationPreference | null | undefined>;
  savePreference(input: {
    familyId: string;
    userId: string;
    preference: StoredNotificationPreference;
  }): Promise<StoredNotificationPreference | null>;
};

export type NotificationOperations = {
  list(input: {
    sessionToken?: string;
    cursor: CursorPosition | null;
    limit: number;
  }): Promise<{ notifications: readonly NotificationRecord[]; page: CursorPage }>;
  unreadCount(input: { sessionToken?: string }): Promise<{ unreadCount: number }>;
  markRead(input: {
    sessionToken?: string;
    notificationId: string;
  }): Promise<{ notification: NotificationRecord }>;
  markAllRead(input: { sessionToken?: string }): Promise<{ updatedCount: number }>;
  getPreference(input: { sessionToken?: string }): Promise<{ preference: NotificationPreference }>;
  updatePreference(input: {
    sessionToken?: string;
    preference: NotificationPreferencePatch;
  }): Promise<{ preference: NotificationPreference }>;
};

export type NotificationDependencies = Readonly<{
  repository: NotificationRepository;
  sessions: SessionStore;
  now?: () => Date;
}>;
