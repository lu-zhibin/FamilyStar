import { createMiddleware } from 'hono/factory';

import type { AppEnvironment } from './types.js';

export const requestLogger = createMiddleware<AppEnvironment>(async (context, next) => {
  const startedAt = performance.now();

  await next();

  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      event: 'http_request',
      request_id: context.get('requestId'),
      method: context.req.method,
      path: context.req.path,
      status: context.res.status,
      duration_ms: Math.max(0, Math.round((performance.now() - startedAt) * 100) / 100),
    }),
  );
});
