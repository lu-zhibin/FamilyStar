import { ERROR_CODES } from '@familystar/shared';
import type { Context, Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

import { SESSION_TTL_SECONDS } from '../family-auth/constants.js';
import { InvalidPaginationError, parseCursorPageQuery } from '../http/cursor.js';
import { InvalidQueryFilterError, parseUuidFilter } from '../http/query-validation.js';
import { createErrorResponse, createSuccessResponse } from '../http/responses.js';
import type { AppEnvironment } from '../http/types.js';
import { PointsReadAccessError } from './service.js';
import type { PointsLedgerEntry, PointsReadOperations, PointsSummary } from './types.js';

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

function summary(value: PointsSummary) {
  return {
    child_id: value.userId,
    points_balance: value.pointsBalance,
    points_earned_total: value.pointsEarnedTotal,
  };
}

function log(value: PointsLedgerEntry) {
  return {
    id: value.id,
    type: value.type,
    business_type: value.businessType,
    business_id: value.businessId,
    delta: value.delta,
    balance_before: value.balanceBefore,
    balance_after: value.balanceAfter,
    earned_total_after: value.earnedTotalAfter,
    remark: value.remark,
    created_at: value.createdAt.toISOString(),
  };
}

function mapError(context: Context<AppEnvironment>, error: unknown) {
  if (error instanceof InvalidPaginationError || error instanceof InvalidQueryFilterError) {
    return context.json(
      createErrorResponse(ERROR_CODES.INVALID_REQUEST, error.message, context.get('requestId')),
      400,
    );
  }
  if (!(error instanceof PointsReadAccessError)) throw error;
  const status = { UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404 }[error.code] as
    401 | 403 | 404;
  const code = {
    UNAUTHORIZED: ERROR_CODES.UNAUTHORIZED,
    FORBIDDEN: ERROR_CODES.FORBIDDEN,
    NOT_FOUND: ERROR_CODES.NOT_FOUND,
  }[error.code];
  return context.json(createErrorResponse(code, error.message, context.get('requestId')), status);
}

export function registerPointsReadRoutes(
  api: Hono<AppEnvironment>,
  operations: PointsReadOperations,
  secureCookies: boolean,
): void {
  api.get('/points/me', async (context) => {
    try {
      const result = await operations.getMe(sessionInput(context));
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse({ points: summary(result.points) }, context.get('requestId')),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.get('/points/me/logs', async (context) => {
    try {
      const cursor = context.req.query('cursor');
      const limit = context.req.query('limit');
      const pageQuery = parseCursorPageQuery({
        ...(cursor === undefined ? {} : { cursor }),
        ...(limit === undefined ? {} : { limit }),
      });
      const result = await operations.getMyLogs({
        ...sessionInput(context),
        ...pageQuery,
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { logs: result.logs.map(log), page: result.page },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.get('/family/children/:childId/points', async (context) => {
    try {
      const childId = parseUuidFilter(context.req.param('childId'), 'child id');
      if (!childId) throw new InvalidQueryFilterError('child id is required.');
      const result = await operations.getChild({
        ...sessionInput(context),
        childId,
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse({ points: summary(result.points) }, context.get('requestId')),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });
}
