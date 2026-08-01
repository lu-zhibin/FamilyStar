import { ERROR_CODES } from '@familystar/shared';
import type { HealthInfo, ServiceInfo } from '@familystar/shared';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { registerFamilyAuthRoutes } from './family-auth/routes.js';
import { registerChildAccountRoutes } from './family-auth/child-routes.js';
import type { ChildAccountOperations } from './family-auth/child-service.js';
import type { InvitationOperations } from './family-auth/invitation-service.js';
import type { FamilyAuthService } from './family-auth/service.js';
import { registerFamilySettingsRoutes } from './family-settings/routes.js';
import type { FamilySettingsOperations } from './family-settings/types.js';
import { registerTaskRoutes, registerTaskTypeRoutes } from './tasks/routes.js';
import type { TaskOperations, TaskTypeOperations } from './tasks/types.js';
import { registerMediaRoutes } from './media/routes.js';
import type { MediaOperations } from './media/types.js';
import { registerCheckInRoutes } from './check-ins/routes.js';
import type { CheckInOperations } from './check-ins/types.js';
import { registerSubmissionReviewRoutes } from './check-ins/review-routes.js';
import type { SubmissionReviewOperations } from './check-ins/review-types.js';
import { registerLevelRoutes } from './levels/routes.js';
import type { LevelOperations } from './levels/types.js';
import { registerRewardRoutes } from './rewards/routes.js';
import type { RewardOperations } from './rewards/types.js';
import { requestContext } from './http/request-context.js';
import { requestLogger } from './http/request-logger.js';
import { createErrorResponse, createSuccessResponse } from './http/responses.js';
import type { AppEnvironment } from './http/types.js';
import type { SessionStore } from './family-auth/types.js';
import type { AuditWriter } from './security/audit.js';
import { createSecurityMiddleware } from './security/middleware.js';
import { registerIntegrationSettingsRoutes } from './infrastructure/credentials/integration-routes.js';
import type { IntegrationSettingsOperations } from './infrastructure/credentials/integration-service.js';

const service: ServiceInfo = {
  name: 'FamilyStar API',
  version: '0.1.0',
};

export type CreateAppOptions = {
  publicBaseUrl: string;
  familyAuthService?: FamilyAuthService;
  invitationService?: InvitationOperations;
  childAccountService?: ChildAccountOperations;
  familySettingsService?: FamilySettingsOperations;
  taskTypeOperations?: TaskTypeOperations;
  taskOperations?: TaskOperations;
  mediaOperations?: MediaOperations;
  checkInOperations?: CheckInOperations;
  submissionReviewOperations?: SubmissionReviewOperations;
  levelOperations?: LevelOperations;
  rewardOperations?: RewardOperations;
  sessionStore?: SessionStore;
  auditWriter?: AuditWriter;
  integrationSettingsOperations?: IntegrationSettingsOperations;
  secureCookies?: boolean;
};

export function createApp({
  publicBaseUrl,
  familyAuthService,
  invitationService,
  childAccountService,
  familySettingsService,
  taskTypeOperations,
  taskOperations,
  mediaOperations,
  checkInOperations,
  submissionReviewOperations,
  levelOperations,
  rewardOperations,
  sessionStore,
  auditWriter,
  integrationSettingsOperations,
  secureCookies = false,
}: CreateAppOptions) {
  const app = new Hono<AppEnvironment>();

  app.use('*', requestContext);
  app.use('*', requestLogger);
  app.use(
    '/api/*',
    cors({
      origin: publicBaseUrl,
      credentials: true,
    }),
  );
  if (sessionStore) {
    app.use(
      '/api/*',
      createSecurityMiddleware({
        publicBaseUrl,
        sessions: sessionStore,
        ...(auditWriter === undefined ? {} : { auditWriter }),
      }),
    );
  }

  const apiV1 = app.basePath('/api/v1');

  apiV1.get('/', (context) =>
    context.json(createSuccessResponse(service, context.get('requestId'))),
  );

  apiV1.get('/health', (context) => {
    const checkedAt = new Date().toISOString();
    const health: HealthInfo = {
      ...service,
      status: 'ok',
      checked_at: checkedAt,
      uptime_seconds: Math.floor(process.uptime()),
    };

    return context.json(createSuccessResponse(health, context.get('requestId'), checkedAt));
  });

  if (familyAuthService) {
    registerFamilyAuthRoutes(apiV1, familyAuthService, secureCookies, invitationService);
  }
  if (childAccountService) {
    registerChildAccountRoutes(apiV1, childAccountService, secureCookies);
  }
  if (familySettingsService) {
    registerFamilySettingsRoutes(apiV1, familySettingsService, secureCookies);
  }
  if (taskTypeOperations) {
    registerTaskTypeRoutes(apiV1, taskTypeOperations, secureCookies);
  }
  if (taskOperations) {
    registerTaskRoutes(apiV1, taskOperations, secureCookies);
  }
  if (mediaOperations) {
    registerMediaRoutes(apiV1, mediaOperations, secureCookies);
  }
  if (checkInOperations) {
    registerCheckInRoutes(apiV1, checkInOperations, secureCookies);
  }
  if (submissionReviewOperations) {
    registerSubmissionReviewRoutes(apiV1, submissionReviewOperations, secureCookies);
  }
  if (levelOperations) {
    registerLevelRoutes(apiV1, levelOperations, secureCookies);
  }
  if (rewardOperations) {
    registerRewardRoutes(apiV1, rewardOperations, secureCookies);
  }
  if (integrationSettingsOperations) {
    registerIntegrationSettingsRoutes(apiV1, integrationSettingsOperations);
  }

  app.notFound((context) =>
    context.json(
      createErrorResponse(
        ERROR_CODES.NOT_FOUND,
        'The requested resource was not found.',
        context.get('requestId'),
      ),
      404,
    ),
  );

  app.onError((error, context) => {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        event: 'unhandled_error',
        request_id: context.get('requestId'),
        method: context.req.method,
        path: context.req.path,
        error_name: error.name,
      }),
    );

    return context.json(
      createErrorResponse(
        ERROR_CODES.INTERNAL_ERROR,
        'An unexpected error occurred.',
        context.get('requestId'),
      ),
      500,
    );
  });

  return app;
}
