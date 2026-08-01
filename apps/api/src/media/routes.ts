import { ERROR_CODES } from '@familystar/shared';
import type { Context, Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';

import { SESSION_TTL_SECONDS } from '../family-auth/constants.js';
import { createErrorResponse, createSuccessResponse } from '../http/responses.js';
import type { AppEnvironment } from '../http/types.js';
import { MediaError } from './service.js';
import type { MediaOperations, MediaUploadSessionRecord } from './types.js';
import { MAX_VIDEO_BYTES } from './validation.js';

const initializeSchema = z
  .object({
    type: z.enum(['IMAGE', 'VIDEO', 'AUDIO']),
    mime_type: z.string().trim().min(1).max(255),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    size_bytes: z.number().int().positive().max(MAX_VIDEO_BYTES),
    duration: z.number().nonnegative().optional(),
  })
  .strict();
const partSchema = z
  .object({
    etag: z.string().trim().min(1).max(255),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    size_bytes: z.number().int().positive().max(MAX_VIDEO_BYTES),
  })
  .strict();
const completeSchema = z.object({}).strict();

function sessionToken(context: Context<AppEnvironment>): string | undefined {
  return getCookie(context, 'familystar_session');
}

function sessionInput(context: Context<AppEnvironment>): { sessionToken?: string } {
  const value = sessionToken(context);
  return value ? { sessionToken: value } : {};
}

function renew(context: Context<AppEnvironment>, secure: boolean): void {
  const value = sessionToken(context);
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

function output(upload: MediaUploadSessionRecord) {
  return {
    id: upload.id,
    media_id: upload.asset.id,
    status: upload.status,
    failure_code: upload.failureCode,
    mime_type: upload.asset.mimeType,
    media_type: upload.asset.type,
    size_bytes: upload.asset.sizeBytes,
    duration: upload.asset.duration,
    parts: upload.parts.map((part) => ({
      part_number: part.partNumber,
      etag: part.etag,
      checksum: part.checksum,
      size_bytes: part.sizeBytes,
    })),
  };
}

function errorResponse(context: Context<AppEnvironment>, error: unknown) {
  if (!(error instanceof MediaError)) throw error;
  const status = {
    UNAUTHORIZED: 401,
    INVALID: 400,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNAVAILABLE: 503,
  }[error.code] as 400 | 401 | 404 | 409 | 503;
  const code =
    error.code === 'UNAUTHORIZED'
      ? ERROR_CODES.UNAUTHORIZED
      : error.code === 'NOT_FOUND'
        ? ERROR_CODES.NOT_FOUND
        : error.code === 'CONFLICT'
          ? ERROR_CODES.CONFLICT
          : error.code === 'INVALID'
            ? ERROR_CODES.INVALID_REQUEST
            : ERROR_CODES.INTERNAL_ERROR;
  return context.json(createErrorResponse(code, error.message, context.get('requestId')), status);
}

function partNumber(context: Context<AppEnvironment>): number {
  return Number(context.req.param('partNumber'));
}

export function registerMediaRoutes(
  api: Hono<AppEnvironment>,
  operations: MediaOperations,
  secureCookies: boolean,
): void {
  api.post('/media/uploads', async (context) => {
    const parsed = initializeSchema.safeParse(await json(context));
    const idempotencyKey = context.req.header('Idempotency-Key');
    if (!parsed.success || !idempotencyKey || idempotencyKey.length > 128) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid media upload request.',
          context.get('requestId'),
        ),
        400,
      );
    }
    try {
      const result = await operations.initialize({
        ...sessionInput(context),
        idempotencyKey,
        type: parsed.data.type,
        mimeType: parsed.data.mime_type,
        checksum: parsed.data.checksum,
        sizeBytes: parsed.data.size_bytes,
        ...(parsed.data.duration === undefined ? {} : { duration: parsed.data.duration }),
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse({ upload: output(result.upload) }, context.get('requestId')),
        201,
      );
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  api.post('/media/uploads/:id/parts/:partNumber/authorize', async (context) => {
    try {
      const result = await operations.authorizePart({
        ...sessionInput(context),
        uploadId: context.req.param('id'),
        partNumber: partNumber(context),
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { url: result.url, expires_at: result.expiresAt.toISOString() },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  api.put('/media/uploads/:id/parts/:partNumber', async (context) => {
    const parsed = partSchema.safeParse(await json(context));
    if (!parsed.success) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid upload part.',
          context.get('requestId'),
        ),
        400,
      );
    }
    try {
      const result = await operations.confirmPart({
        ...sessionInput(context),
        uploadId: context.req.param('id'),
        partNumber: partNumber(context),
        etag: parsed.data.etag,
        checksum: parsed.data.checksum,
        sizeBytes: parsed.data.size_bytes,
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse({ upload: output(result.upload) }, context.get('requestId')),
      );
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  api.post('/media/uploads/:id/complete', async (context) => {
    const parsed = completeSchema.safeParse((await json(context)) ?? {});
    if (!parsed.success) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid upload completion.',
          context.get('requestId'),
        ),
        400,
      );
    }
    try {
      const result = await operations.complete({
        ...sessionInput(context),
        uploadId: context.req.param('id'),
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse({ upload: output(result.upload) }, context.get('requestId')),
      );
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  api.post('/media/uploads/:id/retry', async (context) => {
    try {
      const result = await operations.retry({
        ...sessionInput(context),
        uploadId: context.req.param('id'),
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse({ upload: output(result.upload) }, context.get('requestId')),
      );
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  api.get('/media/:id/access-url', async (context) => {
    try {
      const result = await operations.accessUrl({
        ...sessionInput(context),
        mediaId: context.req.param('id'),
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { url: result.url, expires_at: result.expiresAt.toISOString() },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return errorResponse(context, error);
    }
  });
}
