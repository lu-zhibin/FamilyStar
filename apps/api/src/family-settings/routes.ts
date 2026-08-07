import { ERROR_CODES, OPTIONAL_FAMILY_MODULE_IDS } from '@familystar/shared';
import type { FamilyModulesReadModel } from '@familystar/shared';
import type { Context, Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';

import { SESSION_TTL_SECONDS } from '../family-auth/constants.js';
import { createErrorResponse, createSuccessResponse } from '../http/responses.js';
import type { AppEnvironment } from '../http/types.js';
import {
  FamilyCreatorRequiredError,
  FamilyModuleConflictError,
  FamilySettingsConflictError,
  FamilySettingsNotFoundError,
  FamilySettingsSessionRequiredError,
  InvalidFamilyProfileError,
  InvalidFamilySettingsError,
} from './service.js';
import type {
  FamilyInvitationSummary,
  FamilyParent,
  FamilyProfile,
  FamilySettings,
  FamilySettingsOperations,
} from './types.js';

const nonNegativeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const streakTierSchema = z
  .object({
    days: z.number().int().positive(),
    multiplier: z.number().positive(),
  })
  .strict();
const settingsPatchSchema = z
  .object({
    time_zone: z.string().min(1).optional(),
    check_in_deadline: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    makeup_days: nonNegativeInteger.optional(),
    review_timeout_hours: nonNegativeInteger.optional(),
    auto_approve_quota: nonNegativeInteger.optional(),
    streak_multipliers: z.array(streakTierSchema).length(6).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const profilePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    time_zone: z.string().min(1).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const modulePatchSchema = z
  .object({
    version: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    modules: z
      .partialRecord(z.enum(OPTIONAL_FAMILY_MODULE_IDS), z.boolean())
      .refine((value) => Object.keys(value).length > 0),
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

function renewSession(context: Context<AppEnvironment>, secure: boolean): void {
  const token = sessionToken(context);
  if (!token) return;
  setCookie(context, 'familystar_session', token, {
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
    sameSite: 'Lax',
    secure,
  });
}

function responseSettings(settings: FamilySettings) {
  return {
    time_zone: settings.timeZone,
    check_in_deadline: settings.checkInDeadline,
    makeup_days: settings.makeupDays,
    review_timeout_hours: settings.reviewTimeoutHours,
    auto_approve_quota: settings.autoApproveQuota,
    streak_multipliers: settings.streakMultipliers,
  };
}

function responseParent(parent: FamilyParent) {
  return {
    id: parent.id,
    nickname: parent.nickname,
    email: parent.email,
    is_creator: parent.isCreator,
    joined_at: parent.joinedAt.toISOString(),
  };
}

function responseInvitation(invitation: FamilyInvitationSummary) {
  return {
    id: invitation.id,
    email: invitation.email,
    status: invitation.status,
    expires_at: invitation.expiresAt.toISOString(),
    created_at: invitation.createdAt.toISOString(),
  };
}

function responsePermissions(permissions: FamilyProfile['permissions']) {
  return {
    can_update_name: permissions.canUpdateName,
    can_manage_invitations: permissions.canManageInvitations,
  };
}

function responseProfile(profile: FamilyProfile) {
  return {
    id: profile.id,
    name: profile.name,
    time_zone: profile.timeZone,
    parents: profile.parents.map(responseParent),
    invitations: profile.invitations.map(responseInvitation),
    permissions: responsePermissions(profile.permissions),
  };
}

function responseModules(readModel: FamilyModulesReadModel) {
  return {
    version: readModel.version,
    modules: readModel.modules.map((module) => ({
      id: module.id,
      category: module.category,
      enabled: module.enabled,
      configurable: module.configurable,
      dependencies: module.dependencies,
    })),
  };
}

function mapError(context: Context<AppEnvironment>, error: unknown) {
  if (error instanceof FamilySettingsSessionRequiredError) {
    return context.json(
      createErrorResponse(ERROR_CODES.UNAUTHORIZED, error.message, context.get('requestId')),
      401,
    );
  }
  if (error instanceof FamilySettingsNotFoundError) {
    return context.json(
      createErrorResponse(ERROR_CODES.NOT_FOUND, error.message, context.get('requestId')),
      404,
    );
  }
  if (error instanceof InvalidFamilySettingsError) {
    return context.json(
      createErrorResponse(ERROR_CODES.INVALID_REQUEST, error.message, context.get('requestId')),
      400,
    );
  }
  if (error instanceof InvalidFamilyProfileError) {
    return context.json(
      createErrorResponse(ERROR_CODES.INVALID_REQUEST, error.message, context.get('requestId')),
      400,
    );
  }
  if (error instanceof FamilyCreatorRequiredError) {
    return context.json(
      createErrorResponse(ERROR_CODES.FORBIDDEN, error.message, context.get('requestId')),
      403,
    );
  }
  if (error instanceof FamilySettingsConflictError) {
    return context.json(
      createErrorResponse(ERROR_CODES.CONFLICT, error.message, context.get('requestId')),
      409,
    );
  }
  if (error instanceof FamilyModuleConflictError) {
    return context.json(
      createErrorResponse(
        ERROR_CODES.CONFLICT,
        error.message,
        context.get('requestId'),
        undefined,
        {
          reason: error.reason,
          ...(error.moduleId === undefined ? {} : { module: error.moduleId }),
          dependencies: error.dependencies,
        },
      ),
      409,
    );
  }
  throw error;
}

export function registerFamilySettingsRoutes(
  api: Hono<AppEnvironment>,
  service: FamilySettingsOperations,
  secureCookies: boolean,
): void {
  api.get('/family/profile', async (context) => {
    try {
      const result = await service.getProfile(sessionInput(context));
      renewSession(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { profile: responseProfile(result.profile) },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.patch('/family/profile', async (context) => {
    const parsed = profilePatchSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid family profile request.',
          context.get('requestId'),
        ),
        400,
      );
    }
    try {
      const result = await service.updateProfile({
        ...sessionInput(context),
        profile: {
          ...(parsed.data.name === undefined ? {} : { name: parsed.data.name }),
          ...(parsed.data.time_zone === undefined ? {} : { timeZone: parsed.data.time_zone }),
        },
      });
      renewSession(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { profile: responseProfile(result.profile) },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.get('/family/parents', async (context) => {
    try {
      const result = await service.listParents(sessionInput(context));
      renewSession(context, secureCookies);
      return context.json(
        createSuccessResponse(
          {
            parents: result.parents.map(responseParent),
            invitations: result.invitations.map(responseInvitation),
            permissions: responsePermissions(result.permissions),
          },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.get('/family/settings', async (context) => {
    try {
      const result = await service.get(sessionInput(context));
      renewSession(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { settings: responseSettings(result.settings) },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.get('/family/modules', async (context) => {
    try {
      const result = await service.getModules(sessionInput(context));
      renewSession(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { modules: responseModules(result.modules) },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.patch('/family/modules', async (context) => {
    const parsed = modulePatchSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid family module settings request.',
          context.get('requestId'),
        ),
        400,
      );
    }
    try {
      const result = await service.updateModules({
        ...sessionInput(context),
        expectedVersion: parsed.data.version,
        modules: parsed.data.modules,
      });
      renewSession(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { modules: responseModules(result.modules) },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.patch('/family/settings', async (context) => {
    const parsed = settingsPatchSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid family settings request.',
          context.get('requestId'),
        ),
        400,
      );
    }
    try {
      const result = await service.update({
        ...sessionInput(context),
        settings: {
          ...(parsed.data.time_zone === undefined ? {} : { timeZone: parsed.data.time_zone }),
          ...(parsed.data.check_in_deadline === undefined
            ? {}
            : { checkInDeadline: parsed.data.check_in_deadline }),
          ...(parsed.data.makeup_days === undefined ? {} : { makeupDays: parsed.data.makeup_days }),
          ...(parsed.data.review_timeout_hours === undefined
            ? {}
            : { reviewTimeoutHours: parsed.data.review_timeout_hours }),
          ...(parsed.data.auto_approve_quota === undefined
            ? {}
            : { autoApproveQuota: parsed.data.auto_approve_quota }),
          ...(parsed.data.streak_multipliers === undefined
            ? {}
            : { streakMultipliers: parsed.data.streak_multipliers }),
        },
      });
      renewSession(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { settings: responseSettings(result.settings) },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });
}
