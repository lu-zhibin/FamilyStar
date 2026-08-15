import { ERROR_CODES } from '@familystar/shared';
import type { Context, Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';

import { SESSION_TTL_SECONDS } from '../family-auth/constants.js';
import { createErrorResponse, createSuccessResponse } from '../http/responses.js';
import type { AppEnvironment } from '../http/types.js';
import { InvalidThemeError, ThemeAccessError, ThemeLockedError } from './service.js';
import type { ThemeOperations, ThemeView } from './types.js';

const selectionSchema = z
  .object({
    theme_key: z
      .string()
      .min(1)
      .max(40)
      .regex(/^[a-z][a-z0-9-]*$/),
  })
  .strict();

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

function output(theme: ThemeView) {
  return {
    key: theme.key,
    name: theme.name,
    description: theme.description,
    minimum_level: theme.minimumLevel,
    tokens: theme.tokens,
    unlocked: theme.unlocked,
    selected: theme.selected,
  };
}

function mapError(context: Context<AppEnvironment>, error: unknown) {
  if (error instanceof z.ZodError || error instanceof InvalidThemeError) {
    return context.json(
      createErrorResponse(
        ERROR_CODES.INVALID_REQUEST,
        error instanceof InvalidThemeError ? error.message : 'The theme selection is invalid.',
        context.get('requestId'),
      ),
      400,
    );
  }
  if (error instanceof ThemeLockedError) {
    return context.json(
      createErrorResponse(
        ERROR_CODES.CONFLICT,
        error.message,
        context.get('requestId'),
        undefined,
        {
          theme_key: error.themeKey,
          required_level: error.requiredLevel,
          current_level: error.currentLevel,
        },
      ),
      409,
    );
  }
  if (!(error instanceof ThemeAccessError)) throw error;
  const status = { UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404 }[error.code] as
    401 | 403 | 404;
  const code = {
    UNAUTHORIZED: ERROR_CODES.UNAUTHORIZED,
    FORBIDDEN: ERROR_CODES.FORBIDDEN,
    NOT_FOUND: ERROR_CODES.NOT_FOUND,
  }[error.code];
  return context.json(createErrorResponse(code, error.message, context.get('requestId')), status);
}

export function registerThemeRoutes(
  api: Hono<AppEnvironment>,
  operations: ThemeOperations,
  secureCookies: boolean,
): void {
  api.get('/themes', async (context) => {
    try {
      const result = await operations.getCatalog(sessionInput(context));
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse(
          {
            current_level: result.currentLevel,
            selected_theme: result.selectedTheme,
            themes: result.themes.map(output),
          },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.patch('/themes/selection', async (context) => {
    try {
      const body = selectionSchema.parse(await context.req.json().catch(() => undefined));
      const result = await operations.select({
        ...sessionInput(context),
        themeKey: body.theme_key,
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { selected_theme: result.selectedTheme, theme: output(result.theme) },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });
}
