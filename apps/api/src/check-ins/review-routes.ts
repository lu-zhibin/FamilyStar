import { ERROR_CODES } from '@familystar/shared';
import type { Context, Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';

import { SESSION_TTL_SECONDS } from '../family-auth/constants.js';
import { createErrorResponse, createSuccessResponse } from '../http/responses.js';
import type { AppEnvironment } from '../http/types.js';
import { SubmissionReviewError } from './review-service.js';
import type { SubmissionReviewOperations, SubmissionReviewRecord } from './review-types.js';

const reviewSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED']),
    reason: z.string().max(2_000).optional(),
  })
  .strict();

function sessionInput(context: Context<AppEnvironment>): { sessionToken?: string } {
  const sessionToken = getCookie(context, 'familystar_session');
  return sessionToken ? { sessionToken } : {};
}

function renew(context: Context<AppEnvironment>, secure: boolean): void {
  const sessionToken = getCookie(context, 'familystar_session');
  if (!sessionToken) return;
  setCookie(context, 'familystar_session', sessionToken, {
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

function idempotencyKey(context: Context<AppEnvironment>): string | undefined {
  const value = context.req.header('Idempotency-Key');
  return value && value.length <= 128 ? value : undefined;
}

function output(review: SubmissionReviewRecord) {
  return {
    id: review.id,
    target_type: review.targetType,
    target_id: review.targetId,
    attempt_id: review.attemptId,
    status: review.decision,
    source: review.source,
    reason: review.reason,
    reviewer_id: review.reviewerId,
    reviewed_at: review.reviewedAt.toISOString(),
  };
}

function mapError(context: Context<AppEnvironment>, error: unknown) {
  if (!(error instanceof SubmissionReviewError)) throw error;
  const status = {
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    INVALID: 400,
    NOT_FOUND: 404,
    CONFLICT: 409,
  }[error.code] as 400 | 401 | 403 | 404 | 409;
  const code = {
    UNAUTHORIZED: ERROR_CODES.UNAUTHORIZED,
    FORBIDDEN: ERROR_CODES.FORBIDDEN,
    INVALID: ERROR_CODES.INVALID_REQUEST,
    NOT_FOUND: ERROR_CODES.NOT_FOUND,
    CONFLICT: ERROR_CODES.CONFLICT,
  }[error.code];
  return context.json(createErrorResponse(code, error.message, context.get('requestId')), status);
}

export function registerSubmissionReviewRoutes(
  api: Hono<AppEnvironment>,
  operations: SubmissionReviewOperations,
  secureCookies: boolean,
): void {
  const register = (
    path: string,
    review: (
      input: Parameters<SubmissionReviewOperations['reviewCheckIn']>[0],
    ) => Promise<{ review: SubmissionReviewRecord }>,
    list: (
      input: Parameters<SubmissionReviewOperations['listCheckInReviews']>[0],
    ) => Promise<{ reviews: readonly SubmissionReviewRecord[] }>,
  ) => {
    api.post(path, async (context) => {
      const parsed = reviewSchema.safeParse(await json(context));
      const key = idempotencyKey(context);
      if (!parsed.success || !key) {
        return context.json(
          createErrorResponse(
            ERROR_CODES.INVALID_REQUEST,
            'Invalid submission review request.',
            context.get('requestId'),
          ),
          400,
        );
      }
      try {
        const result = await review({
          ...sessionInput(context),
          checkInId: context.req.param('id')!,
          idempotencyKey: key,
          decision: parsed.data.status,
          ...(parsed.data.reason === undefined ? {} : { reason: parsed.data.reason }),
        });
        renew(context, secureCookies);
        return context.json(
          createSuccessResponse({ review: output(result.review) }, context.get('requestId')),
        );
      } catch (error) {
        return mapError(context, error);
      }
    });

    api.get(path, async (context) => {
      try {
        const result = await list({
          ...sessionInput(context),
          checkInId: context.req.param('id')!,
        });
        renew(context, secureCookies);
        return context.json(
          createSuccessResponse({ reviews: result.reviews.map(output) }, context.get('requestId')),
        );
      } catch (error) {
        return mapError(context, error);
      }
    });
  };

  register(
    '/check-ins/:id/reviews',
    (input) => operations.reviewCheckIn(input),
    (input) => operations.listCheckInReviews(input),
  );

  api.post('/collaboration-submissions/:id/reviews', async (context) => {
    const parsed = reviewSchema.safeParse(await json(context));
    const key = idempotencyKey(context);
    if (!parsed.success || !key) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid submission review request.',
          context.get('requestId'),
        ),
        400,
      );
    }
    try {
      const result = await operations.reviewCollaborationSubmission({
        ...sessionInput(context),
        submissionId: context.req.param('id'),
        idempotencyKey: key,
        decision: parsed.data.status,
        ...(parsed.data.reason === undefined ? {} : { reason: parsed.data.reason }),
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse({ review: output(result.review) }, context.get('requestId')),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.get('/collaboration-submissions/:id/reviews', async (context) => {
    try {
      const result = await operations.listCollaborationSubmissionReviews({
        ...sessionInput(context),
        submissionId: context.req.param('id'),
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse({ reviews: result.reviews.map(output) }, context.get('requestId')),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });
}
