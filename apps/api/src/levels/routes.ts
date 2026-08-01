import { ERROR_CODES } from '@familystar/shared';
import type { Context, Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

import { SESSION_TTL_SECONDS } from '../family-auth/constants.js';
import { createErrorResponse, createSuccessResponse } from '../http/responses.js';
import type { AppEnvironment } from '../http/types.js';
import { LevelAccessError } from './service.js';
import type { LevelOperations, LevelView } from './types.js';

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

function configuration(value: LevelView['current']) {
  return {
    level: value.level,
    name: value.name,
    icon: value.icon,
    points_required: value.pointsRequired,
  };
}

function output(value: LevelView) {
  return {
    user_id: value.userId,
    points_earned_total: value.pointsEarnedTotal,
    eligible_level: value.eligibleLevel,
    current_level: value.current.level,
    current: configuration(value.current),
    benefits: {
      discount: value.benefits.discount,
      level_auto_approve_quota: value.benefits.levelAutoApproveQuota,
      effective_auto_approve_quota: value.benefits.effectiveAutoApproveQuota,
      wish_slots: value.benefits.wishSlots,
      extra_dimensions: value.benefits.extraDimensions,
    },
    next: value.next
      ? {
          ...configuration(value.next.configuration),
          discount: value.next.configuration.discount,
          auto_approve_quota: value.next.configuration.autoApproveQuota,
          wish_slots: value.next.configuration.wishSlots,
          extra_dimensions: value.next.configuration.extraDimensions,
          points_remaining: value.next.pointsRemaining,
          progress_ratio: value.next.progressRatio,
        }
      : null,
  };
}

function mapError(context: Context<AppEnvironment>, error: unknown) {
  if (!(error instanceof LevelAccessError)) throw error;
  const status = { UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404 }[error.code] as
    401 | 403 | 404;
  const code = {
    UNAUTHORIZED: ERROR_CODES.UNAUTHORIZED,
    FORBIDDEN: ERROR_CODES.FORBIDDEN,
    NOT_FOUND: ERROR_CODES.NOT_FOUND,
  }[error.code];
  return context.json(createErrorResponse(code, error.message, context.get('requestId')), status);
}

export function registerLevelRoutes(
  api: Hono<AppEnvironment>,
  operations: LevelOperations,
  secureCookies: boolean,
): void {
  api.get('/levels/me', async (context) => {
    try {
      const result = await operations.getMe(sessionInput(context));
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse({ level: output(result.level) }, context.get('requestId')),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.get('/family/children/:childId/level', async (context) => {
    try {
      const result = await operations.getChild({
        ...sessionInput(context),
        childId: context.req.param('childId'),
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse({ level: output(result.level) }, context.get('requestId')),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });
}
