import type { AuthSession } from '../family-auth/types.js';
import { encodeCursor, InvalidPaginationError, MAX_CURSOR_PAGE_LIMIT } from '../http/cursor.js';
import { InvalidQueryFilterError, parseUuidFilter } from '../http/query-validation.js';
import {
  NOTIFICATION_TYPES,
  type NotificationDependencies,
  type NotificationOperations,
  type NotificationPreference,
  type NotificationPreferencePatch,
  type NotificationTypeSettings,
  type StoredNotificationPreference,
} from './types.js';

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export class NotificationAccessError extends Error {
  constructor(
    readonly code: 'UNAUTHORIZED' | 'NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'NotificationAccessError';
  }
}

export class InvalidNotificationPreferenceError extends Error {
  constructor() {
    super('The notification preference is invalid.');
    this.name = 'InvalidNotificationPreferenceError';
  }
}

function parsePosition(cursor: Parameters<NotificationOperations['list']>[0]['cursor']) {
  if (!cursor) return null;
  const createdAt = new Date(cursor.sortValue);
  if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== cursor.sortValue) {
    throw new InvalidPaginationError('The cursor is invalid.');
  }
  try {
    const id = parseUuidFilter(cursor.id, 'cursor id');
    if (!id) throw new InvalidPaginationError('The cursor is invalid.');
    return { createdAt, id };
  } catch (error) {
    if (error instanceof InvalidPaginationError) throw error;
    if (error instanceof InvalidQueryFilterError) {
      throw new InvalidPaginationError('The cursor is invalid.');
    }
    throw error;
  }
}

function defaultTypeSettings(): NotificationTypeSettings {
  return Object.fromEntries(
    NOTIFICATION_TYPES.map((type) => [type, true]),
  ) as unknown as NotificationTypeSettings;
}

function normalizeTypeSettings(value: unknown): NotificationTypeSettings {
  const defaults = defaultTypeSettings();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return defaults;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    NOTIFICATION_TYPES.map((type) => [
      type,
      typeof record[type] === 'boolean' ? record[type] : true,
    ]),
  ) as unknown as NotificationTypeSettings;
}

function formatTime(value: Date | null): string | null {
  if (!value) return null;
  return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`;
}

function parseTime(value: string | null): Date | null {
  return value === null ? null : new Date(`1970-01-01T${value}:00.000Z`);
}

function normalizePreference(value: StoredNotificationPreference | null): NotificationPreference {
  return value
    ? {
        inAppEnabled: value.inAppEnabled,
        browserEnabled: value.browserEnabled,
        typeSettings: normalizeTypeSettings(value.typeSettings),
        quietHoursEnabled: value.quietHoursEnabled,
        quietHoursStart: formatTime(value.quietHoursStart),
        quietHoursEnd: formatTime(value.quietHoursEnd),
      }
    : {
        inAppEnabled: true,
        browserEnabled: false,
        typeSettings: defaultTypeSettings(),
        quietHoursEnabled: false,
        quietHoursStart: null,
        quietHoursEnd: null,
      };
}

function validatePatch(patch: NotificationPreferencePatch): void {
  if (Object.keys(patch).length === 0) throw new InvalidNotificationPreferenceError();
  if (patch.typeSettings !== undefined && Object.keys(patch.typeSettings).length === 0) {
    throw new InvalidNotificationPreferenceError();
  }
  for (const value of [patch.quietHoursStart, patch.quietHoursEnd]) {
    if (value !== undefined && value !== null && !timePattern.test(value)) {
      throw new InvalidNotificationPreferenceError();
    }
  }
}

function mergePreference(
  current: NotificationPreference,
  patch: NotificationPreferencePatch,
): NotificationPreference {
  validatePatch(patch);
  const preference: NotificationPreference = {
    inAppEnabled: patch.inAppEnabled ?? current.inAppEnabled,
    browserEnabled: patch.browserEnabled ?? current.browserEnabled,
    typeSettings: { ...current.typeSettings, ...patch.typeSettings },
    quietHoursEnabled: patch.quietHoursEnabled ?? current.quietHoursEnabled,
    quietHoursStart:
      patch.quietHoursStart === undefined ? current.quietHoursStart : patch.quietHoursStart,
    quietHoursEnd: patch.quietHoursEnd === undefined ? current.quietHoursEnd : patch.quietHoursEnd,
  };
  if ((preference.quietHoursStart === null) !== (preference.quietHoursEnd === null)) {
    throw new InvalidNotificationPreferenceError();
  }
  if (preference.quietHoursEnabled && preference.quietHoursStart === null) {
    throw new InvalidNotificationPreferenceError();
  }
  return preference;
}

function storedPreference(value: NotificationPreference): StoredNotificationPreference {
  return {
    inAppEnabled: value.inAppEnabled,
    browserEnabled: value.browserEnabled,
    typeSettings: value.typeSettings,
    quietHoursEnabled: value.quietHoursEnabled,
    quietHoursStart: parseTime(value.quietHoursStart),
    quietHoursEnd: parseTime(value.quietHoursEnd),
  };
}

export class NotificationService implements NotificationOperations {
  private readonly now: () => Date;

  constructor(private readonly dependencies: NotificationDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async list(input: Parameters<NotificationOperations['list']>[0]) {
    const session = await this.session(input.sessionToken);
    if (
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > MAX_CURSOR_PAGE_LIMIT
    ) {
      throw new InvalidPaginationError(`The page limit cannot exceed ${MAX_CURSOR_PAGE_LIMIT}.`);
    }
    const records = await this.dependencies.repository.list({
      familyId: session.familyId,
      recipientId: session.subjectId,
      cursor: parsePosition(input.cursor),
      limit: input.limit,
    });
    const hasMore = records.length > input.limit;
    const notifications = records.slice(0, input.limit);
    const last = notifications.at(-1);
    return {
      notifications,
      page: {
        has_more: hasMore,
        next_cursor:
          hasMore && last
            ? encodeCursor({ sortValue: last.createdAt.toISOString(), id: last.id })
            : null,
      },
    };
  }

  async unreadCount(input: { sessionToken?: string }) {
    const session = await this.session(input.sessionToken);
    return {
      unreadCount: await this.dependencies.repository.countUnread(
        session.familyId,
        session.subjectId,
      ),
    };
  }

  async markRead(input: Parameters<NotificationOperations['markRead']>[0]) {
    const session = await this.session(input.sessionToken);
    const notification = await this.dependencies.repository.markRead({
      familyId: session.familyId,
      recipientId: session.subjectId,
      notificationId: input.notificationId,
      readAt: this.now(),
    });
    if (!notification) {
      throw new NotificationAccessError('NOT_FOUND', 'The notification was not found.');
    }
    return { notification };
  }

  async markAllRead(input: { sessionToken?: string }) {
    const session = await this.session(input.sessionToken);
    return {
      updatedCount: await this.dependencies.repository.markAllRead({
        familyId: session.familyId,
        recipientId: session.subjectId,
        readAt: this.now(),
      }),
    };
  }

  async getPreference(input: { sessionToken?: string }) {
    const session = await this.session(input.sessionToken);
    const stored = await this.dependencies.repository.findPreference(
      session.familyId,
      session.subjectId,
    );
    if (stored === undefined) {
      throw new NotificationAccessError('NOT_FOUND', 'The notification recipient was not found.');
    }
    return { preference: normalizePreference(stored) };
  }

  async updatePreference(input: Parameters<NotificationOperations['updatePreference']>[0]) {
    const session = await this.session(input.sessionToken);
    const stored = await this.dependencies.repository.findPreference(
      session.familyId,
      session.subjectId,
    );
    if (stored === undefined) {
      throw new NotificationAccessError('NOT_FOUND', 'The notification recipient was not found.');
    }
    const preference = mergePreference(normalizePreference(stored), input.preference);
    const saved = await this.dependencies.repository.savePreference({
      familyId: session.familyId,
      userId: session.subjectId,
      preference: storedPreference(preference),
    });
    if (!saved) {
      throw new NotificationAccessError('NOT_FOUND', 'The notification recipient was not found.');
    }
    return { preference: normalizePreference(saved) };
  }

  private async session(token?: string): Promise<AuthSession> {
    const session = token ? await this.dependencies.sessions.read(token) : null;
    if (!session) {
      throw new NotificationAccessError('UNAUTHORIZED', 'An active session is required.');
    }
    return session;
  }
}
