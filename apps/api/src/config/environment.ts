import { z } from 'zod';

export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  WORKER_PORT: z.coerce.number().int().min(1).max(65_535).default(3002),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).max(60_000).default(5_000),
  WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(1_000).default(100),
  WORKER_LOCK_TTL_MS: z.coerce.number().int().min(10_000).max(900_000).default(300_000),
  MEDIA_CLEANUP_AGE_HOURS: z.coerce.number().int().min(1).max(720).default(24),
  PUBLIC_BASE_URL: z.url().default('http://localhost:3000'),
  DATABASE_URL: z
    .url({ protocol: /^postgres(?:ql)?$/ })
    .default('postgresql://familystar:familystar@localhost:5432/familystar?schema=public'),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }).default('redis://localhost:6379'),
  REDIS_KEY_PREFIX: z
    .string()
    .regex(/^[a-z0-9][a-z0-9_-]{0,62}$/)
    .default('familystar'),
  CREDENTIAL_VAULT_ACTIVE_KEY_VERSION: z.string().optional(),
  CREDENTIAL_VAULT_MASTER_KEYS: z.string().optional(),
});

export type AppEnvironment = z.infer<typeof environmentSchema>;

export function parseEnvironment(environment: NodeJS.ProcessEnv): AppEnvironment {
  const result = environmentSchema.safeParse(environment);

  if (result.success) {
    return result.data;
  }

  const invalidFields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))]
    .filter(Boolean)
    .join(', ');

  throw new Error(`Invalid environment variables: ${invalidFields}`);
}
