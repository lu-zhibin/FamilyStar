import { EventBus } from '../events/event-bus.js';
import { IdempotentEventConsumer } from '../events/idempotent-consumer.js';
import { OutboxDispatcher } from '../events/outbox.js';
import { PrismaOutboxRepository } from '../events/prisma-outbox.js';
import { RedisEventReceiptStore } from '../events/redis-event-receipts.js';
import { CHECK_IN_APPROVED_EVENT } from '../check-ins/events.js';
import { GrowthRecordEventConsumer } from '../growth-records/event-consumer.js';
import { SubmissionReviewTimeoutService } from '../check-ins/review-timeout-service.js';
import { PrismaSubmissionReviewRepository } from '../check-ins/review-prisma-repository.js';
import { initializeCredentialVault } from '../infrastructure/credentials/runtime.js';
import { PrismaCredentialVaultRepository } from '../infrastructure/credentials/prisma-repository.js';
import { createRedisKeyspace } from '../infrastructure/redis/keys.js';
import type { RedisCommandPort } from '../infrastructure/redis/primitives.js';
import { TencentCosClient } from '../media/cos-client.js';
import { PrismaCosConnectionProvider } from '../media/prisma-repository.js';
import { PrismaPointsTransactionWriter } from '../points/prisma-writer.js';
import { CollaborationScheduler } from '../tasks/collaboration-scheduler.js';
import { PrismaCollaborationSchedulerRepository } from '../tasks/prisma-collaboration-scheduler.js';
import type { AppEnvironment } from '../config/environment.js';
import type { PrismaClient } from '@prisma/client';
import type { RedisClient } from '../infrastructure/redis/client.js';
import { createWorkerJobs, PrismaWorkerJobsRepository } from './jobs.js';
import { WorkerJobRunner } from './job-runner.js';
import { PrismaWorkerJobRunRepository } from './prisma-job-run-repository.js';
import { WorkerScheduler } from './scheduler.js';
import { BadgeEventConsumer, BADGE_EVENT_NAMES } from '../badges/event-consumer.js';
import { PrismaBadgeRepository } from '../badges/prisma-repository.js';

export function createWorkerRuntime(input: {
  environment: AppEnvironment;
  prisma: PrismaClient;
  redis: RedisClient;
  workerId: string;
}): WorkerScheduler {
  const { environment, prisma, redis } = input;
  const keys = createRedisKeyspace(environment.REDIS_KEY_PREFIX);
  const redisCommands: RedisCommandPort = {
    async sendCommand(arguments_) {
      if (!redis.isOpen) await redis.connect();
      return redis.sendCommand(arguments_);
    },
  };
  const points = new PrismaPointsTransactionWriter(prisma);
  const credentialVault = initializeCredentialVault(environment);
  const cos = new TencentCosClient();
  const eventBus = new EventBus();
  const badgeEventConsumer = new BadgeEventConsumer(new PrismaBadgeRepository(prisma));
  const growthRecordProjector = new GrowthRecordEventConsumer(prisma);
  const growthRecordConsumer = new IdempotentEventConsumer(
    new RedisEventReceiptStore(redisCommands, keys),
    async (event) => {
      await growthRecordProjector.handle(event);
    },
    { consumer: 'growth-record-projector-v1', receiptTtlSeconds: 86_400 },
  );
  const badgeScope = eventBus.createScope({
    name: 'badge-evaluator',
    version: '1.0.0',
    capabilities: ['badge-evaluation'],
    dependencies: [],
    permissions: [],
    publishes: [],
    subscribes: BADGE_EVENT_NAMES,
  });
  for (const eventName of BADGE_EVENT_NAMES) {
    badgeScope.subscribe(eventName, async (event) => {
      await badgeEventConsumer.handle(event);
    });
  }
  eventBus
    .createScope({
      name: 'growth-record-projector',
      version: '1.0.0',
      capabilities: ['growth-record-projection'],
      dependencies: [],
      permissions: [],
      publishes: [],
      subscribes: [CHECK_IN_APPROVED_EVENT],
    })
    .subscribe(CHECK_IN_APPROVED_EVENT, async (event) => {
      await growthRecordConsumer.consume(event);
    });
  const jobs = createWorkerJobs({
    repository: new PrismaWorkerJobsRepository(prisma),
    collaborationScheduler: new CollaborationScheduler(
      new PrismaCollaborationSchedulerRepository(prisma),
    ),
    reviewTimeout: new SubmissionReviewTimeoutService({
      repository: new PrismaSubmissionReviewRepository(prisma, points),
      redis: redisCommands,
      keys,
      batchSize: environment.WORKER_BATCH_SIZE,
    }),
    outbox: new OutboxDispatcher(
      new PrismaOutboxRepository(prisma),
      eventBus.createOutboxPublisher(),
      {
        workerId: input.workerId,
        batchSize: environment.WORKER_BATCH_SIZE,
        leaseMilliseconds: environment.WORKER_LOCK_TTL_MS,
        retryBaseMilliseconds: 5_000,
        retryMaxMilliseconds: 300_000,
      },
    ),
    cos,
    connections: new PrismaCosConnectionProvider(
      new PrismaCredentialVaultRepository(prisma),
      credentialVault,
    ),
    batchSize: environment.WORKER_BATCH_SIZE,
    mediaCleanupAgeHours: environment.MEDIA_CLEANUP_AGE_HOURS,
  });
  return new WorkerScheduler(
    new WorkerJobRunner({
      repository: new PrismaWorkerJobRunRepository(prisma),
      redis: redisCommands,
      lockKey: keys.schedulerLock,
      lockTtlMilliseconds: environment.WORKER_LOCK_TTL_MS,
    }),
    jobs,
    environment.WORKER_POLL_INTERVAL_MS,
  );
}
