import { ERROR_CODES } from '@familystar/shared';
import type { Context, Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';

import { SESSION_TTL_SECONDS } from '../family-auth/constants.js';
import { createErrorResponse, createSuccessResponse } from '../http/responses.js';
import type { AppEnvironment } from '../http/types.js';
import { CheckInError } from './service.js';
import type {
  CheckInOperations,
  CheckInRecord,
  CollaborationSubmissionRecord,
  SubmissionAttemptRecord,
} from './types.js';

const contentSchema = z
  .object({
    text: z.string().max(10_000).optional(),
    media_ids: z.array(z.string().uuid()).max(10).default([]),
  })
  .strict();
const checkInSchema = z
  .object({
    task_assignment_id: z.string().uuid(),
    check_date: z.string().date().optional(),
    content: contentSchema.default({ media_ids: [] }),
  })
  .strict();
const collaborationSchema = z
  .object({ content: contentSchema.default({ media_ids: [] }) })
  .strict();

function token(context: Context<AppEnvironment>): string | undefined {
  return getCookie(context, 'familystar_session');
}

function sessionInput(context: Context<AppEnvironment>): { sessionToken?: string } {
  const value = token(context);
  return value ? { sessionToken: value } : {};
}

function renew(context: Context<AppEnvironment>, secure: boolean): void {
  const value = token(context);
  if (!value) return;
  setCookie(context, 'familystar_session', value, {
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

function attemptOutput(attempt: SubmissionAttemptRecord) {
  return {
    id: attempt.id,
    attempt_number: attempt.attemptNumber,
    status: attempt.status,
    content: { text: attempt.text, media_ids: attempt.mediaIds },
    submitted_at: attempt.submittedAt.toISOString(),
    prior_review: attempt.priorStatus
      ? {
          status: attempt.priorStatus,
          reviewer_id: attempt.priorReviewerId,
          reviewed_at: attempt.priorReviewedAt?.toISOString() ?? null,
          comment: attempt.priorReviewComment,
        }
      : null,
  };
}

function checkInOutput(value: CheckInRecord) {
  return {
    id: value.id,
    task_assignment_id: value.assignmentId,
    task_id: value.taskId,
    child_id: value.childId,
    check_date: value.checkDate,
    is_makeup: value.isMakeup,
    status: value.status,
    content: { text: value.text, media_ids: value.mediaIds },
    submitted_at: value.submittedAt.toISOString(),
    attempts: value.attempts.map(attemptOutput),
  };
}

function collaborationOutput(value: CollaborationSubmissionRecord) {
  return {
    id: value.id,
    round_id: value.roundId,
    child_id: value.childId,
    status: value.status,
    content: { text: value.text, media_ids: value.mediaIds },
    submitted_at: value.submittedAt.toISOString(),
    attempts: value.attempts.map(attemptOutput),
  };
}

function mapError(context: Context<AppEnvironment>, error: unknown) {
  if (!(error instanceof CheckInError)) throw error;
  const status = {
    UNAUTHORIZED: 401,
    INVALID: 400,
    NOT_FOUND: 404,
    CONFLICT: 409,
  }[error.code] as 400 | 401 | 404 | 409;
  const code =
    error.code === 'UNAUTHORIZED'
      ? ERROR_CODES.UNAUTHORIZED
      : error.code === 'NOT_FOUND'
        ? ERROR_CODES.NOT_FOUND
        : error.code === 'CONFLICT'
          ? ERROR_CODES.CONFLICT
          : ERROR_CODES.INVALID_REQUEST;
  return context.json(createErrorResponse(code, error.message, context.get('requestId')), status);
}

function idempotencyKey(context: Context<AppEnvironment>): string | undefined {
  const value = context.req.header('Idempotency-Key');
  return value && value.length <= 128 ? value : undefined;
}

export function registerCheckInRoutes(
  api: Hono<AppEnvironment>,
  operations: CheckInOperations,
  secureCookies: boolean,
): void {
  api.post('/check-ins', async (context) => {
    const parsed = checkInSchema.safeParse(await json(context));
    const key = idempotencyKey(context);
    if (!parsed.success || !key) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid check-in request.',
          context.get('requestId'),
        ),
        400,
      );
    }
    try {
      const result = await operations.submit({
        ...sessionInput(context),
        assignmentId: parsed.data.task_assignment_id,
        idempotencyKey: key,
        ...(parsed.data.check_date === undefined ? {} : { checkDate: parsed.data.check_date }),
        content: {
          ...(parsed.data.content.text === undefined ? {} : { text: parsed.data.content.text }),
          mediaIds: parsed.data.content.media_ids,
        },
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { check_in: checkInOutput(result.checkIn) },
          context.get('requestId'),
        ),
        201,
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.get('/check-ins/:id', async (context) => {
    try {
      const result = await operations.get({
        ...sessionInput(context),
        checkInId: context.req.param('id'),
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { check_in: checkInOutput(result.checkIn) },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.post('/collaboration-rounds/:roundId/submissions', async (context) => {
    const parsed = collaborationSchema.safeParse(await json(context));
    const key = idempotencyKey(context);
    if (!parsed.success || !key) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid collaboration submission.',
          context.get('requestId'),
        ),
        400,
      );
    }
    try {
      const result = await operations.submitCollaboration({
        ...sessionInput(context),
        roundId: context.req.param('roundId'),
        idempotencyKey: key,
        content: {
          ...(parsed.data.content.text === undefined ? {} : { text: parsed.data.content.text }),
          mediaIds: parsed.data.content.media_ids,
        },
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { submission: collaborationOutput(result.submission) },
          context.get('requestId'),
        ),
        201,
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.get('/collaboration-rounds/:roundId/submissions', async (context) => {
    try {
      const result = await operations.listCollaboration({
        ...sessionInput(context),
        roundId: context.req.param('roundId'),
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { submissions: result.submissions.map(collaborationOutput) },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });
}
