import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const root = new URL('../../../../', import.meta.url);

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
    expect(compose).toContain('API_INTERNAL_URL: http://api:3001');
    expect(compose).toContain('${IMAGE_TAG:-dev-local}-api');
    expect(compose).toContain('${IMAGE_TAG:-dev-local}-worker');
    expect(compose).toContain('${IMAGE_TAG:-dev-local}-web');
  });

  it('requires immutable production image coordinates and reserves port 8099', async () => {
    const compose = await source('compose.prod.yml');

    expect(compose).toContain('${FAMILYSTAR_IMAGE_REPOSITORY:?Set FAMILYSTAR_IMAGE_REPOSITORY}');
    expect(compose).toContain('${IMAGE_TAG:?Set IMAGE_TAG}');
    expect(compose).toContain('0.0.0.0:8099:3000');
    expect(compose.match(/ports:/g)).toHaveLength(1);
    expect(compose).not.toContain('build:');
    expect(compose).toContain('${IMAGE_TAG:?Set IMAGE_TAG}-api');
    expect(compose).toContain('${IMAGE_TAG:?Set IMAGE_TAG}-worker');
    expect(compose).toContain('${IMAGE_TAG:?Set IMAGE_TAG}-web');
  });
});
