import { randomUUID } from 'node:crypto';

import { createMiddleware } from 'hono/factory';

import type { AppEnvironment } from './types.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export const requestContext = createMiddleware<AppEnvironment>(async (context, next) => {
  const suppliedRequestId = context.req.header('X-Request-Id');
  const requestId =
    suppliedRequestId !== undefined && REQUEST_ID_PATTERN.test(suppliedRequestId)
      ? suppliedRequestId
      : randomUUID();

  context.set('requestId', requestId);
  context.header('X-Request-Id', requestId);

  await next();
});
