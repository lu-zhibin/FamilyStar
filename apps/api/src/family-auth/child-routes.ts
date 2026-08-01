import { ERROR_CODES } from '@familystar/shared';
import type { Context, Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';

import { createErrorResponse, createSuccessResponse } from '../http/responses.js';
import type { AppEnvironment } from '../http/types.js';
import {
  ChildAuthenticationError,
  type ChildAccountOperations,
  ChildLockedError,
  ChildLoginRateLimitError,
  ChildNotFoundError,
  InvalidChildAvatarError,
  InvalidChildCredentialError,
  ParentSessionRequiredError,
} from './child-service.js';
import { SESSION_TTL_SECONDS } from './constants.js';

const nullableText = z.string().trim().max(80).nullable().optional();
const nullableUuid = z.string().uuid().nullable().optional();
const nullableDate = z.iso.date().nullable().optional();
const credentialType = z.enum(['pin', 'password']);
const gender = z.enum(['male', 'female']);

const childCreateSchema = z
  .object({
    nickname: z.string().trim().min(1).max(80),
    credential_type: credentialType,
    credential: z.string().min(1),
    gender,
    birthday: nullableDate,
    grade: nullableText,
    avatar_media_id: nullableUuid,
  })
  .strict();

const childUpdateSchema = z
  .object({
    nickname: z.string().trim().min(1).max(80).optional(),
    credential_type: credentialType.optional(),
    credential: z.string().min(1).optional(),
    gender: gender.optional(),
    birthday: nullableDate,
    grade: nullableText,
    avatar_media_id: nullableUuid,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0)
  .refine((value) => value.credential_type === undefined || value.credential !== undefined);

const switchSchema = z
  .object({
    child_id: z.string().uuid(),
    credential: z.string().min(1),
  })
  .strict();

const passwordChangeSchema = z
  .object({
    current_password: z.string().min(1),
    new_password: z.string().min(1),
  })
  .strict();

async function readJson(context: Context<AppEnvironment>): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return undefined;
  }
}

function sessionToken(context: Context<AppEnvironment>): string | undefined {
  return getCookie(context, 'familystar_session');
}

function sessionInput(context: Context<AppEnvironment>): { sessionToken?: string } {
  const token = sessionToken(context);
  return token === undefined ? {} : { sessionToken: token };
}

function renewCurrentSession(context: Context<AppEnvironment>, secure: boolean): void {
  const token = sessionToken(context);
  if (token) attachSessionCookie(context, token, secure);
}

function attachSessionCookie(
  context: Context<AppEnvironment>,
  token: string,
  secure: boolean,
): void {
  setCookie(context, 'familystar_session', token, {
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
    sameSite: 'Lax',
    secure,
  });
}

function mapError(context: Context<AppEnvironment>, error: unknown) {
  if (error instanceof ChildLoginRateLimitError) {
    return context.json(
      createErrorResponse(
        ERROR_CODES.RATE_LIMITED,
        error.message,
        context.get('requestId'),
        undefined,
        { retry_after_seconds: error.retryAfterSeconds },
      ),
      429,
    );
  }
  if (error instanceof ChildLockedError) {
    return context.json(
      createErrorResponse(
        ERROR_CODES.UNAUTHORIZED,
        error.message,
        context.get('requestId'),
        undefined,
        { remaining_seconds: error.remainingSeconds },
      ),
      401,
    );
  }
  if (error instanceof ParentSessionRequiredError || error instanceof ChildAuthenticationError) {
    return context.json(
      createErrorResponse(ERROR_CODES.UNAUTHORIZED, error.message, context.get('requestId')),
      401,
    );
  }
  if (error instanceof ChildNotFoundError) {
    return context.json(
      createErrorResponse(ERROR_CODES.NOT_FOUND, error.message, context.get('requestId')),
      404,
    );
  }
  if (error instanceof InvalidChildCredentialError || error instanceof InvalidChildAvatarError) {
    return context.json(
      createErrorResponse(ERROR_CODES.INVALID_REQUEST, error.message, context.get('requestId')),
      400,
    );
  }
  throw error;
}

export function registerChildAccountRoutes(
  api: Hono<AppEnvironment>,
  service: ChildAccountOperations,
  secureCookies: boolean,
): void {
  api.get('/family/children', async (context) => {
    try {
      const result = await service.list(sessionInput(context));
      renewCurrentSession(context, secureCookies);
      return context.json(createSuccessResponse(result, context.get('requestId')));
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.post('/family/children', async (context) => {
    const parsed = childCreateSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid child profile request.',
          context.get('requestId'),
        ),
        400,
      );
    }
    try {
      const result = await service.create({
        ...sessionInput(context),
        nickname: parsed.data.nickname,
        credentialType: parsed.data.credential_type,
        credential: parsed.data.credential,
        gender: parsed.data.gender,
        ...(parsed.data.birthday === undefined ? {} : { birthday: parsed.data.birthday }),
        ...(parsed.data.grade === undefined ? {} : { grade: parsed.data.grade }),
        ...(parsed.data.avatar_media_id === undefined
          ? {}
          : { avatarMediaId: parsed.data.avatar_media_id }),
      });
      renewCurrentSession(context, secureCookies);
      return context.json(createSuccessResponse(result, context.get('requestId')), 201);
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.patch('/family/children/:childId', async (context) => {
    const parsed = childUpdateSchema.safeParse(await readJson(context));
    const childId = z.string().uuid().safeParse(context.req.param('childId'));
    if (!parsed.success || !childId.success) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid child profile update.',
          context.get('requestId'),
        ),
        400,
      );
    }
    try {
      const result = await service.update({
        ...sessionInput(context),
        childId: childId.data,
        ...(parsed.data.nickname === undefined ? {} : { nickname: parsed.data.nickname }),
        ...(parsed.data.credential_type === undefined
          ? {}
          : { credentialType: parsed.data.credential_type }),
        ...(parsed.data.credential === undefined ? {} : { credential: parsed.data.credential }),
        ...(parsed.data.gender === undefined ? {} : { gender: parsed.data.gender }),
        ...(parsed.data.birthday === undefined ? {} : { birthday: parsed.data.birthday }),
        ...(parsed.data.grade === undefined ? {} : { grade: parsed.data.grade }),
        ...(parsed.data.avatar_media_id === undefined
          ? {}
          : { avatarMediaId: parsed.data.avatar_media_id }),
      });
      renewCurrentSession(context, secureCookies);
      return context.json(createSuccessResponse(result, context.get('requestId')));
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.delete('/family/children/:childId', async (context) => {
    const childId = z.string().uuid().safeParse(context.req.param('childId'));
    if (!childId.success) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid child profile identifier.',
          context.get('requestId'),
        ),
        400,
      );
    }
    try {
      const result = await service.remove({
        ...sessionInput(context),
        childId: childId.data,
      });
      renewCurrentSession(context, secureCookies);
      return context.json(createSuccessResponse(result, context.get('requestId')));
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.get('/auth/switch-targets', async (context) => {
    try {
      const result = await service.listSwitchTargets(sessionInput(context));
      renewCurrentSession(context, secureCookies);
      return context.json(createSuccessResponse(result, context.get('requestId')));
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.post('/auth/child/switch', async (context) => {
    const parsed = switchSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid account switch request.',
          context.get('requestId'),
        ),
        400,
      );
    }
    try {
      const result = await service.switchToChild({
        ...sessionInput(context),
        childId: parsed.data.child_id,
        credential: parsed.data.credential,
      });
      attachSessionCookie(context, result.sessionToken, secureCookies);
      return context.json(createSuccessResponse({ child: result.child }, context.get('requestId')));
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.patch('/auth/child/password', async (context) => {
    const parsed = passwordChangeSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid child password request.',
          context.get('requestId'),
        ),
        400,
      );
    }
    try {
      const result = await service.changeOwnPassword({
        ...sessionInput(context),
        currentPassword: parsed.data.current_password,
        newPassword: parsed.data.new_password,
      });
      deleteCookie(context, 'familystar_session', { path: '/', secure: secureCookies });
      return context.json(createSuccessResponse(result, context.get('requestId')));
    } catch (error) {
      return mapError(context, error);
    }
  });
}
