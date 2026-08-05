import { ERROR_CODES } from '@familystar/shared';
import type { Context, Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';

import { createErrorResponse, createSuccessResponse } from '../http/responses.js';
import type { AppEnvironment } from '../http/types.js';
import { SESSION_TTL_SECONDS } from './constants.js';
import {
  FamilyParentLimitError,
  InvalidInvitationTokenError,
  InvitationAuthenticationError,
  InvitationCreatorRequiredError,
  InvitationExpiredError,
  type InvitationOperations,
  InvitationUnavailableError,
} from './invitation-service.js';
import { InvalidParentPasswordError } from './password.js';
import {
  FamilyAuthService,
  InvalidAuthSessionError,
  InvalidParentCredentialsError,
  ParentEmailConflictError,
} from './service.js';

const registerSchema = z
  .object({
    family_name: z.string().trim().min(1).max(120),
    nickname: z.string().trim().min(1).max(80),
    email: z.email().max(320),
    password: z.string(),
    time_zone: z.string().max(100).optional(),
  })
  .strict();
const loginSchema = z
  .object({
    email: z.email().max(320),
    password: z.string().min(1),
  })
  .strict();
const createInvitationSchema = z.object({ email: z.email().max(320) }).strict();
const invitationIdSchema = z.string().uuid();
const acceptInvitationSchema = z
  .object({
    token: z.string().min(32).max(256),
    nickname: z.string().trim().min(1).max(80),
    password: z.string(),
  })
  .strict();

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

async function readJson(context: Context<AppEnvironment>): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return undefined;
  }
}

export function registerFamilyAuthRoutes(
  api: Hono<AppEnvironment>,
  service: FamilyAuthService,
  secureCookies: boolean,
  invitationService?: InvitationOperations,
): void {
  api.get('/auth/session', async (context) => {
    try {
      const session = await service.getSession(context.get('authSession'));
      const token = context.get('sessionToken');
      if (!token) throw new InvalidAuthSessionError();
      attachSessionCookie(context, token, secureCookies);
      return context.json(
        createSuccessResponse(
          {
            role: session.role,
            subject_id: session.subjectId,
            family_id: session.familyId,
            family_code: session.familyCode,
          },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      if (error instanceof InvalidAuthSessionError) {
        return context.json(
          createErrorResponse(ERROR_CODES.UNAUTHORIZED, error.message, context.get('requestId')),
          401,
        );
      }
      throw error;
    }
  });

  api.post('/auth/parent/register', async (context) => {
    const parsed = registerSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid registration request.',
          context.get('requestId'),
        ),
        400,
      );
    }
    try {
      const result = await service.register({
        familyName: parsed.data.family_name,
        nickname: parsed.data.nickname,
        email: parsed.data.email,
        password: parsed.data.password,
        ...(parsed.data.time_zone === undefined ? {} : { timeZone: parsed.data.time_zone }),
      });
      attachSessionCookie(context, result.sessionToken, secureCookies);
      return context.json(
        createSuccessResponse({ parent: result.parent }, context.get('requestId')),
        201,
      );
    } catch (error) {
      if (error instanceof InvalidParentPasswordError) {
        return context.json(
          createErrorResponse(ERROR_CODES.INVALID_REQUEST, error.message, context.get('requestId')),
          400,
        );
      }
      if (error instanceof ParentEmailConflictError) {
        return context.json(
          createErrorResponse(ERROR_CODES.CONFLICT, error.message, context.get('requestId')),
          409,
        );
      }
      throw error;
    }
  });

  api.post('/auth/parent/login', async (context) => {
    const parsed = loginSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid login request.',
          context.get('requestId'),
        ),
        400,
      );
    }
    try {
      const result = await service.login(parsed.data);
      attachSessionCookie(context, result.sessionToken, secureCookies);
      return context.json(
        createSuccessResponse({ parent: result.parent }, context.get('requestId')),
      );
    } catch (error) {
      if (error instanceof InvalidParentCredentialsError) {
        return context.json(
          createErrorResponse(ERROR_CODES.UNAUTHORIZED, error.message, context.get('requestId')),
          401,
        );
      }
      throw error;
    }
  });

  api.post('/auth/logout', async (context) => {
    const sessionToken = context.get('sessionToken');
    if (!sessionToken) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.UNAUTHORIZED,
          'A valid session is required.',
          context.get('requestId'),
        ),
        401,
      );
    }
    await service.logout(sessionToken);
    deleteCookie(context, 'familystar_session', { path: '/', secure: secureCookies });
    return context.json(createSuccessResponse({ logged_out: true }, context.get('requestId')));
  });

  if (!invitationService) return;

  api.post('/auth/parent/invitations', async (context) => {
    const parsed = createInvitationSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid invitation request.',
          context.get('requestId'),
        ),
        400,
      );
    }
    try {
      const sessionToken = getCookie(context, 'familystar_session');
      const result = await invitationService.create({
        ...(sessionToken === undefined ? {} : { sessionToken }),
        email: parsed.data.email,
        correlationId: context.get('requestId'),
      });
      if (sessionToken) attachSessionCookie(context, sessionToken, secureCookies);
      return context.json(createSuccessResponse(result, context.get('requestId')), 201);
    } catch (error) {
      if (error instanceof InvitationAuthenticationError) {
        return context.json(
          createErrorResponse(ERROR_CODES.UNAUTHORIZED, error.message, context.get('requestId')),
          401,
        );
      }
      if (error instanceof InvitationCreatorRequiredError) {
        return context.json(
          createErrorResponse(ERROR_CODES.FORBIDDEN, error.message, context.get('requestId')),
          403,
        );
      }
      if (error instanceof FamilyParentLimitError || error instanceof ParentEmailConflictError) {
        return context.json(
          createErrorResponse(ERROR_CODES.CONFLICT, error.message, context.get('requestId')),
          409,
        );
      }
      throw error;
    }
  });

  api.post('/family/invitations/:id/resend', async (context) => {
    const invitationId = invitationIdSchema.safeParse(context.req.param('id'));
    if (!invitationId.success) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid invitation identifier.',
          context.get('requestId'),
        ),
        400,
      );
    }
    try {
      const sessionToken = getCookie(context, 'familystar_session');
      const result = await invitationService.resend({
        ...(sessionToken === undefined ? {} : { sessionToken }),
        invitationId: invitationId.data,
        correlationId: context.get('requestId'),
      });
      if (sessionToken) attachSessionCookie(context, sessionToken, secureCookies);
      return context.json(createSuccessResponse(result, context.get('requestId')));
    } catch (error) {
      if (error instanceof InvitationAuthenticationError) {
        return context.json(
          createErrorResponse(ERROR_CODES.UNAUTHORIZED, error.message, context.get('requestId')),
          401,
        );
      }
      if (error instanceof InvitationCreatorRequiredError) {
        return context.json(
          createErrorResponse(ERROR_CODES.FORBIDDEN, error.message, context.get('requestId')),
          403,
        );
      }
      if (error instanceof InvitationExpiredError || error instanceof InvitationUnavailableError) {
        return context.json(
          createErrorResponse(ERROR_CODES.CONFLICT, error.message, context.get('requestId')),
          409,
        );
      }
      throw error;
    }
  });

  api.delete('/family/invitations/:id', async (context) => {
    const invitationId = invitationIdSchema.safeParse(context.req.param('id'));
    if (!invitationId.success) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid invitation identifier.',
          context.get('requestId'),
        ),
        400,
      );
    }
    try {
      const sessionToken = getCookie(context, 'familystar_session');
      const result = await invitationService.revoke({
        ...(sessionToken === undefined ? {} : { sessionToken }),
        invitationId: invitationId.data,
      });
      if (sessionToken) attachSessionCookie(context, sessionToken, secureCookies);
      return context.json(createSuccessResponse(result, context.get('requestId')));
    } catch (error) {
      if (error instanceof InvitationAuthenticationError) {
        return context.json(
          createErrorResponse(ERROR_CODES.UNAUTHORIZED, error.message, context.get('requestId')),
          401,
        );
      }
      if (error instanceof InvitationCreatorRequiredError) {
        return context.json(
          createErrorResponse(ERROR_CODES.FORBIDDEN, error.message, context.get('requestId')),
          403,
        );
      }
      if (error instanceof InvitationUnavailableError) {
        return context.json(
          createErrorResponse(ERROR_CODES.CONFLICT, error.message, context.get('requestId')),
          409,
        );
      }
      throw error;
    }
  });

  api.post('/auth/parent/invitations/accept', async (context) => {
    const parsed = acceptInvitationSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid invitation acceptance request.',
          context.get('requestId'),
        ),
        400,
      );
    }
    try {
      const result = await invitationService.accept(parsed.data);
      attachSessionCookie(context, result.sessionToken, secureCookies);
      return context.json(
        createSuccessResponse({ parent: result.parent }, context.get('requestId')),
        201,
      );
    } catch (error) {
      if (error instanceof InvalidParentPasswordError) {
        return context.json(
          createErrorResponse(ERROR_CODES.INVALID_REQUEST, error.message, context.get('requestId')),
          400,
        );
      }
      if (error instanceof InvalidInvitationTokenError) {
        return context.json(
          createErrorResponse(ERROR_CODES.NOT_FOUND, error.message, context.get('requestId')),
          404,
        );
      }
      if (
        error instanceof InvitationExpiredError ||
        error instanceof InvitationUnavailableError ||
        error instanceof FamilyParentLimitError ||
        error instanceof ParentEmailConflictError
      ) {
        return context.json(
          createErrorResponse(ERROR_CODES.CONFLICT, error.message, context.get('requestId')),
          409,
        );
      }
      throw error;
    }
  });
}
