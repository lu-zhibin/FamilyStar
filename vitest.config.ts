import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@familystar/shared': fileURLToPath(
        new URL('./packages/shared/src/index.ts', import.meta.url),
      ),
      '@familystar/business-modules': fileURLToPath(
        new URL('./modules/src/index.ts', import.meta.url),
      ),
      '@familystar/check-in-module': fileURLToPath(
        new URL('./modules/check-in/src/index.ts', import.meta.url),
      ),
      '@familystar/levels-module': fileURLToPath(
        new URL('./modules/levels/src/index.ts', import.meta.url),
      ),
      '@familystar/points-module': fileURLToPath(
        new URL('./modules/points/src/index.ts', import.meta.url),
      ),
      '@familystar/rewards-module': fileURLToPath(
        new URL('./modules/rewards/src/index.ts', import.meta.url),
      ),
      '@familystar/tasks-module': fileURLToPath(
        new URL('./modules/tasks/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: [
      'apps/**/*.test.{ts,tsx}',
      'packages/**/*.test.ts',
      'modules/**/*.test.ts',
      'ops/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: [
        'packages/shared/src/**/*.ts',
        'modules/**/src/**/*.ts',
        'apps/api/src/app.ts',
        'apps/api/src/config/environment.ts',
        'apps/api/src/http/responses.ts',
        'apps/api/src/family-auth/**/*.ts',
        'apps/api/src/family-settings/**/*.ts',
        'apps/api/src/tasks/**/*.ts',
        'apps/api/src/check-ins/content.ts',
        'apps/api/src/check-ins/routes.ts',
        'apps/api/src/check-ins/service.ts',
        'apps/api/src/levels/**/*.ts',
        'apps/api/src/points/**/*.ts',
        'apps/api/src/rewards/**/*.ts',
        'apps/api/src/media/cos-client.ts',
        'apps/api/src/media/routes.ts',
        'apps/api/src/media/service.ts',
        'apps/api/src/media/validation.ts',
        'apps/api/src/infrastructure/redis/**/*.ts',
        'apps/api/src/events/**/*.ts',
        'apps/api/src/infrastructure/events/**/*.ts',
        'apps/api/src/infrastructure/credentials/**/*.ts',
        'apps/api/src/worker/job-runner.ts',
        'apps/api/src/worker/jobs.ts',
        'apps/api/src/worker/prisma-job-run-repository.ts',
        'apps/api/src/worker/scheduler.ts',
      ],
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage/unit',
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 70,
        statements: 70,
      },
    },
  },
});
