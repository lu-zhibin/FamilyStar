import { createServer } from 'node:http';
import { hostname } from 'node:os';

import { PrismaClient } from '@prisma/client';

import { parseEnvironment } from './config/environment.js';
import { createRedisConnection, disconnectRedis } from './infrastructure/redis/client.js';
import { createWorkerRuntime } from './worker/runtime.js';

const environment = parseEnvironment(process.env);
const prisma = new PrismaClient();
const redis = createRedisConnection({ url: environment.REDIS_URL });
const scheduler = createWorkerRuntime({
  environment,
  prisma,
  redis,
  workerId: `${hostname()}:${process.pid}`,
});

const healthServer = createServer((request, response) => {
  if (request.url !== '/health') {
    response.writeHead(404).end();
    return;
  }
  const health = scheduler.health();
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(
    JSON.stringify({
      status: health.lastErrorCode ? 'degraded' : 'ok',
      started_at: health.startedAt.toISOString(),
      last_tick_at: health.lastTickAt?.toISOString() ?? null,
      last_successful_tick_at: health.lastSuccessfulTickAt?.toISOString() ?? null,
      last_error_code: health.lastErrorCode,
    }),
  );
});

healthServer.listen(environment.WORKER_PORT, '0.0.0.0');
await scheduler.start();

async function shutdown(): Promise<void> {
  scheduler.stop();
  await new Promise<void>((resolve, reject) => {
    healthServer.close((error) => (error ? reject(error) : resolve()));
  });
  disconnectRedis(redis);
  await prisma.$disconnect();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown().finally(() => process.exit(0));
  });
}
