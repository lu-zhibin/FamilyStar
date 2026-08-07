import type { AuthSession, SessionStore } from '../family-auth/types.js';
import { decodeCursor } from '../http/cursor.js';
import { describe, expect, it, vi } from 'vitest';

import {
  InvalidNotificationPreferenceError,
  NotificationAccessError,
  NotificationService,
} from './service.js';
import type {
  NotificationRecord,
  NotificationRepository,
  StoredNotificationPreference,
} from './types.js';

const session: AuthSession = {
  subjectId: '01989a58-c542-7abc-8def-0123456789ab',
  familyId: '01989a58-c542-7abc-8def-0123456789ac',
  role: 'child',
  issuedAt: '2026-08-07T00:00:00.000Z',
};

function notification(index: number): NotificationRecord {
  return {
    id: `01989a58-c542-7abc-8def-${String(index).padStart(12, '0')}`,
    type: 'REVIEW',
    title: `Notification ${index}`,
    content: 'A task was reviewed.',
    targetType: 'check_in',
    targetId: '01989a58-c542-7abc-8def-0123456789ad',
    targetUrl: '/child/check-ins',
    readAt: null,
    createdAt: new Date(`2026-08-07T00:00:0${index}.000Z`),
  };
}

function storedPreference(): StoredNotificationPreference {
  return {
    inAppEnabled: true,
    browserEnabled: false,
    typeSettings: { REVIEW: false, EXTRA: true },
    quietHoursEnabled: false,
    quietHoursStart: null,
    quietHoursEnd: null,
  };
}

function setup(activeSession: AuthSession | null = session) {
  const sessions: SessionStore = {
    create: vi.fn(),
    read: vi.fn().mockResolvedValue(activeSession),
    revoke: vi.fn(),
    revokeSubject: vi.fn(),
  };
  const repository: NotificationRepository = {
    list: vi.fn().mockResolvedValue([]),
    countUnread: vi.fn().mockResolvedValue(0),
    markRead: vi.fn().mockResolvedValue(notification(1)),
    markAllRead: vi.fn().mockResolvedValue(0),
    findPreference: vi.fn().mockResolvedValue(null),
    savePreference: vi.fn().mockImplementation(async ({ preference }) => preference),
  };
  return {
    repository,
    service: new NotificationService({
      repository,
      sessions,
      now: () => new Date('2026-08-07T12:00:00.000Z'),
    }),
  };
}

describe('NotificationService', () => {
  it('lists only the session recipient with a stable createdAt and id cursor', async () => {
    const records = [notification(3), notification(2), notification(1)];
    const { repository, service } = setup();
    vi.mocked(repository.list).mockResolvedValue(records);

    const result = await service.list({ sessionToken: 'token', cursor: null, limit: 2 });

    expect(result.notifications).toEqual(records.slice(0, 2));
    expect(result.page.has_more).toBe(true);
    expect(decodeCursor(result.page.next_cursor ?? '')).toEqual({
      sortValue: records[1]?.createdAt.toISOString(),
      id: records[1]?.id,
    });
    expect(repository.list).toHaveBeenCalledWith({
      familyId: session.familyId,
      recipientId: session.subjectId,
      cursor: null,
      limit: 2,
    });
  });

  it('validates the decoded cursor and direct service limit boundaries', async () => {
    const { service } = setup();
    await expect(
      service.list({
        sessionToken: 'token',
        cursor: {
          sortValue: '2026-08-07T00:00:00Z',
          id: '01989a58-c542-7abc-8def-0123456789ab',
        },
        limit: 20,
      }),
    ).rejects.toMatchObject({ name: 'InvalidPaginationError' });
    for (const limit of [0, 101, 1.5]) {
      await expect(
        service.list({ sessionToken: 'token', cursor: null, limit }),
      ).rejects.toMatchObject({ name: 'InvalidPaginationError' });
    }
  });

  it('scopes unread and idempotent read operations to the session recipient and family', async () => {
    const { repository, service } = setup();
    vi.mocked(repository.countUnread).mockResolvedValue(4);
    vi.mocked(repository.markAllRead).mockResolvedValue(4);

    await expect(service.unreadCount({ sessionToken: 'token' })).resolves.toEqual({
      unreadCount: 4,
    });
    await service.markRead({ sessionToken: 'token', notificationId: notification(1).id });
    await expect(service.markAllRead({ sessionToken: 'token' })).resolves.toEqual({
      updatedCount: 4,
    });

    expect(repository.countUnread).toHaveBeenCalledWith(session.familyId, session.subjectId);
    expect(repository.markRead).toHaveBeenCalledWith({
      familyId: session.familyId,
      recipientId: session.subjectId,
      notificationId: notification(1).id,
      readAt: new Date('2026-08-07T12:00:00.000Z'),
    });
    expect(repository.markAllRead).toHaveBeenCalledWith({
      familyId: session.familyId,
      recipientId: session.subjectId,
      readAt: new Date('2026-08-07T12:00:00.000Z'),
    });
  });

  it('returns a scoped not found result for another recipient notification', async () => {
    const { repository, service } = setup();
    vi.mocked(repository.markRead).mockResolvedValue(null);
    await expect(
      service.markRead({ sessionToken: 'token', notificationId: notification(1).id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns complete defaults and normalizes stored type settings', async () => {
    const { repository, service } = setup();
    await expect(service.getPreference({ sessionToken: 'token' })).resolves.toMatchObject({
      preference: {
        inAppEnabled: true,
        browserEnabled: false,
        typeSettings: { REVIEW: true, POINTS: true, INVITATION: true },
        quietHoursEnabled: false,
        quietHoursStart: null,
        quietHoursEnd: null,
      },
    });

    vi.mocked(repository.findPreference).mockResolvedValue(storedPreference());
    await expect(service.getPreference({ sessionToken: 'token' })).resolves.toMatchObject({
      preference: { typeSettings: { REVIEW: false, POINTS: true } },
    });
  });

  it('merges type switches and strict quiet hours into a complete upsert', async () => {
    const { repository, service } = setup();
    const result = await service.updatePreference({
      sessionToken: 'token',
      preference: {
        browserEnabled: true,
        typeSettings: { BADGE: false },
        quietHoursEnabled: true,
        quietHoursStart: '22:30',
        quietHoursEnd: '07:15',
      },
    });

    expect(result.preference).toMatchObject({
      browserEnabled: true,
      typeSettings: { REVIEW: true, BADGE: false },
      quietHoursEnabled: true,
      quietHoursStart: '22:30',
      quietHoursEnd: '07:15',
    });
    expect(repository.savePreference).toHaveBeenCalledWith(
      expect.objectContaining({
        familyId: session.familyId,
        userId: session.subjectId,
        preference: expect.objectContaining({
          quietHoursStart: new Date('1970-01-01T22:30:00.000Z'),
          quietHoursEnd: new Date('1970-01-01T07:15:00.000Z'),
        }),
      }),
    );
  });

  it.each([
    {},
    { typeSettings: {} },
    { quietHoursStart: '7:00', quietHoursEnd: '08:00' },
    { quietHoursStart: '07:00' },
    { quietHoursEnabled: true },
  ])('rejects invalid preference patch %#', async (preference) => {
    const { service } = setup();
    await expect(
      service.updatePreference({ sessionToken: 'token', preference }),
    ).rejects.toBeInstanceOf(InvalidNotificationPreferenceError);
  });

  it('uses stable unauthorized and inactive-recipient errors', async () => {
    await expect(setup(null).service.unreadCount({})).rejects.toBeInstanceOf(
      NotificationAccessError,
    );
    const { repository, service } = setup();
    vi.mocked(repository.findPreference).mockResolvedValue(undefined);
    await expect(service.getPreference({ sessionToken: 'token' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
