import { serve } from '@hono/node-server';
import { initializeBusinessModules } from '@familystar/business-modules';
import { PrismaClient } from '@prisma/client';

import { createApp } from './app.js';
import { parseEnvironment } from './config/environment.js';
import { PrismaChildAccountRepository } from './family-auth/child-repository.js';
import { ChildAccountService } from './family-auth/child-service.js';
import { bcryptHasher, parentPasswordHasher } from './family-auth/password.js';
import { PrismaFamilyAuthRepository } from './family-auth/prisma-repository.js';
import { FamilyInvitationService } from './family-auth/invitation-service.js';
import { FamilyAuthService } from './family-auth/service.js';
import { RedisSessionStore } from './family-auth/session-store.js';
import { RedisChildLoginRateLimiter } from './family-auth/login-rate-limiter.js';
import { PrismaFamilySettingsRepository } from './family-settings/prisma-repository.js';
import { FamilySettingsService } from './family-settings/service.js';
import { PrismaTaskTypeRepository } from './tasks/prisma-repository.js';
import { PrismaTaskRepository } from './tasks/prisma-task-repository.js';
import { TaskService } from './tasks/task-service.js';
import { TaskTypeService } from './tasks/task-type-service.js';
import { PrismaOutboxWriter, PrismaTransactionRunner } from './events/prisma-outbox.js';
import { initializeCredentialVault } from './infrastructure/credentials/runtime.js';
import { PrismaCredentialVaultRepository } from './infrastructure/credentials/prisma-repository.js';
import { createRedisConnection } from './infrastructure/redis/client.js';
import { createRedisKeyspace } from './infrastructure/redis/keys.js';
import type { RedisCommandPort } from './infrastructure/redis/primitives.js';
import { TencentCosClient } from './media/cos-client.js';
import { PrismaCosConnectionProvider, PrismaMediaRepository } from './media/prisma-repository.js';
import { MediaService } from './media/service.js';
import { PrismaCheckInRepository } from './check-ins/prisma-repository.js';
import { CheckInService } from './check-ins/service.js';
import { PrismaSubmissionReviewRepository } from './check-ins/review-prisma-repository.js';
import { SubmissionReviewService } from './check-ins/review-service.js';
import { SubmissionReviewTimeoutService } from './check-ins/review-timeout-service.js';
import { PrismaPointsTransactionWriter } from './points/prisma-writer.js';
import { PrismaLevelRepository } from './levels/prisma-repository.js';
import { LevelService } from './levels/service.js';
import { PrismaRewardRepository } from './rewards/prisma-repository.js';
import { RewardService } from './rewards/service.js';
import { PrismaAuditWriter } from './security/audit.js';
import { IntegrationSettingsService } from './infrastructure/credentials/integration-service.js';
import { PrismaIntegrationSettingsRepository } from './infrastructure/credentials/integration-prisma-repository.js';
import { PrismaPointsReadRepository } from './points/prisma-repository.js';
import { PointsReadService } from './points/service.js';
import { PrismaHistoryRepository } from './check-ins/history-prisma-repository.js';
import { HistoryService } from './check-ins/history-service.js';
import { PrismaMediaAccessRepository } from './media/access-prisma-repository.js';
import { MediaAccessService } from './media/access-service.js';

const environment = parseEnvironment(process.env);
const credentialVault = initializeCredentialVault(environment);
await initializeBusinessModules();
const prisma = new PrismaClient();
const redis = createRedisConnection({ url: environment.REDIS_URL });
const redisCommands: RedisCommandPort = {
  async sendCommand(arguments_) {
    if (!redis.isOpen) await redis.connect();
    return redis.sendCommand(arguments_);
  },
};
const familyAuthRepository = new PrismaFamilyAuthRepository(prisma);
const redisKeyspace = createRedisKeyspace(environment.REDIS_KEY_PREFIX);
const sessionStore = new RedisSessionStore(redisCommands, redisKeyspace);
const cosClient = new TencentCosClient();
const cosConnectionProvider = new PrismaCosConnectionProvider(
  new PrismaCredentialVaultRepository(prisma),
  credentialVault,
);
const integrationSettingsOperations = new IntegrationSettingsService(
  new PrismaIntegrationSettingsRepository(prisma),
  sessionStore,
  credentialVault,
);
const familyAuthService = new FamilyAuthService(
  familyAuthRepository,
  sessionStore,
  parentPasswordHasher,
);
const invitationService = new FamilyInvitationService(
  familyAuthRepository,
  new PrismaTransactionRunner(prisma),
  new PrismaOutboxWriter(),
  sessionStore,
  parentPasswordHasher,
  environment.PUBLIC_BASE_URL,
);
const childAccountService = new ChildAccountService(
  new PrismaChildAccountRepository(prisma),
  sessionStore,
  bcryptHasher,
  new RedisChildLoginRateLimiter(redisCommands, redisKeyspace),
);
const familySettingsService = new FamilySettingsService({
  repository: new PrismaFamilySettingsRepository(prisma),
  sessions: sessionStore,
});
const taskTypeOperations = new TaskTypeService({
  repository: new PrismaTaskTypeRepository(prisma),
  sessions: sessionStore,
});
const taskOperations = new TaskService({
  repository: new PrismaTaskRepository(prisma),
  sessions: sessionStore,
});
const mediaOperations = new MediaService({
  repository: new PrismaMediaRepository(prisma),
  sessions: sessionStore,
  connections: cosConnectionProvider,
  cos: cosClient,
});
const mediaAccessOperations = new MediaAccessService({
  repository: new PrismaMediaAccessRepository(prisma),
  sessions: sessionStore,
  connections: cosConnectionProvider,
  cos: cosClient,
});
const pointsTransactionWriter = new PrismaPointsTransactionWriter(prisma, new PrismaOutboxWriter());
const pointsReadOperations = new PointsReadService({
  repository: new PrismaPointsReadRepository(prisma),
  sessions: sessionStore,
});
const historyOperations = new HistoryService({
  repository: new PrismaHistoryRepository(prisma),
  sessions: sessionStore,
});
const levelOperations = new LevelService({
  repository: new PrismaLevelRepository(prisma),
  sessions: sessionStore,
});
const rewardOperations = new RewardService({
  repository: new PrismaRewardRepository(prisma, pointsTransactionWriter, new PrismaOutboxWriter()),
  sessions: sessionStore,
});
const checkInOperations = new CheckInService({
  repository: new PrismaCheckInRepository(prisma, pointsTransactionWriter),
  sessions: sessionStore,
});
const submissionReviewRepository = new PrismaSubmissionReviewRepository(
  prisma,
  pointsTransactionWriter,
);
const submissionReviewOperations = new SubmissionReviewService({
  repository: submissionReviewRepository,
  sessions: sessionStore,
  redis: redisCommands,
  keys: redisKeyspace,
});
export const submissionReviewTimeoutBatch = new SubmissionReviewTimeoutService({
  repository: submissionReviewRepository,
  redis: redisCommands,
  keys: redisKeyspace,
});
const app = createApp({
  publicBaseUrl: environment.PUBLIC_BASE_URL,
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
  auditWriter: new PrismaAuditWriter(prisma),
  integrationSettingsOperations,
  pointsReadOperations,
  historyOperations,
  mediaAccessOperations,
  secureCookies: environment.NODE_ENV === 'production',
});

serve({
  fetch: app.fetch,
  port: environment.PORT,
});
