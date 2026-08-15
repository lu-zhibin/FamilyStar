import { ERROR_CODES } from '@familystar/shared';
import type { Context, Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

import { SESSION_TTL_SECONDS } from '../family-auth/constants.js';
import {
  InvalidQueryFilterError,
  parseEnumFilter,
  parseUuidFilter,
} from '../http/query-validation.js';
import { createErrorResponse, createSuccessResponse } from '../http/responses.js';
import type { AppEnvironment } from '../http/types.js';
import { AnalyticsAccessError } from './service.js';
import type { AnalyticsOperations } from './types.js';

function mapError(context: Context<AppEnvironment>, error: unknown) {
  if (error instanceof InvalidQueryFilterError) {
    return context.json(
      createErrorResponse(ERROR_CODES.INVALID_REQUEST, error.message, context.get('requestId')),
      400,
    );
  }
  if (!(error instanceof AnalyticsAccessError)) throw error;
  const status = { UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404 }[error.code] as
    401 | 403 | 404;
  const code = {
    UNAUTHORIZED: ERROR_CODES.UNAUTHORIZED,
    FORBIDDEN: ERROR_CODES.FORBIDDEN,
    NOT_FOUND: ERROR_CODES.NOT_FOUND,
  }[error.code];
  return context.json(createErrorResponse(code, error.message, context.get('requestId')), status);
}

function renew(context: Context<AppEnvironment>, token: string | undefined, secure: boolean) {
  if (!token) return;
  setCookie(context, 'familystar_session', token, {
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
    sameSite: 'Lax',
    secure,
  });
}

export function registerAnalyticsRoutes(
  api: Hono<AppEnvironment>,
  operations: AnalyticsOperations,
  secureCookies: boolean,
): void {
  api.get('/family/analytics', async (context) => {
    try {
      const startDate = context.req.query('start_date');
      const endDate = context.req.query('end_date');
      if (!startDate || !endDate) {
        throw new InvalidQueryFilterError('start_date and end_date are required.');
      }
      const token = getCookie(context, 'familystar_session');
      const childId = parseUuidFilter(context.req.query('child_id'), 'child_id');
      const taskId = parseUuidFilter(context.req.query('task_id'), 'task_id');
      const result = await operations.getAnalytics({
        ...(token ? { sessionToken: token } : {}),
        ...(childId === undefined ? {} : { childId }),
        ...(taskId === undefined ? {} : { taskId }),
        startDate,
        endDate,
      });
      renew(context, token, secureCookies);
      return context.json(
        createSuccessResponse(
          {
            range: {
              start_date: result.range.startDate,
              end_date: result.range.endDate,
              time_zone: result.range.timeZone,
              day_count: result.range.dayCount,
            },
            filters: { child_id: result.filters.childId, task_id: result.filters.taskId },
            overview: {
              scheduled_count: result.overview.scheduledCount,
              completed_count: result.overview.completedCount,
              completion_rate: result.overview.completionRate,
              points_earned: result.overview.pointsEarned,
            },
            points_trend: result.pointsTrend.map((point) => ({
              date: point.date,
              points_earned: point.pointsEarned,
            })),
            task_performance: result.taskPerformance.map((task) => ({
              task_id: task.taskId,
              task_name: task.taskName,
              scheduled_count: task.scheduledCount,
              completed_count: task.completedCount,
              completion_rate: task.completionRate,
            })),
            level_distribution: result.levelDistribution.map((level) => ({
              level: level.level,
              child_count: level.childCount,
            })),
          },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.get('/rankings', async (context) => {
    try {
      const metric = parseEnumFilter(
        context.req.query('metric'),
        ['balance', 'earned', 'level'] as const,
        'metric',
      );
      const period = parseEnumFilter(
        context.req.query('period'),
        ['week', 'month', 'all'] as const,
        'period',
      );
      const scope = context.req.query('family_scope');
      if (!metric || !period) throw new InvalidQueryFilterError('metric and period are required.');
      if (scope !== undefined && scope !== 'family') {
        throw new InvalidQueryFilterError('family_scope has an invalid value.');
      }
      const token = getCookie(context, 'familystar_session');
      const result = await operations.getRankings({
        ...(token ? { sessionToken: token } : {}),
        metric,
        period,
      });
      renew(context, token, secureCookies);
      return context.json(
        createSuccessResponse(
          {
            metric: result.metric,
            period: result.period,
            range: result.range
              ? {
                  start_date: result.range.startDate,
                  end_date: result.range.endDate,
                  time_zone: result.range.timeZone,
                }
              : null,
            items: result.items.map((item) => ({
              rank: item.rank,
              child_id: item.childId,
              nickname: item.nickname,
              value: item.value,
              ...(item.periodEarned === undefined ? {} : { period_earned: item.periodEarned }),
              is_current_user: item.isCurrentUser,
            })),
          },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });
}
