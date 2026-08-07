import { ERROR_CODES } from '@familystar/shared';
import type { Context, Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';

import { SESSION_TTL_SECONDS } from '../family-auth/constants.js';
import { createErrorResponse, createSuccessResponse } from '../http/responses.js';
import type { AppEnvironment } from '../http/types.js';
import { PointsTransactionConflictError } from '../points/prisma-writer.js';
import { InvalidRewardInputError, wishProgress } from './logic.js';
import { RewardAccessError, RewardConflictError, RewardEligibilityError } from './service.js';
import type {
  RedemptionRecord,
  RewardInput,
  RewardOperations,
  RewardPatch,
  RewardPrerequisites,
  RewardRecord,
  WishRecord,
} from './types.js';

const rewardTypes = z.enum(['PHYSICAL', 'PRIVILEGE', 'EXPERIENCE', 'CUSTOM']);
const rewardStatuses = z.enum(['ACTIVE', 'INACTIVE']);
const prerequisitesSchema = z
  .object({
    min_level: z.number().int().min(1).max(20).optional(),
    redeem_limit: z
      .object({
        per_day: z.number().int().positive().optional(),
        per_week: z.number().int().positive().optional(),
        per_month: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
const rewardSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(10_000).nullable().optional(),
    image_media_id: z.string().min(1).nullable().optional(),
    points_cost: z.number().int().positive(),
    type: rewardTypes,
    stock_total: z.number().int().nonnegative().nullable().optional(),
    prerequisites: prerequisitesSchema.optional(),
    status: rewardStatuses.optional(),
  })
  .strict();
const rewardPatchSchema = rewardSchema.partial().refine((value) => Object.keys(value).length > 0);
const wishSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(10_000).nullable().optional(),
    target_points: z.number().int().positive().max(2_147_483_647),
  })
  .strict();
const adoptionSchema = z
  .object({
    image_media_id: z.string().min(1).nullable().optional(),
    type: rewardTypes,
    stock_total: z.number().int().nonnegative().nullable().optional(),
    prerequisites: prerequisitesSchema.optional(),
    status: rewardStatuses.optional(),
  })
  .strict();
const rejectionSchema = z.object({ reason: z.string().trim().min(1).max(2_000) }).strict();

function token(context: Context<AppEnvironment>): string | undefined {
  return getCookie(context, 'familystar_session');
}

function sessionInput(context: Context<AppEnvironment>): { sessionToken?: string } {
  const sessionToken = token(context);
  return sessionToken ? { sessionToken } : {};
}

function renew(context: Context<AppEnvironment>, secure: boolean): void {
  const value = token(context);
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

function prerequisitesInput(
  value: z.infer<typeof prerequisitesSchema> | undefined,
): RewardPrerequisites {
  return {
    ...(value?.min_level === undefined ? {} : { minLevel: value.min_level }),
    ...(value?.redeem_limit === undefined
      ? {}
      : {
          redeemLimit: {
            ...(value.redeem_limit.per_day === undefined
              ? {}
              : { perDay: value.redeem_limit.per_day }),
            ...(value.redeem_limit.per_week === undefined
              ? {}
              : { perWeek: value.redeem_limit.per_week }),
            ...(value.redeem_limit.per_month === undefined
              ? {}
              : { perMonth: value.redeem_limit.per_month }),
          },
        }),
  };
}

function rewardInput(value: z.infer<typeof rewardSchema>): RewardInput {
  return {
    name: value.name,
    pointsCost: value.points_cost,
    type: value.type,
    ...(value.description === undefined ? {} : { description: value.description }),
    ...(value.image_media_id === undefined ? {} : { imageMediaId: value.image_media_id }),
    ...(value.stock_total === undefined ? {} : { stockTotal: value.stock_total }),
    ...(value.prerequisites === undefined
      ? {}
      : { prerequisites: prerequisitesInput(value.prerequisites) }),
    ...(value.status === undefined ? {} : { status: value.status }),
  };
}

function rewardPatch(value: z.infer<typeof rewardPatchSchema>): RewardPatch {
  return {
    ...(value.name === undefined ? {} : { name: value.name }),
    ...(value.description === undefined ? {} : { description: value.description }),
    ...(value.image_media_id === undefined ? {} : { imageMediaId: value.image_media_id }),
    ...(value.points_cost === undefined ? {} : { pointsCost: value.points_cost }),
    ...(value.type === undefined ? {} : { type: value.type }),
    ...(value.stock_total === undefined ? {} : { stockTotal: value.stock_total }),
    ...(value.prerequisites === undefined
      ? {}
      : { prerequisites: prerequisitesInput(value.prerequisites) }),
    ...(value.status === undefined ? {} : { status: value.status }),
  };
}

function rewardOutput(value: RewardRecord) {
  return {
    id: value.id,
    family_id: value.familyId,
    name: value.name,
    description: value.description,
    image_media_id: value.imageMediaId,
    points_cost: value.pointsCost,
    type: value.type,
    stock_total: value.stockTotal,
    stock_reserved: value.stockReserved,
    stock_consumed: value.stockConsumed,
    stock_available:
      value.stockTotal === null
        ? null
        : value.stockTotal - value.stockReserved - value.stockConsumed,
    prerequisites: {
      ...(value.prerequisites.minLevel === undefined
        ? {}
        : { min_level: value.prerequisites.minLevel }),
      ...(value.prerequisites.redeemLimit === undefined
        ? {}
        : {
            redeem_limit: {
              per_day: value.prerequisites.redeemLimit.perDay,
              per_week: value.prerequisites.redeemLimit.perWeek,
              per_month: value.prerequisites.redeemLimit.perMonth,
            },
          }),
    },
    status: value.status,
    created_at: value.createdAt.toISOString(),
    updated_at: value.updatedAt.toISOString(),
  };
}

function redemptionOutput(value: RedemptionRecord) {
  return {
    id: value.id,
    family_id: value.familyId,
    reward_id: value.rewardId,
    child_id: value.childId,
    listed_points_cost: value.listedPointsCost,
    discount: value.discount,
    points_spent: value.pointsSpent,
    status: value.status,
    is_auto_approved: value.isAutoApproved,
    approved_by: value.approvedById,
    approved_at: value.approvedAt?.toISOString() ?? null,
    rejected_by: value.rejectedById,
    rejected_at: value.rejectedAt?.toISOString() ?? null,
    rejection_reason: value.rejectionReason,
    fulfilled_by: value.fulfilledById,
    fulfilled_at: value.fulfilledAt?.toISOString() ?? null,
    created_at: value.createdAt.toISOString(),
    updated_at: value.updatedAt.toISOString(),
  };
}

function wishOutput(value: WishRecord) {
  return {
    id: value.id,
    family_id: value.familyId,
    child_id: value.childId,
    title: value.title,
    description: value.description,
    target_points: value.targetPoints,
    status: value.status,
    adopted_reward_id: value.adoptedRewardId,
    points_balance: value.pointsBalance,
    cancelled_at: value.cancelledAt?.toISOString() ?? null,
    adopted_at: value.adoptedAt?.toISOString() ?? null,
    progress: wishProgress(value.pointsBalance, value.targetPoints),
    created_at: value.createdAt.toISOString(),
    updated_at: value.updatedAt.toISOString(),
  };
}

function invalid(context: Context<AppEnvironment>) {
  return context.json(
    createErrorResponse(ERROR_CODES.INVALID_REQUEST, 'Invalid request.', context.get('requestId')),
    400,
  );
}

function mapError(context: Context<AppEnvironment>, error: unknown) {
  const requestId = context.get('requestId');
  if (error instanceof RewardAccessError) {
    const status = { UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404 }[error.code] as
      401 | 403 | 404;
    return context.json(
      createErrorResponse(ERROR_CODES[error.code], error.message, requestId),
      status,
    );
  }
  if (error instanceof InvalidRewardInputError) {
    return context.json(
      createErrorResponse(ERROR_CODES.INVALID_REQUEST, error.message, requestId),
      400,
    );
  }
  if (
    error instanceof RewardConflictError ||
    error instanceof RewardEligibilityError ||
    error instanceof PointsTransactionConflictError
  ) {
    return context.json(createErrorResponse(ERROR_CODES.CONFLICT, error.message, requestId), 409);
  }
  throw error;
}

export function registerRewardRoutes(
  api: Hono<AppEnvironment>,
  operations: RewardOperations,
  secureCookies: boolean,
): void {
  api.get('/rewards', async (context) => {
    try {
      const result = await operations.listRewards(sessionInput(context));
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { rewards: result.rewards.map(rewardOutput) },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.post('/rewards', async (context) => {
    const parsed = rewardSchema.safeParse(await json(context));
    if (!parsed.success) return invalid(context);
    try {
      const result = await operations.createReward({
        ...sessionInput(context),
        reward: rewardInput(parsed.data),
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse({ reward: rewardOutput(result.reward) }, context.get('requestId')),
        201,
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.get('/rewards/:id', async (context) => {
    try {
      const result = await operations.getReward({
        ...sessionInput(context),
        rewardId: context.req.param('id'),
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse({ reward: rewardOutput(result.reward) }, context.get('requestId')),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.patch('/rewards/:id', async (context) => {
    const parsed = rewardPatchSchema.safeParse(await json(context));
    if (!parsed.success) return invalid(context);
    try {
      const result = await operations.updateReward({
        ...sessionInput(context),
        rewardId: context.req.param('id'),
        reward: rewardPatch(parsed.data),
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse({ reward: rewardOutput(result.reward) }, context.get('requestId')),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.delete('/rewards/:id', async (context) => {
    try {
      await operations.removeReward({
        ...sessionInput(context),
        rewardId: context.req.param('id'),
      });
      renew(context, secureCookies);
      return context.json(createSuccessResponse({ deleted: true }, context.get('requestId')));
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.post('/rewards/:id/redemptions', async (context) => {
    const idempotencyKey = context.req.header('Idempotency-Key') ?? '';
    try {
      const result = await operations.requestRedemption({
        ...sessionInput(context),
        rewardId: context.req.param('id'),
        idempotencyKey,
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { redemption: redemptionOutput(result.redemption) },
          context.get('requestId'),
        ),
        201,
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.get('/redemptions', async (context) => {
    try {
      const result = await operations.listRedemptions(sessionInput(context));
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { redemptions: result.redemptions.map(redemptionOutput) },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  for (const action of ['approve', 'fulfill'] as const) {
    api.post(`/redemptions/:id/${action}`, async (context) => {
      try {
        const input = {
          ...sessionInput(context),
          redemptionId: context.req.param('id'),
        };
        const result =
          action === 'approve'
            ? await operations.approveRedemption(input)
            : await operations.fulfillRedemption(input);
        renew(context, secureCookies);
        return context.json(
          createSuccessResponse(
            { redemption: redemptionOutput(result.redemption) },
            context.get('requestId'),
          ),
        );
      } catch (error) {
        return mapError(context, error);
      }
    });
  }

  api.post('/redemptions/:id/reject', async (context) => {
    const parsed = rejectionSchema.safeParse(await json(context));
    if (!parsed.success) return invalid(context);
    try {
      const result = await operations.rejectRedemption({
        ...sessionInput(context),
        redemptionId: context.req.param('id'),
        reason: parsed.data.reason,
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { redemption: redemptionOutput(result.redemption) },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.get('/wishes', async (context) => {
    try {
      const result = await operations.listWishes(sessionInput(context));
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse({ wishes: result.wishes.map(wishOutput) }, context.get('requestId')),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.post('/wishes', async (context) => {
    const parsed = wishSchema.safeParse(await json(context));
    if (!parsed.success) return invalid(context);
    try {
      const result = await operations.createWish({
        ...sessionInput(context),
        title: parsed.data.title,
        ...(parsed.data.description === undefined ? {} : { description: parsed.data.description }),
        targetPoints: parsed.data.target_points,
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse({ wish: wishOutput(result.wish) }, context.get('requestId')),
        201,
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.post('/wishes/:id/cancel', async (context) => {
    try {
      const result = await operations.cancelWish({
        ...sessionInput(context),
        wishId: context.req.param('id'),
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse({ wish: wishOutput(result.wish) }, context.get('requestId')),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.post('/wishes/:id/adopt', async (context) => {
    const parsed = adoptionSchema.safeParse(await json(context));
    if (!parsed.success) return invalid(context);
    try {
      const result = await operations.adoptWish({
        ...sessionInput(context),
        wishId: context.req.param('id'),
        reward: {
          type: parsed.data.type,
          ...(parsed.data.image_media_id === undefined
            ? {}
            : { imageMediaId: parsed.data.image_media_id }),
          ...(parsed.data.stock_total === undefined ? {} : { stockTotal: parsed.data.stock_total }),
          ...(parsed.data.prerequisites === undefined
            ? {}
            : { prerequisites: prerequisitesInput(parsed.data.prerequisites) }),
          ...(parsed.data.status === undefined ? {} : { status: parsed.data.status }),
        },
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { wish: wishOutput(result.wish), reward: rewardOutput(result.reward) },
          context.get('requestId'),
        ),
        201,
      );
    } catch (error) {
      return mapError(context, error);
    }
  });
}
