import { ERROR_CODES } from '@familystar/shared';
import type { GrowthRecordType } from '@prisma/client';
import type { Context, Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';

import { SESSION_TTL_SECONDS } from '../family-auth/constants.js';
import { InvalidPaginationError, parseCursorPageQuery } from '../http/cursor.js';
import {
  InvalidQueryFilterError,
  parseEnumFilter,
  parseUuidFilter,
} from '../http/query-validation.js';
import { createErrorResponse, createSuccessResponse } from '../http/responses.js';
import type { AppEnvironment } from '../http/types.js';
import { GrowthRecordAccessError, InvalidGrowthRecordInputError } from './service.js';
import type {
  GrowthRecordItem,
  GrowthRecordOperations,
  GrowthRecordQuery,
  ManualGrowthRecordInput,
  ManualGrowthRecordPatch,
} from './types.js';

const recordTypes = ['CHECK_IN', 'NOTE', 'MILESTONE'] as const;
const manualTypes = ['NOTE', 'MILESTONE'] as const;
const recordSchema = z
  .object({
    child_id: z.string().uuid(),
    task_id: z.string().uuid().nullable().optional(),
    type: z.enum(manualTypes),
    title: z.string().trim().min(1).max(120),
    content_text: z.string().trim().max(10_000).nullable().optional(),
    occurred_on: z.string(),
    media_ids: z.array(z.string().uuid()).max(10).default([]),
  })
  .strict();
const recordPatchSchema = recordSchema
  .omit({ media_ids: true })
  .partial()
  .extend({ media_ids: z.array(z.string().uuid()).max(10).optional() })
  .refine((value) => Object.keys(value).length > 0);
const recordIdSchema = z.string().uuid();

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

function query(context: Context<AppEnvironment>): GrowthRecordQuery {
  const cursor = context.req.query('cursor');
  const limit = context.req.query('limit');
  const page = parseCursorPageQuery({
    ...(cursor === undefined ? {} : { cursor }),
    ...(limit === undefined ? {} : { limit }),
  });
  const childId = parseUuidFilter(context.req.query('child_id'), 'child_id');
  const taskId = parseUuidFilter(context.req.query('task_id'), 'task_id');
  const type = parseEnumFilter(context.req.query('type'), recordTypes, 'type');
  const startDate = context.req.query('start_date');
  const endDate = context.req.query('end_date');
  return {
    ...page,
    ...(childId === undefined ? {} : { childId }),
    ...(taskId === undefined ? {} : { taskId }),
    ...(type === undefined ? {} : { type: type as GrowthRecordType }),
    ...(startDate === undefined ? {} : { startDate }),
    ...(endDate === undefined ? {} : { endDate }),
  };
}

function input(value: z.infer<typeof recordSchema>): Omit<ManualGrowthRecordInput, 'occurredOn'> & {
  occurredOn: string;
} {
  return {
    childId: value.child_id,
    type: value.type,
    title: value.title,
    occurredOn: value.occurred_on,
    mediaIds: value.media_ids,
    ...(value.task_id === undefined ? {} : { taskId: value.task_id }),
    ...(value.content_text === undefined ? {} : { contentText: value.content_text }),
  };
}

function patch(value: z.infer<typeof recordPatchSchema>): Omit<
  ManualGrowthRecordPatch,
  'occurredOn'
> & {
  occurredOn?: string;
} {
  return {
    ...(value.child_id === undefined ? {} : { childId: value.child_id }),
    ...(value.task_id === undefined ? {} : { taskId: value.task_id }),
    ...(value.type === undefined ? {} : { type: value.type }),
    ...(value.title === undefined ? {} : { title: value.title }),
    ...(value.content_text === undefined ? {} : { contentText: value.content_text }),
    ...(value.occurred_on === undefined ? {} : { occurredOn: value.occurred_on }),
    ...(value.media_ids === undefined ? {} : { mediaIds: value.media_ids }),
  };
}

function output(value: GrowthRecordItem) {
  return {
    id: value.id,
    child: value.child,
    task: value.task,
    type: value.type,
    title: value.title,
    content_text: value.contentText,
    occurred_on: value.occurredOn.toISOString().slice(0, 10),
    source_type: value.sourceType,
    source_id: value.sourceId,
    points_earned: value.pointsEarned,
    created_by: value.createdById,
    created_at: value.createdAt.toISOString(),
    updated_at: value.updatedAt.toISOString(),
    media: value.media.map((media) => ({
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
  if (
    error instanceof z.ZodError ||
    error instanceof InvalidPaginationError ||
    error instanceof InvalidQueryFilterError ||
    error instanceof InvalidGrowthRecordInputError
  ) {
    return context.json(
      createErrorResponse(
        ERROR_CODES.INVALID_REQUEST,
        'The growth record input is invalid.',
        context.get('requestId'),
      ),
      400,
    );
  }
  if (!(error instanceof GrowthRecordAccessError)) throw error;
  const status = { UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404 }[error.code] as
    401 | 403 | 404;
  const code = {
    UNAUTHORIZED: ERROR_CODES.UNAUTHORIZED,
    FORBIDDEN: ERROR_CODES.FORBIDDEN,
    NOT_FOUND: ERROR_CODES.NOT_FOUND,
  }[error.code];
  return context.json(createErrorResponse(code, error.message, context.get('requestId')), status);
}

export function registerGrowthRecordRoutes(
  api: Hono<AppEnvironment>,
  operations: GrowthRecordOperations,
  secureCookies: boolean,
): void {
  api.get('/family/growth-records', async (context) => {
    try {
      const result = await operations.list({ ...sessionInput(context), ...query(context) });
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
  });

  api.post('/family/growth-records', async (context) => {
    try {
      const body = recordSchema.parse(await json(context));
      const result = await operations.create({ ...sessionInput(context), record: input(body) });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse({ record: output(result.record) }, context.get('requestId')),
        201,
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.patch('/family/growth-records/:recordId', async (context) => {
    try {
      const recordId = recordIdSchema.parse(context.req.param('recordId'));
      const body = recordPatchSchema.parse(await json(context));
      const result = await operations.update({
        ...sessionInput(context),
        recordId,
        record: patch(body),
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse({ record: output(result.record) }, context.get('requestId')),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.delete('/family/growth-records/:recordId', async (context) => {
    try {
      const recordId = recordIdSchema.parse(context.req.param('recordId'));
      await operations.remove({ ...sessionInput(context), recordId });
      renew(context, secureCookies);
      return context.body(null, 204);
    } catch (error) {
      return mapError(context, error);
    }
  });
}
