import type { FamilyModuleKey } from './module-access.js';

export type RequiredRole = 'parent' | 'child' | 'authenticated';

export type RouteAccessPolicy = Readonly<{
  methods: readonly string[];
  path: RegExp;
  role: RequiredRole;
  module?: FamilyModuleKey;
}>;

type PublicRoute = Readonly<{
  methods: readonly string[];
  path: RegExp;
}>;

const publicRoutes: readonly PublicRoute[] = [
  { methods: ['GET'], path: /^\/api\/v1\/?$/ },
  { methods: ['GET'], path: /^\/api\/v1\/health$/ },
  { methods: ['POST'], path: /^\/api\/v1\/auth\/parent\/(?:register|login)$/ },
  { methods: ['POST'], path: /^\/api\/v1\/auth\/parent\/invitations\/accept$/ },
  { methods: ['POST'], path: /^\/api\/v1\/auth\/child\/(?:family|login)$/ },
];

export const ROUTE_ACCESS_POLICIES: readonly RouteAccessPolicy[] = [
  { methods: ['GET'], path: /^\/api\/v1\/auth\/session$/, role: 'authenticated' },
  { methods: ['POST'], path: /^\/api\/v1\/auth\/logout$/, role: 'authenticated' },
  {
    methods: ['POST'],
    path: /^\/api\/v1\/auth\/parent\/invitations$/,
    role: 'parent',
  },
  { methods: ['GET'], path: /^\/api\/v1\/auth\/switch-targets$/, role: 'authenticated' },
  { methods: ['POST'], path: /^\/api\/v1\/auth\/child\/switch$/, role: 'authenticated' },
  { methods: ['PATCH'], path: /^\/api\/v1\/auth\/child\/password$/, role: 'child' },
  {
    methods: ['GET'],
    path: /^\/api\/v1\/family\/dashboard$/,
    role: 'parent',
  },
  {
    methods: ['GET'],
    path: /^\/api\/v1\/family\/modules$/,
    role: 'authenticated',
  },
  {
    methods: ['PATCH'],
    path: /^\/api\/v1\/family\/modules$/,
    role: 'parent',
  },
  {
    methods: ['GET'],
    path: /^\/api\/v1\/family\/analytics$/,
    role: 'parent',
    module: 'analytics',
  },
  {
    methods: ['GET'],
    path: /^\/api\/v1\/rankings$/,
    role: 'authenticated',
    module: 'analytics',
  },
  {
    methods: ['GET'],
    path: /^\/api\/v1\/family\/check-ins\/history$/,
    role: 'parent',
    module: 'growth-records',
  },
  {
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    path: /^\/api\/v1\/family\/growth-records(?:\/[^/]+)?$/,
    role: 'parent',
    module: 'growth-records',
  },
  {
    methods: ['GET'],
    path: /^\/api\/v1\/check-ins\/me\/history$/,
    role: 'child',
    module: 'growth-records',
  },
  {
    methods: ['GET'],
    path: /^\/api\/v1\/growth-records\/me$/,
    role: 'child',
    module: 'growth-records',
  },
  {
    methods: ['GET'],
    path: /^\/api\/v1\/family\/children\/[^/]+\/level$/,
    role: 'parent',
    module: 'levels',
  },
  {
    methods: ['GET'],
    path: /^\/api\/v1\/levels\/me$/,
    role: 'child',
    module: 'levels',
  },
  {
    methods: ['GET', 'POST'],
    path: /^\/api\/v1\/family\/badge-templates$/,
    role: 'parent',
    module: 'badges',
  },
  {
    methods: ['PATCH', 'DELETE'],
    path: /^\/api\/v1\/family\/badge-templates\/[^/]+$/,
    role: 'parent',
    module: 'badges',
  },
  {
    methods: ['POST'],
    path: /^\/api\/v1\/family\/badge-awards$/,
    role: 'parent',
    module: 'badges',
  },
  {
    methods: ['GET'],
    path: /^\/api\/v1\/badges\/me$/,
    role: 'child',
    module: 'badges',
  },
  {
    methods: ['GET'],
    path: /^\/api\/v1\/notifications$/,
    role: 'authenticated',
    module: 'notifications',
  },
  {
    methods: ['GET'],
    path: /^\/api\/v1\/notifications\/unread-count$/,
    role: 'authenticated',
    module: 'notifications',
  },
  {
    methods: ['PATCH'],
    path: /^\/api\/v1\/notifications\/[^/]+\/read$/,
    role: 'authenticated',
    module: 'notifications',
  },
  {
    methods: ['PATCH'],
    path: /^\/api\/v1\/notifications\/read-all$/,
    role: 'authenticated',
    module: 'notifications',
  },
  {
    methods: ['GET', 'PATCH'],
    path: /^\/api\/v1\/notification-preferences$/,
    role: 'authenticated',
    module: 'notifications',
  },
  {
    methods: ['GET'],
    path: /^\/api\/v1\/points\/me(?:\/logs)?$/,
    role: 'child',
  },
  {
    methods: ['GET'],
    path: /^\/api\/v1\/family\/children\/[^/]+\/points$/,
    role: 'parent',
  },
  {
    methods: ['GET'],
    path: /^\/api\/v1\/tasks\/me$/,
    role: 'child',
  },
  {
    methods: ['GET', 'POST'],
    path: /^\/api\/v1\/(?:check-ins(?:\/[^/]+)?|collaboration-rounds\/[^/]+\/submissions)$/,
    role: 'child',
  },
  {
    methods: ['GET', 'POST'],
    path: /^\/api\/v1\/(?:check-ins|collaboration-submissions)\/[^/]+\/reviews$/,
    role: 'parent',
  },
  {
    methods: ['GET'],
    path: /^\/api\/v1\/family\/submission-reviews\/(?:pending|history)$/,
    role: 'parent',
  },
  {
    methods: ['POST'],
    path: /^\/api\/v1\/redemptions\/[^/]+\/(?:approve|fulfill|reject)$/,
    role: 'parent',
    module: 'rewards',
  },
  {
    methods: ['POST'],
    path: /^\/api\/v1\/wishes\/[^/]+\/adopt$/,
    role: 'parent',
    module: 'rewards',
  },
  {
    methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
    path: /^\/api\/v1\/rewards(?:\/[^/]+)?$/,
    role: 'parent',
    module: 'rewards',
  },
  {
    methods: ['POST'],
    path: /^\/api\/v1\/rewards\/[^/]+\/redemptions$/,
    role: 'child',
    module: 'rewards',
  },
  {
    methods: ['POST'],
    path: /^\/api\/v1\/(?:wishes|wishes\/[^/]+\/cancel)$/,
    role: 'child',
    module: 'rewards',
  },
  {
    methods: ['GET'],
    path: /^\/api\/v1\/(?:rewards|redemptions|wishes)(?:\/[^/]+)?$/,
    role: 'authenticated',
    module: 'rewards',
  },
  {
    methods: ['POST'],
    path: /^\/api\/v1\/media\/access-urls$/,
    role: 'authenticated',
  },
  {
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    path: /^\/api\/v1\/media(?:\/.*)?$/,
    role: 'authenticated',
  },
  {
    methods: ['GET'],
    path: /^\/api\/v1\/themes$/,
    role: 'child',
  },
  {
    methods: ['PATCH'],
    path: /^\/api\/v1\/themes\/selection$/,
    role: 'child',
  },
  {
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    path: /^\/api\/v1\/family(?:\/(?!badge-(?:templates|awards)(?:\/|$)).*)?$/,
    role: 'parent',
  },
];

const defaultAuthenticatedPolicy: RouteAccessPolicy = {
  methods: [],
  path: /^\/api\/v1(?:\/.*)?$/,
  role: 'authenticated',
};

function matches(method: string, path: string, route: PublicRoute): boolean {
  return route.methods.includes(method) && route.path.test(path);
}

export function resolveRouteAccessPolicy(method: string, path: string): RouteAccessPolicy | null {
  const normalizedMethod = method.toUpperCase();
  if (publicRoutes.some((route) => matches(normalizedMethod, path, route))) return null;
  const policy = ROUTE_ACCESS_POLICIES.find((route) => matches(normalizedMethod, path, route));
  if (policy) return policy;
  return defaultAuthenticatedPolicy.path.test(path) ? defaultAuthenticatedPolicy : null;
}
