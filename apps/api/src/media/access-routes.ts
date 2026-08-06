import { ERROR_CODES } from '@familystar/shared';
import type { Context, Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';

import { SESSION_TTL_SECONDS } from '../family-auth/constants.js';
import { InvalidQueryFilterError, parseUuidFilter } from '../http/query-validation.js';
import { createErrorResponse, createSuccessResponse } from '../http/responses.js';
import type { AppEnvironment } from '../http/types.js';
import { MediaAccessError } from './access-service.js';
import type { MediaAccessOperations } from './access-types.js';

const requestSchema = z.object({ media_ids: z.array(z.string()).min(1).max(50) }).strict();

async function json(context: Context<AppEnvironment>): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return undefined;
  }
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

function mapError(context: Context<AppEnvironment>, error: unknown) {
  if (error instanceof InvalidQueryFilterError) {
    return context.json(
      createErrorResponse(ERROR_CODES.INVALID_REQUEST, error.message, context.get('requestId')),
      400,
    );
  }
  if (!(error instanceof MediaAccessError)) throw error;
  const status = { UNAUTHORIZED: 401, INVALID: 400, NOT_FOUND: 404, UNAVAILABLE: 503 }[
    error.code
  ] as 400 | 401 | 404 | 503;
  const code =
    error.code === 'UNAUTHORIZED'
      ? ERROR_CODES.UNAUTHORIZED
      : error.code === 'INVALID'
        ? ERROR_CODES.INVALID_REQUEST
        : error.code === 'NOT_FOUND'
          ? ERROR_CODES.NOT_FOUND
          : ERROR_CODES.INTERNAL_ERROR;
  return context.json(createErrorResponse(code, error.message, context.get('requestId')), status);
}

export function registerMediaAccessRoutes(
  api: Hono<AppEnvironment>,
  operations: MediaAccessOperations,
  secureCookies: boolean,
): void {
  api.post('/media/access-urls', async (context) => {
    const parsed = requestSchema.safeParse(await json(context));
    if (!parsed.success) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid media access request.',
          context.get('requestId'),
        ),
        400,
      );
    }
    try {
      const mediaIds = parsed.data.media_ids.map((id) => {
        const parsedId = parseUuidFilter(id, 'media_ids item');
        if (!parsedId) throw new InvalidQueryFilterError('media_ids item is required.');
        return parsedId;
      });
      if (new Set(mediaIds).size !== mediaIds.length) {
        throw new InvalidQueryFilterError('media_ids must contain unique values.');
      }
      const token = getCookie(context, 'familystar_session');
      const result = await operations.createAccessUrls({
        ...(token === undefined ? {} : { sessionToken: token }),
        mediaIds,
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse(
          {
            items: result.items.map((item) => ({
              media_id: item.mediaId,
              url: item.url,
              expires_at: item.expiresAt.toISOString(),
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
