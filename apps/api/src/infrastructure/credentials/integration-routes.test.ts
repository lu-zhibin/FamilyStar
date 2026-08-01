import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requestContext } from '../../http/request-context.js';
import type { AppEnvironment } from '../../http/types.js';
import type { IntegrationSettingsOperations } from './integration-service.js';
import { registerIntegrationSettingsRoutes } from './integration-routes.js';

const operations = {
  get: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  test: vi.fn(),
} satisfies IntegrationSettingsOperations;

function app() {
  const api = new Hono<AppEnvironment>();
  api.use('*', requestContext);
  registerIntegrationSettingsRoutes(api, operations);
  return api;
}

describe('integration settings routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lets either parent-facing caller read masked integration status', async () => {
    operations.get.mockResolvedValueOnce({
      configured: true,
      status: 'verified',
      configuration: { bucket: 'family' },
      credentials_configured: true,
      last_verified_at: null,
      last_verification_result: { code: 'connection_ok' },
    });
    const response = await app().request('/family/integrations/cos', {
      headers: { Cookie: 'familystar_session=manager-session' },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(operations.get).toHaveBeenCalledWith({
      sessionToken: 'manager-session',
      integrationType: 'cos',
    });
    expect(JSON.stringify(body)).not.toContain('secret_key');
  });

  it('strictly validates COS configuration and credential fields', async () => {
    const response = await app().request('/family/integrations/cos', {
      method: 'PUT',
      headers: { Cookie: 'familystar_session=creator-session', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        configuration: {
          bucket: 'family',
          region: 'ap-guangzhou',
          domain: 'https://example.com',
          unexpected: true,
        },
        credentials: { secret_id: 'id', secret_key: 'key' },
      }),
    });

    expect(response.status).toBe(400);
    expect(operations.update).not.toHaveBeenCalled();
  });
});
