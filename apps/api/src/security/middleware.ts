import { ERROR_CODES } from '@familystar/shared';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';

import type { SessionStore } from '../family-auth/types.js';
import { createErrorResponse } from '../http/responses.js';
import type { AppEnvironment } from '../http/types.js';
import type { AuditWriter } from './audit.js';

type RequiredRole = 'parent' | 'child' | 'authenticated';

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredRole(method: string, path: string): RequiredRole | null {
  if (method === 'GET' && path === '/api/v1/auth/session') return 'authenticated';
  if (method === 'POST' && path === '/api/v1/auth/parent/invitations') return 'parent';
  if (path === '/api/v1/auth/switch-targets' || path === '/api/v1/auth/child/switch') {
    return 'authenticated';
  }
  if (path === '/api/v1/auth/child/password') return 'child';
  if (
    /^\/api\/v1\/family\/(?:children|settings|task-types|tasks|integrations)(?:\/.*)?$/.test(path)
  ) {
    return 'parent';
  }
  if (/^\/api\/v1\/family\/children\/[^/]+\/level$/.test(path)) return 'parent';
  if (/^\/api\/v1\/(?:check-ins|collaboration-submissions)\/[^/]+\/reviews$/.test(path)) {
    return 'parent';
  }
  if (/^\/api\/v1\/redemptions\/[^/]+\/(?:approve|fulfill|reject)$/.test(path)) {
    return 'parent';
  }
  if (method === 'POST' && /^\/api\/v1\/wishes\/[^/]+\/adopt$/.test(path)) return 'parent';
  if (unsafeMethods.has(method) && /^\/api\/v1\/rewards(?:\/[^/]+)?$/.test(path)) return 'parent';
  if (path === '/api/v1/levels/me') return 'child';
  if (/^\/api\/v1\/check-ins(?:\/[^/]+)?$/.test(path)) return 'child';
  if (/^\/api\/v1\/collaboration-rounds\/[^/]+\/submissions$/.test(path)) return 'child';
  if (method === 'POST' && /^\/api\/v1\/rewards\/[^/]+\/redemptions$/.test(path)) {
    return 'child';
  }
  if (
    method === 'POST' &&
    (path === '/api/v1/wishes' || /^\/api\/v1\/wishes\/[^/]+\/cancel$/.test(path))
  ) {
    return 'child';
  }
  if (/^\/api\/v1\/media(?:\/.*)?$/.test(path)) return 'authenticated';
  if (method === 'GET' && /^\/api\/v1\/(?:rewards|redemptions|wishes)(?:\/[^/]+)?$/.test(path)) {
    return 'authenticated';
  }
  return null;
}

function forbidden(context: Context<AppEnvironment>, message: string) {
  return context.json(
    createErrorResponse(ERROR_CODES.FORBIDDEN, message, context.get('requestId')),
    403,
  );
}

async function requestFamilyId(context: Context<AppEnvironment>): Promise<string | undefined> {
  const candidates = [
    context.req.header('X-Family-Id'),
    context.req.query('family_id'),
    context.req.query('familyId'),
  ].filter((value): value is string => value !== undefined);
  const contentType = context.req.header('content-type') ?? '';
  if (contentType.toLowerCase().includes('application/json')) {
    try {
      const body = (await context.req.json()) as unknown;
      if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
        const record = body as Record<string, unknown>;
        for (const key of ['family_id', 'familyId']) {
          if (typeof record[key] === 'string') candidates.push(record[key]);
        }
      }
    } catch {
      // Route-level schemas produce the stable invalid JSON response.
    }
  }
  return candidates[0];
}

function auditTarget(path: string): { entityType: string; entityId?: string } {
  const parts = path.split('/').filter(Boolean).slice(2);
  const entityId = parts.find((part) => uuidPattern.test(part));
  return {
    entityType: (parts[0] ?? 'api').slice(0, 80),
    ...(entityId === undefined ? {} : { entityId }),
  };
}

async function writeAudit(
  context: Context<AppEnvironment>,
  writer: AuditWriter | undefined,
  status: number,
): Promise<void> {
  const session = context.get('authSession');
  if (!writer || !session || !unsafeMethods.has(context.req.method)) return;
  const target = auditTarget(context.req.path);
  const idempotencyKey = context.req.header('Idempotency-Key');
  try {
    await writer.write({
      familyId: session.familyId,
      actorId: session.subjectId,
      action: `${context.req.method.toLowerCase()}:${context.req.path}`.slice(0, 120),
      ...target,
      ...(idempotencyKey === undefined ? {} : { businessKey: idempotencyKey.slice(0, 160) }),
      requestId: context.get('requestId'),
      outcome: status < 400 ? 'SUCCESS' : 'FAILURE',
      metadata: { method: context.req.method, path: context.req.path, status },
      occurredAt: new Date(),
    });
  } catch {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        event: 'audit_write_failed',
        request_id: context.get('requestId'),
      }),
    );
  }
}

export function createSecurityMiddleware(options: {
  publicBaseUrl: string;
  sessions: SessionStore;
  auditWriter?: AuditWriter;
}): MiddlewareHandler<AppEnvironment> {
  const allowedOrigin = new URL(options.publicBaseUrl).origin;
  return async (context, next) => {
    const role = requiredRole(context.req.method, context.req.path);
    if (role === null) {
      await next();
      return;
    }

    if (unsafeMethods.has(context.req.method)) {
      const origin = context.req.header('Origin');
      const fetchSite = context.req.header('Sec-Fetch-Site');
      if ((origin !== undefined && origin !== allowedOrigin) || fetchSite === 'cross-site') {
        await writeAudit(context, options.auditWriter, 403);
        return forbidden(context, 'The request origin is not allowed.');
      }
    }

    const token = getCookie(context, 'familystar_session');
    const session = token === undefined ? null : await options.sessions.read(token);
    if (!session) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.UNAUTHORIZED,
          'A valid session is required.',
          context.get('requestId'),
        ),
        401,
      );
    }
    context.set('authSession', session);
    context.set('sessionToken', token);

    if (role !== 'authenticated' && session.role !== role) {
      await writeAudit(context, options.auditWriter, 403);
      return forbidden(context, 'The current role cannot perform this operation.');
    }

    const suppliedFamilyId = await requestFamilyId(context);
    if (suppliedFamilyId !== undefined && suppliedFamilyId !== session.familyId) {
      await writeAudit(context, options.auditWriter, 403);
      return forbidden(context, 'The supplied family does not match the authenticated family.');
    }

    await next();
    await writeAudit(context, options.auditWriter, context.res.status);
  };
}
