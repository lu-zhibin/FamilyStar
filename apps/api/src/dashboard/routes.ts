import { ERROR_CODES } from '@familystar/shared';
import type { Context, Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

import { SESSION_TTL_SECONDS } from '../family-auth/constants.js';
import { InvalidQueryFilterError } from '../http/query-validation.js';
import { createErrorResponse, createSuccessResponse } from '../http/responses.js';
import type { AppEnvironment } from '../http/types.js';
import { DashboardAccessError } from './service.js';
import type { DashboardActivity, DashboardOperations } from './types.js';

function activityOutput(activity: DashboardActivity) {
  return {
    id: activity.id,
    type: activity.type,
    occurred_at: activity.occurredAt.toISOString(),
    actor: activity.actor,
    child: activity.child,
    entity_type: activity.entityType,
    entity_id: activity.entityId,
    target_url: activity.targetUrl,
    details: activity.details,
  };
}

function mapError(context: Context<AppEnvironment>, error: unknown) {
  if (error instanceof InvalidQueryFilterError) {
    return context.json(
      createErrorResponse(ERROR_CODES.INVALID_REQUEST, error.message, context.get('requestId')),
      400,
    );
  }
  if (!(error instanceof DashboardAccessError)) throw error;
  const status = { UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404 }[error.code] as
    401 | 403 | 404;
  const code = {
    UNAUTHORIZED: ERROR_CODES.UNAUTHORIZED,
    FORBIDDEN: ERROR_CODES.FORBIDDEN,
    NOT_FOUND: ERROR_CODES.NOT_FOUND,
  }[error.code];
  return context.json(createErrorResponse(code, error.message, context.get('requestId')), status);
}

export function registerDashboardRoutes(
  api: Hono<AppEnvironment>,
  operations: DashboardOperations,
  secureCookies: boolean,
): void {
  api.get('/family/dashboard', async (context) => {
    try {
      const date = context.req.query('date');
      if (date === undefined) throw new InvalidQueryFilterError('date is required.');
      const token = getCookie(context, 'familystar_session');
      const result = await operations.get({
        ...(token === undefined ? {} : { sessionToken: token }),
        date,
      });
      if (token) {
        setCookie(context, 'familystar_session', token, {
          httpOnly: true,
          maxAge: SESSION_TTL_SECONDS,
          path: '/',
          sameSite: 'Lax',
          secure: secureCookies,
        });
      }
      const dashboard = result.dashboard;
      return context.json(
        createSuccessResponse(
          {
            date: dashboard.date,
            time_zone: dashboard.timeZone,
            children: dashboard.children.map((child) => ({
              child_id: child.childId,
              nickname: child.nickname,
              task_total: child.taskTotal,
              completed_count: child.completedCount,
              pending_review_count: child.pendingReviewCount,
              points_earned: child.pointsEarned,
            })),
            todos: {
              pending_reviews: {
                count: dashboard.todos.pendingReviews,
                target_url: '/reviews',
              },
              pending_redemptions: {
                count: dashboard.todos.pendingRedemptions,
                target_url: '/rewards',
              },
              pending_fulfillments: {
                count: dashboard.todos.pendingFulfillments,
                target_url: '/rewards',
              },
            },
            recent_activity: dashboard.recentActivity.map(activityOutput),
          },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });
}
