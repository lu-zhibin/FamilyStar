import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { encodeCursor, InvalidPaginationError } from '../http/cursor.js';
import { NotificationAccessError } from './service.js';
import type { NotificationOperations, NotificationRecord } from './types.js';

const notification: NotificationRecord = {
  id: '01989a58-c542-7abc-8def-0123456789ab',
  type: 'BADGE',
  title: 'Badge earned',
  content: 'You earned a badge.',
  targetType: 'badge_award',
  targetId: '01989a58-c542-7abc-8def-0123456789ac',
  targetUrl: '/child/achievements',
  readAt: null,
  createdAt: new Date('2026-08-07T10:00:00.000Z'),
};

function operations(): NotificationOperations {
  return {
    list: vi.fn().mockResolvedValue({
      notifications: [notification],
      page: { next_cursor: null, has_more: false },
    }),
    unreadCount: vi.fn().mockResolvedValue({ unreadCount: 2 }),
    markRead: vi.fn().mockResolvedValue({
      notification: { ...notification, readAt: new Date('2026-08-07T12:00:00.000Z') },
    }),
    markAllRead: vi.fn().mockResolvedValue({ updatedCount: 2 }),
    getPreference: vi.fn().mockResolvedValue({
      preference: {
        inAppEnabled: true,
        browserEnabled: false,
        typeSettings: {
          REVIEW: true,
          POINTS: true,
          LEVEL: true,
          REDEMPTION: true,
          WISH: true,
          BADGE: false,
          INVITATION: true,
        },
        quietHoursEnabled: false,
        quietHoursStart: null,
        quietHoursEnd: null,
      },
    }),
    updatePreference: vi.fn().mockImplementation(async ({ preference }) => ({
      preference: {
        inAppEnabled: preference.inAppEnabled ?? true,
        browserEnabled: preference.browserEnabled ?? false,
        typeSettings: {
          REVIEW: true,
          POINTS: true,
          LEVEL: true,
          REDEMPTION: true,
          WISH: true,
          BADGE: preference.typeSettings?.BADGE ?? true,
          INVITATION: true,
        },
        quietHoursEnabled: preference.quietHoursEnabled ?? false,
        quietHoursStart: preference.quietHoursStart ?? null,
        quietHoursEnd: preference.quietHoursEnd ?? null,
      },
    })),
  };
}

describe('notification HTTP routes', () => {
  beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('returns a snake_case notification page and passes cursor input', async () => {
    const notificationOperations = operations();
    const cursor = encodeCursor({
      sortValue: notification.createdAt.toISOString(),
      id: notification.id,
    });
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', notificationOperations });
    const response = await app.request(`/api/v1/notifications?cursor=${cursor}&limit=5`, {
      headers: { cookie: 'familystar_session=member-session' },
    });

    expect(response.status).toBe(200);
    expect(notificationOperations.list).toHaveBeenCalledWith({
      sessionToken: 'member-session',
      cursor: { sortValue: notification.createdAt.toISOString(), id: notification.id },
      limit: 5,
    });
    expect(await response.json()).toMatchObject({
      data: {
        notifications: [
          {
            id: notification.id,
            type: 'badge',
            target_type: 'badge_award',
            target_id: notification.targetId,
            target_url: '/child/achievements',
            read_at: null,
            created_at: '2026-08-07T10:00:00.000Z',
          },
        ],
        page: { next_cursor: null, has_more: false },
      },
    });
    expect(response.headers.get('set-cookie')).toContain('familystar_session=member-session');
  });

  it.each(['0', '101', '1.5'])('rejects list limit %s at the route boundary', async (limit) => {
    const notificationOperations = operations();
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', notificationOperations });
    const response = await app.request(`/api/v1/notifications?limit=${limit}`);
    expect(response.status).toBe(400);
    expect(notificationOperations.list).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
  });

  it('serves unread count and both idempotent read endpoints', async () => {
    const notificationOperations = operations();
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', notificationOperations });

    const countResponse = await app.request('/api/v1/notifications/unread-count');
    const oneResponse = await app.request(`/api/v1/notifications/${notification.id}/read`, {
      method: 'PATCH',
    });
    const allResponse = await app.request('/api/v1/notifications/read-all', { method: 'PATCH' });

    expect(await countResponse.json()).toMatchObject({ data: { unread_count: 2 } });
    expect(await oneResponse.json()).toMatchObject({
      data: { notification: { id: notification.id, read_at: '2026-08-07T12:00:00.000Z' } },
    });
    expect(await allResponse.json()).toMatchObject({ data: { updated_count: 2 } });
  });

  it('rejects a malformed notification id before calling the service', async () => {
    const notificationOperations = operations();
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', notificationOperations });
    const response = await app.request('/api/v1/notifications/not-a-uuid/read', {
      method: 'PATCH',
    });
    expect(response.status).toBe(400);
    expect(notificationOperations.markRead).not.toHaveBeenCalled();
  });

  it('maps preference fields and type switches in snake_case', async () => {
    const notificationOperations = operations();
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', notificationOperations });
    const getResponse = await app.request('/api/v1/notification-preferences');
    const patchResponse = await app.request('/api/v1/notification-preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        browser_enabled: true,
        type_settings: { badge: false },
        quiet_hours_enabled: true,
        quiet_hours_start: '22:00',
        quiet_hours_end: '07:00',
      }),
    });

    expect(await getResponse.json()).toMatchObject({
      data: {
        preference: {
          in_app_enabled: true,
          browser_enabled: false,
          type_settings: { review: true, badge: false, invitation: true },
          quiet_hours_enabled: false,
        },
      },
    });
    expect(notificationOperations.updatePreference).toHaveBeenCalledWith({
      preference: {
        browserEnabled: true,
        typeSettings: { BADGE: false },
        quietHoursEnabled: true,
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
      },
    });
    expect(patchResponse.status).toBe(200);
  });

  it.each([
    {},
    { unknown: true },
    { type_settings: {} },
    { type_settings: { unknown: true } },
    { quiet_hours_start: '7:00' },
  ])('rejects a strict invalid preference payload %#', async (body) => {
    const notificationOperations = operations();
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', notificationOperations });
    const response = await app.request('/api/v1/notification-preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(400);
    expect(notificationOperations.updatePreference).not.toHaveBeenCalled();
  });

  it.each([
    [new NotificationAccessError('UNAUTHORIZED', 'Denied.'), 401, 'UNAUTHORIZED'],
    [new NotificationAccessError('NOT_FOUND', 'Missing.'), 404, 'NOT_FOUND'],
    [new InvalidPaginationError('Invalid cursor.'), 400, 'INVALID_REQUEST'],
  ] as const)('maps domain errors to stable responses', async (error, status, code) => {
    const notificationOperations = operations();
    vi.mocked(notificationOperations.list).mockRejectedValue(error);
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', notificationOperations });
    const response = await app.request('/api/v1/notifications');
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: { code } });
  });
});
