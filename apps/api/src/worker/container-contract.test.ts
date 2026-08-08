import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const root = new URL('../../../../', import.meta.url);
const projectRoot = decodeURIComponent(root.pathname);

async function source(name: string): Promise<string> {
  return readFile(new URL(name, root), 'utf8');
}

describe('Worker container contract', () => {
  it('uses repeatable cached multi-stage builds and non-root runtimes', async () => {
    const dockerfile = await source('Dockerfile');

    expect(dockerfile).toContain('pnpm install --frozen-lockfile');
    expect(dockerfile).toContain('--mount=type=cache,id=familystar-pnpm');
    expect(dockerfile).toContain('ARG API_INTERNAL_URL=http://api:3001');
    expect(dockerfile).toContain('ENV API_INTERNAL_URL=$API_INTERNAL_URL');
    expect(dockerfile).toContain('FROM node:${NODE_VERSION}-alpine AS web');
    expect(dockerfile).toContain('/app/apps/web/public ./apps/web/public');
    expect(dockerfile).toContain('/app/apps/web/.next/standalone');
    expect(dockerfile).toContain('/app/apps/web/.next/static');
    expect(dockerfile).toContain('/app/apps/api/prisma/migrations');
    expect(dockerfile).toContain('FROM backend-runtime AS api');
    expect(dockerfile).toContain('FROM backend-runtime AS worker');
    expect(dockerfile.match(/USER node/g)).toHaveLength(2);
    expect(dockerfile.match(/HEALTHCHECK/g)).toHaveLength(3);
  });

  it('publishes only the development Web entrypoint on port 8098', async () => {
    const compose = await source('compose.dev.yml');

    expect(compose).toContain('postgres:16-alpine');
    expect(compose).toContain('target: worker');
    expect(compose).toContain('condition: service_completed_successfully');
    expect(compose).toContain('0.0.0.0:8098:3000');
    expect(compose.match(/ports:/g)).toHaveLength(1);
    expect(compose.match(/healthcheck:/g)).toHaveLength(2);
    expect(compose).toContain('API_INTERNAL_URL: http://api:3001');
    expect(compose).toContain('${IMAGE_TAG:?Set IMAGE_TAG}-api');
    expect(compose).toContain('${IMAGE_TAG:?Set IMAGE_TAG}-worker');
    expect(compose).toContain('${IMAGE_TAG:?Set IMAGE_TAG}-web');
    expect(compose).not.toContain('cache_from');
    expect(compose).not.toMatch(/registry|pull_policy/i);
    expect(new Set(compose.match(/target: (api|worker|web)/g))).toEqual(
      new Set(['target: api', 'target: worker', 'target: web']),
    );
  });

  it('requires immutable production image coordinates and reserves port 8099', async () => {
    const compose = await source('compose.prod.yml');

    expect(compose).toContain('${FAMILYSTAR_IMAGE_REPOSITORY:?Set FAMILYSTAR_IMAGE_REPOSITORY}');
    expect(compose).toContain('${IMAGE_TAG:?Set immutable IMAGE_TAG}');
    expect(compose).toContain('0.0.0.0:8099:3000');
    expect(compose.match(/ports:/g)).toHaveLength(1);
    expect(compose.match(/healthcheck:/g)).toHaveLength(2);
    expect(compose).not.toContain('build:');
    expect(compose).toContain('${IMAGE_TAG:?Set immutable IMAGE_TAG}-api');
    expect(compose).toContain('${IMAGE_TAG:?Set immutable IMAGE_TAG}-worker');
    expect(compose).toContain('${IMAGE_TAG:?Set immutable IMAGE_TAG}-web');
    expect(compose).toContain("RUN_MIGRATIONS: '0'");
    expect(compose).toContain("''|latest|*[!A-Za-z0-9_.-]*) exit 64");
    expect(compose).toContain('test -f "$${marker}"');
    expect(compose).toContain('condition: service_completed_successfully');
  });

  it('keeps required runtime assets in the image build context', async () => {
    const [dockerfile, dockerignore, serviceWorker] = await Promise.all([
      source('Dockerfile'),
      source('.dockerignore'),
      source('apps/web/public/sw.js'),
    ]);

    expect(dockerfile).toContain('/app/apps/web/public ./apps/web/public');
    expect(dockerfile).toContain('/app/apps/api/prisma/migrations');
    expect(dockerignore).not.toMatch(/^apps\/web\/public$/m);
    expect(dockerignore).not.toMatch(/^apps\/api\/prisma\/migrations$/m);
    expect(dockerignore).toMatch(/^\.git$/m);
    expect(dockerignore).toMatch(/^\.env\.\*$/m);
    expect(dockerignore).toMatch(/^backups$/m);
    expect(dockerignore).toMatch(/^\*\*\/\*\.test\.\*$/m);
    expect(serviceWorker.length).toBeGreaterThan(0);
  });

  it('keeps browser API requests same-origin through the internal API rewrite', async () => {
    const nextConfig = await source('apps/web/next.config.mjs');

    expect(nextConfig).toContain("source: '/api/:path*'");
    expect(nextConfig).toContain(
      'destination: `${parseApiInternalUrl(apiInternalUrl)}/api/:path*`',
    );
    expect(nextConfig).toContain("process.env.API_INTERNAL_URL ?? 'http://localhost:3001'");
  });

  it.runIf(spawnSync('docker', ['compose', 'version']).status === 0)(
    'renders both Compose files with non-sensitive placeholder configuration',
    () => {
      const commonEnvironment = {
        ...process.env,
        POSTGRES_PASSWORD: 'compose-placeholder',
        CREDENTIAL_VAULT_ACTIVE_KEY_VERSION: 'v1',
        CREDENTIAL_VAULT_MASTER_KEYS: '{"v1":"compose-placeholder"}',
        PUBLIC_BASE_URL: 'https://familystar.example.test',
      };
      const configurations = [
        {
          file: 'compose.dev.yml',
          environment: { ...commonEnvironment, IMAGE_TAG: 'contract-local' },
          port: '8098',
        },
        {
          file: 'compose.prod.yml',
          environment: {
            ...commonEnvironment,
            FAMILYSTAR_IMAGE_REPOSITORY: 'registry.example.test/familystar',
            IMAGE_TAG: 'sha-0123456789abcdef',
          },
          port: '8099',
        },
      ];

      for (const configuration of configurations) {
        const result = spawnSync(
          'docker',
          ['compose', '-f', configuration.file, 'config', '--format', 'json'],
          { cwd: projectRoot, encoding: 'utf8', env: configuration.environment },
        );
        expect(result.status, `compose config failed for ${configuration.file}`).toBe(0);
        const compose = JSON.parse(result.stdout);
        expect(Object.keys(compose.services)).toEqual(
          expect.arrayContaining(['postgres', 'redis', 'migrate', 'api', 'worker', 'web']),
        );
        expect(compose.services.web.ports).toHaveLength(1);
        expect(String(compose.services.web.ports[0].published)).toBe(configuration.port);
        for (const service of ['postgres', 'redis', 'api', 'worker']) {
          expect(compose.services[service].ports).toBeUndefined();
        }
      }
    },
  );

  it('keeps the release script migration service compatible with the marker gate', async () => {
    const releaseScript = await source('ops/release-migrate.sh');

    expect(releaseScript).toContain('compose run --rm -e RUN_MIGRATIONS=1 migrate');
    expect(releaseScript).toContain('compose up -d postgres redis api worker web');
  });
});
