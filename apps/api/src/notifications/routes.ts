import { ERROR_CODES } from '@familystar/shared';
import type { NotificationType } from '@prisma/client';
import type { Context, Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';

import { SESSION_TTL_SECONDS } from '../family-auth/constants.js';
import { InvalidPaginationError, parseCursorPageQuery } from '../http/cursor.js';
import { InvalidQueryFilterError, parseUuidFilter } from '../http/query-validation.js';
import { createErrorResponse, createSuccessResponse } from '../http/responses.js';
import type { AppEnvironment } from '../http/types.js';
import { InvalidNotificationPreferenceError, NotificationAccessError } from './service.js';
import type {
  NotificationOperations,
  NotificationPreference,
  NotificationPreferencePatch,
  NotificationRecord,
  NotificationTypeSettings,
} from './types.js';

const typeSettingSchema = z
  .object({
    review: z.boolean().optional(),
    points: z.boolean().optional(),
    level: z.boolean().optional(),
    redemption: z.boolean().optional(),
    wish: z.boolean().optional(),
    badge: z.boolean().optional(),
    invitation: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const timeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
  .nullable();
const preferencePatchSchema = z
  .object({
    in_app_enabled: z.boolean().optional(),
    browser_enabled: z.boolean().optional(),
    type_settings: typeSettingSchema.optional(),
    quiet_hours_enabled: z.boolean().optional(),
    quiet_hours_start: timeSchema.optional(),
    quiet_hours_end: timeSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

const httpTypeByDomain: Record<NotificationType, string> = {
  REVIEW: 'review',
  POINTS: 'points',
  LEVEL: 'level',
  REDEMPTION: 'redemption',
  WISH: 'wish',
  BADGE: 'badge',
  INVITATION: 'invitation',
};
const domainTypeByHttp = Object.fromEntries(
  Object.entries(httpTypeByDomain).map(([domain, http]) => [http, domain]),
) as Record<string, NotificationType>;

function sessionInput(context: Context<AppEnvironment>): { sessionToken?: string } {
  const sessionToken = getCookie(context, 'familystar_session');
  return sessionToken ? { sessionToken } : {};
}

function renew(context: Context<AppEnvironment>, secure: boolean): void {
  const token = getCookie(context, 'familystar_session');
  if (!token) return;
  setCookie(context, 'familystar_session', token, {
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
    sameSite: 'Lax',
    secure,
  });
}

async function json(context: Context<AppEnvironment>): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return undefined;
  }
}

function notificationOutput(value: NotificationRecord) {
  return {
    id: value.id,
    type: httpTypeByDomain[value.type],
    title: value.title,
    content: value.content,
    target_type: value.targetType,
    target_id: value.targetId,
    target_url: value.targetUrl,
    read_at: value.readAt?.toISOString() ?? null,
    created_at: value.createdAt.toISOString(),
  };
}

function typeSettingsOutput(value: NotificationTypeSettings) {
  return Object.fromEntries(
    Object.entries(httpTypeByDomain).map(([domain, http]) => [
      http,
      value[domain as NotificationType],
    ]),
  );
}

function preferenceOutput(value: NotificationPreference) {
  return {
    in_app_enabled: value.inAppEnabled,
    browser_enabled: value.browserEnabled,
    type_settings: typeSettingsOutput(value.typeSettings),
    quiet_hours_enabled: value.quietHoursEnabled,
    quiet_hours_start: value.quietHoursStart,
    quiet_hours_end: value.quietHoursEnd,
  };
}

function preferencePatch(
  value: z.infer<typeof preferencePatchSchema>,
): NotificationPreferencePatch {
  const typeSettings = value.type_settings
    ? Object.fromEntries(
        Object.entries(value.type_settings).map(([type, enabled]) => [
          domainTypeByHttp[type],
          enabled,
        ]),
      )
    : undefined;
  return {
    ...(value.in_app_enabled === undefined ? {} : { inAppEnabled: value.in_app_enabled }),
    ...(value.browser_enabled === undefined ? {} : { browserEnabled: value.browser_enabled }),
    ...(typeSettings === undefined ? {} : { typeSettings }),
    ...(value.quiet_hours_enabled === undefined
      ? {}
      : { quietHoursEnabled: value.quiet_hours_enabled }),
    ...(value.quiet_hours_start === undefined ? {} : { quietHoursStart: value.quiet_hours_start }),
    ...(value.quiet_hours_end === undefined ? {} : { quietHoursEnd: value.quiet_hours_end }),
  };
}

function mapError(context: Context<AppEnvironment>, error: unknown) {
  if (
    error instanceof z.ZodError ||
    error instanceof InvalidPaginationError ||
    error instanceof InvalidQueryFilterError ||
    error instanceof InvalidNotificationPreferenceError
  ) {
    return context.json(
      createErrorResponse(
        ERROR_CODES.INVALID_REQUEST,
        error instanceof z.ZodError ? 'The notification request is invalid.' : error.message,
        context.get('requestId'),
      ),
      400,
    );
  }
  if (!(error instanceof NotificationAccessError)) throw error;
  const status = error.code === 'UNAUTHORIZED' ? 401 : 404;
  const code = error.code === 'UNAUTHORIZED' ? ERROR_CODES.UNAUTHORIZED : ERROR_CODES.NOT_FOUND;
  return context.json(createErrorResponse(code, error.message, context.get('requestId')), status);
}

export function registerNotificationRoutes(
  api: Hono<AppEnvironment>,
  operations: NotificationOperations,
  secureCookies: boolean,
): void {
  api.get('/notifications', async (context) => {
    try {
      const cursor = context.req.query('cursor');
      const limit = context.req.query('limit');
      const page = parseCursorPageQuery({
        ...(cursor === undefined ? {} : { cursor }),
        ...(limit === undefined ? {} : { limit }),
      });
      const result = await operations.list({ ...sessionInput(context), ...page });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { notifications: result.notifications.map(notificationOutput), page: result.page },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.get('/notifications/unread-count', async (context) => {
    try {
      const result = await operations.unreadCount(sessionInput(context));
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse({ unread_count: result.unreadCount }, context.get('requestId')),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.patch('/notifications/:notificationId/read', async (context) => {
    try {
      const notificationId = parseUuidFilter(
        context.req.param('notificationId'),
        'notification id',
      );
      if (!notificationId) throw new InvalidQueryFilterError('notification id is required.');
      const result = await operations.markRead({ ...sessionInput(context), notificationId });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { notification: notificationOutput(result.notification) },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.patch('/notifications/read-all', async (context) => {
    try {
      const result = await operations.markAllRead(sessionInput(context));
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse({ updated_count: result.updatedCount }, context.get('requestId')),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.get('/notification-preferences', async (context) => {
    try {
      const result = await operations.getPreference(sessionInput(context));
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { preference: preferenceOutput(result.preference) },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.patch('/notification-preferences', async (context) => {
    try {
      const body = preferencePatchSchema.parse(await json(context));
      const result = await operations.updatePreference({
        ...sessionInput(context),
        preference: preferencePatch(body),
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { preference: preferenceOutput(result.preference) },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });
}
