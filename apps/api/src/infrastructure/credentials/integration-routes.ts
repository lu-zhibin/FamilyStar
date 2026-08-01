import { ERROR_CODES } from '@familystar/shared';
import type { Context, Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod';

import { createErrorResponse, createSuccessResponse } from '../../http/responses.js';
import type { AppEnvironment } from '../../http/types.js';
import {
  IntegrationAuthenticationError,
  IntegrationCreatorRequiredError,
  type IntegrationSettingsOperations,
  IntegrationNotFoundError,
  IntegrationVerificationUnavailableError,
  InvalidIntegrationSettingError,
} from './integration-service.js';
import type { IntegrationType } from './vault.js';

const emailSchema = z
  .object({
    configuration: z
      .object({
        host: z.string().trim().min(1).max(253),
        port: z.number().int().min(1).max(65_535),
        tls_mode: z.enum(['none', 'starttls', 'tls']),
        from_name: z.string().trim().min(1).max(120),
        from_address: z.email().max(320),
      })
      .strict(),
    credentials: z
      .object({ username: z.string().min(1).max(320), password: z.string().min(1).max(2_000) })
      .strict()
      .optional(),
  })
  .strict();
const cosSchema = z
  .object({
    configuration: z
      .object({
        bucket: z.string().trim().min(1).max(255),
        region: z.string().trim().min(1).max(80),
        domain: z.url().max(2_000),
      })
      .strict(),
    credentials: z
      .object({ secret_id: z.string().min(1).max(512), secret_key: z.string().min(1).max(512) })
      .strict()
      .optional(),
  })
  .strict();

function type(context: Context<AppEnvironment>): IntegrationType | null {
  const value = context.req.param('type');
  return value === 'email' || value === 'cos' ? value : null;
}

function token(context: Context<AppEnvironment>): string | undefined {
  return getCookie(context, 'familystar_session');
}

function session(context: Context<AppEnvironment>): { sessionToken?: string } {
  const sessionToken = token(context);
  return sessionToken === undefined ? {} : { sessionToken };
}

async function json(context: Context<AppEnvironment>) {
  try {
    return await context.req.json();
  } catch {
    return undefined;
  }
}

function error(context: Context<AppEnvironment>, value: unknown) {
  const requestId = context.get('requestId');
  if (value instanceof IntegrationAuthenticationError) {
    return context.json(
      createErrorResponse(ERROR_CODES.UNAUTHORIZED, 'A parent session is required.', requestId),
      401,
    );
  }
  if (value instanceof IntegrationCreatorRequiredError) {
    return context.json(
      createErrorResponse(
        ERROR_CODES.FORBIDDEN,
        'Only the family creator can manage integrations.',
        requestId,
      ),
      403,
    );
  }
  if (value instanceof IntegrationNotFoundError) {
    return context.json(
      createErrorResponse(ERROR_CODES.NOT_FOUND, 'The integration was not found.', requestId),
      404,
    );
  }
  if (value instanceof InvalidIntegrationSettingError) {
    return context.json(
      createErrorResponse(ERROR_CODES.INVALID_REQUEST, value.message, requestId),
      400,
    );
  }
  if (value instanceof IntegrationVerificationUnavailableError) {
    return context.json(
      createErrorResponse(
        ERROR_CODES.INTERNAL_ERROR,
        'Integration verification is unavailable.',
        requestId,
      ),
      503,
    );
  }
  throw value;
}

export function registerIntegrationSettingsRoutes(
  api: Hono<AppEnvironment>,
  operations: IntegrationSettingsOperations,
): void {
  api.get('/family/integrations/:type', async (context) => {
    const integrationType = type(context);
    if (!integrationType)
      return context.json(
        createErrorResponse(
          ERROR_CODES.NOT_FOUND,
          'The integration was not found.',
          context.get('requestId'),
        ),
        404,
      );
    try {
      const result = await operations.get({ ...session(context), integrationType });
      return context.json(createSuccessResponse(result, context.get('requestId')));
    } catch (value) {
      return error(context, value);
    }
  });

  api.put('/family/integrations/:type', async (context) => {
    const integrationType = type(context);
    const parsed =
      integrationType === 'email'
        ? emailSchema.safeParse(await json(context))
        : integrationType === 'cos'
          ? cosSchema.safeParse(await json(context))
          : null;
    if (!parsed?.success || !integrationType)
      return context.json(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid integration settings.',
          context.get('requestId'),
        ),
        400,
      );
    try {
      const result = await operations.update({
        ...session(context),
        integrationType,
        configuration: parsed.data.configuration,
        ...(parsed.data.credentials === undefined ? {} : { credentials: parsed.data.credentials }),
      });
      return context.json(createSuccessResponse(result, context.get('requestId')));
    } catch (value) {
      return error(context, value);
    }
  });

  api.delete('/family/integrations/:type', async (context) => {
    const integrationType = type(context);
    if (!integrationType)
      return context.json(
        createErrorResponse(
          ERROR_CODES.NOT_FOUND,
          'The integration was not found.',
          context.get('requestId'),
        ),
        404,
      );
    try {
      await operations.remove({ ...session(context), integrationType });
      return context.body(null, 204);
    } catch (value) {
      return error(context, value);
    }
  });

  api.post('/family/integrations/:type/test', async (context) => {
    const integrationType = type(context);
    if (!integrationType)
      return context.json(
        createErrorResponse(
          ERROR_CODES.NOT_FOUND,
          'The integration was not found.',
          context.get('requestId'),
        ),
        404,
      );
    try {
      const result = await operations.test({ ...session(context), integrationType });
      return context.json(createSuccessResponse(result, context.get('requestId')));
    } catch (value) {
      return error(context, value);
    }
  });
}
