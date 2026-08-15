import { ERROR_CODES } from '@familystar/shared';
import type { Context, Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

import { SESSION_TTL_SECONDS } from '../family-auth/constants.js';
import { InvalidPaginationError, parseCursorPageQuery } from '../http/cursor.js';
import {
  InvalidQueryFilterError,
  parseEnumFilter,
  parseUuidFilter,
} from '../http/query-validation.js';
import { createErrorResponse, createSuccessResponse } from '../http/responses.js';
import type { AppEnvironment } from '../http/types.js';
import { HistoryAccessError } from './history-service.js';
import {
  HISTORY_SUBMISSION_TYPES,
  type HistoryItem,
  type HistoryOperations,
  type HistoryQuery,
} from './history-types.js';

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

function query(context: Context<AppEnvironment>, includeChild: boolean): HistoryQuery {
  const cursor = context.req.query('cursor');
  const limit = context.req.query('limit');
  const page = parseCursorPageQuery({
    ...(cursor === undefined ? {} : { cursor }),
    ...(limit === undefined ? {} : { limit }),
  });
  const childId = includeChild
    ? parseUuidFilter(context.req.query('child_id'), 'child_id')
    : undefined;
  const taskId = parseUuidFilter(context.req.query('task_id'), 'task_id');
  const submissionType = parseEnumFilter(
    context.req.query('submission_type'),
    HISTORY_SUBMISSION_TYPES,
    'submission_type',
  );
  const startDate = context.req.query('start_date');
  const endDate = context.req.query('end_date');
  return {
    ...page,
    ...(childId === undefined ? {} : { childId }),
    ...(taskId === undefined ? {} : { taskId }),
    ...(submissionType === undefined ? {} : { submissionType }),
    ...(startDate === undefined ? {} : { startDate }),
    ...(endDate === undefined ? {} : { endDate }),
  };
}

function output(item: HistoryItem) {
  return {
    id: item.attemptId,
    submission_id: item.submissionId,
    submission_type: item.submissionType,
    attempt_number: item.attemptNumber,
    child: item.child,
    task: item.task,
    content_text: item.contentText,
    status: item.status,
    submitted_at: item.submittedAt.toISOString(),
    check_date: item.checkDate.toISOString().slice(0, 10),
    collaboration_round: item.collaborationRound
      ? {
          id: item.collaborationRound.id,
          round_number: item.collaborationRound.roundNumber,
          start_date: item.collaborationRound.startDate.toISOString().slice(0, 10),
          end_date: item.collaborationRound.endDate.toISOString().slice(0, 10),
        }
      : null,
    review: item.review
      ? {
          id: item.review.id,
          decision: item.review.decision,
          source: item.review.source,
          reason: item.review.reason,
          reviewer_id: item.review.reviewerId,
          reviewed_at: item.review.reviewedAt.toISOString(),
        }
      : null,
    points_earned: item.pointsEarned,
    media: item.media.map((media) => ({
      id: media.id,
      type: media.type,
      mime_type: media.mimeType,
      size_bytes: media.sizeBytes,
      width: media.width,
      height: media.height,
      duration: media.duration,
      created_at: media.createdAt.toISOString(),
    })),
  };
}

function mapError(context: Context<AppEnvironment>, error: unknown) {
  if (error instanceof InvalidPaginationError || error instanceof InvalidQueryFilterError) {
    return context.json(
      createErrorResponse(ERROR_CODES.INVALID_REQUEST, error.message, context.get('requestId')),
      400,
    );
  }
  if (!(error instanceof HistoryAccessError)) throw error;
  const status = { UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404 }[error.code] as
    401 | 403 | 404;
  const code = {
    UNAUTHORIZED: ERROR_CODES.UNAUTHORIZED,
    FORBIDDEN: ERROR_CODES.FORBIDDEN,
    NOT_FOUND: ERROR_CODES.NOT_FOUND,
  }[error.code];
  return context.json(createErrorResponse(code, error.message, context.get('requestId')), status);
}

export function registerHistoryRoutes(
  api: Hono<AppEnvironment>,
  operations: HistoryOperations,
  secureCookies: boolean,
): void {
  const route =
    (read: HistoryOperations['getMine'] | HistoryOperations['getFamily'], includeChild: boolean) =>
    async (context: Context<AppEnvironment>) => {
      try {
        const result = await read({ ...sessionInput(context), ...query(context, includeChild) });
        renew(context, secureCookies);
        return context.json(
          createSuccessResponse(
            { items: result.items.map(output), page: result.page },
            context.get('requestId'),
          ),
        );
      } catch (error) {
        return mapError(context, error);
      }
    };
  api.get('/check-ins/me/history', route(operations.getMine.bind(operations), false));
  api.get('/family/check-ins/history', route(operations.getFamily.bind(operations), true));
}
