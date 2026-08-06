import { ERROR_CODES } from '@familystar/shared';
import type { Context, Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';

import { SESSION_TTL_SECONDS } from '../family-auth/constants.js';
import { createErrorResponse, createSuccessResponse } from '../http/responses.js';
import type { AppEnvironment } from '../http/types.js';
import { InvalidBadgeInputError } from './logic.js';
import { BadgeAccessError, BadgeConflictError } from './service.js';
import type {
  BadgeAwardRecord,
  BadgeCondition,
  BadgeOperations,
  BadgeTemplateInput,
  BadgeTemplatePatch,
  BadgeTemplateRecord,
  BadgeWallItem,
} from './types.js';

const conditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('MANUAL') }).strict(),
  z
    .object({
      type: z.enum([
        'TASK_COMPLETION_COUNT',
        'STREAK_DAYS',
        'TOTAL_POINTS',
        'LEVEL_REACHED',
        'COLLABORATION_COUNT',
      ]),
      target: z.number().int().positive().max(2_147_483_647),
    })
    .strict(),
]);
const templateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(10_000).nullable().optional(),
    icon: z.string().trim().min(1).max(80),
    category: z.string().trim().min(1).max(80),
    condition: conditionSchema,
    award_level: z.number().int().positive().max(2_147_483_647).optional(),
    is_visible: z.boolean().optional(),
    is_enabled: z.boolean().optional(),
  })
  .strict();
const templatePatchSchema = templateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0);
const manualAwardSchema = z
  .object({
    child_id: z.string().uuid(),
    template_id: z.string().uuid(),
    reason: z.string().trim().min(1).max(2_000),
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

async function json(context: Context<AppEnvironment>): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return undefined;
  }
}

function input(value: z.infer<typeof templateSchema>): BadgeTemplateInput {
  return {
    name: value.name,
    icon: value.icon,
    category: value.category,
    condition: value.condition as BadgeCondition,
    ...(value.description === undefined ? {} : { description: value.description }),
    ...(value.award_level === undefined ? {} : { awardLevel: value.award_level }),
    ...(value.is_visible === undefined ? {} : { isVisible: value.is_visible }),
    ...(value.is_enabled === undefined ? {} : { isEnabled: value.is_enabled }),
  };
}

function patch(value: z.infer<typeof templatePatchSchema>): BadgeTemplatePatch {
  return {
    ...(value.name === undefined ? {} : { name: value.name }),
    ...(value.description === undefined ? {} : { description: value.description }),
    ...(value.icon === undefined ? {} : { icon: value.icon }),
    ...(value.category === undefined ? {} : { category: value.category }),
    ...(value.condition === undefined ? {} : { condition: value.condition as BadgeCondition }),
    ...(value.award_level === undefined ? {} : { awardLevel: value.award_level }),
    ...(value.is_visible === undefined ? {} : { isVisible: value.is_visible }),
    ...(value.is_enabled === undefined ? {} : { isEnabled: value.is_enabled }),
  };
}

function templateOutput(value: BadgeTemplateRecord) {
  return {
    id: value.id,
    preset_code: value.presetCode,
    name: value.name,
    description: value.description,
    icon: value.icon,
    category: value.category,
    condition: value.condition,
    award_level: value.awardLevel,
    is_visible: value.isVisible,
    is_enabled: value.isEnabled,
    version: value.version,
    created_at: value.createdAt.toISOString(),
    updated_at: value.updatedAt.toISOString(),
  };
}

function awardOutput(value: BadgeAwardRecord) {
  return {
    id: value.id,
    template_id: value.templateId,
    child_id: value.childId,
    level: value.level,
    name: value.templateNameSnapshot,
    description: value.templateDescriptionSnapshot,
    icon: value.templateIconSnapshot,
    category: value.templateCategorySnapshot,
    condition: value.templateConditionSnapshot,
    template_version: value.templateVersion,
    reason: value.reason,
    awarded_by: value.awardedById,
    awarded_at: value.awardedAt.toISOString(),
  };
}

function wallOutput(value: BadgeWallItem) {
  return {
    template: templateOutput(value.template),
    award: value.award ? awardOutput(value.award) : null,
    progress: value.progress
      ? {
          current_value: value.progress.currentValue,
          target_value: value.progress.targetValue,
          evaluated_at: value.progress.evaluatedAt.toISOString(),
        }
      : null,
  };
}

function mapError(context: Context<AppEnvironment>, error: unknown) {
  if (error instanceof z.ZodError || error instanceof InvalidBadgeInputError) {
    return context.json(
      createErrorResponse(
        ERROR_CODES.INVALID_REQUEST,
        'The badge input is invalid.',
        context.get('requestId'),
      ),
      400,
    );
  }
  if (error instanceof BadgeConflictError) {
    return context.json(
      createErrorResponse(ERROR_CODES.CONFLICT, error.message, context.get('requestId')),
      409,
    );
  }
  if (!(error instanceof BadgeAccessError)) throw error;
  const status = { UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404 }[error.code] as
    401 | 403 | 404;
  const code = {
    UNAUTHORIZED: ERROR_CODES.UNAUTHORIZED,
    FORBIDDEN: ERROR_CODES.FORBIDDEN,
    NOT_FOUND: ERROR_CODES.NOT_FOUND,
  }[error.code];
  return context.json(createErrorResponse(code, error.message, context.get('requestId')), status);
}

export function registerBadgeRoutes(
  api: Hono<AppEnvironment>,
  operations: BadgeOperations,
  secureCookies: boolean,
): void {
  api.get('/family/badge-templates', async (context) => {
    try {
      const result = await operations.listTemplates(sessionInput(context));
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { templates: result.templates.map(templateOutput) },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.post('/family/badge-templates', async (context) => {
    try {
      const body = templateSchema.parse(await json(context));
      const result = await operations.createTemplate({
        ...sessionInput(context),
        template: input(body),
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { template: templateOutput(result.template) },
          context.get('requestId'),
        ),
        201,
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.patch('/family/badge-templates/:templateId', async (context) => {
    try {
      const body = templatePatchSchema.parse(await json(context));
      const result = await operations.updateTemplate({
        ...sessionInput(context),
        templateId: context.req.param('templateId'),
        template: patch(body),
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { template: templateOutput(result.template) },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.delete('/family/badge-templates/:templateId', async (context) => {
    try {
      await operations.removeTemplate({
        ...sessionInput(context),
        templateId: context.req.param('templateId'),
      });
      renew(context, secureCookies);
      return context.body(null, 204);
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.post('/family/badge-awards', async (context) => {
    try {
      const body = manualAwardSchema.parse(await json(context));
      const result = await operations.awardManually({
        ...sessionInput(context),
        childId: body.child_id,
        templateId: body.template_id,
        reason: body.reason,
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse({ award: awardOutput(result.award) }, context.get('requestId')),
        201,
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.get('/badges/me', async (context) => {
    try {
      const result = await operations.getMyWall(sessionInput(context));
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse({ badges: result.badges.map(wallOutput) }, context.get('requestId')),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });
}
