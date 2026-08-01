import { describe, expect, it, vi } from 'vitest';

import { parseEnvironment } from '../../config/environment.js';
import { CREDENTIAL_VAULT_ERROR_CODES } from './errors.js';

describe('credential vault runtime', () => {
  it('requires startup initialization before access', async () => {
    vi.resetModules();
    const runtime = await import('./runtime.js');

    expect(() => runtime.getCredentialVault()).toThrowError(
      expect.objectContaining({ code: CREDENTIAL_VAULT_ERROR_CODES.UNAVAILABLE }),
    );
  });

  it('retains the startup-validated unavailable state', async () => {
    vi.resetModules();
    const runtime = await import('./runtime.js');
    const initialized = runtime.initializeCredentialVault(parseEnvironment({}));

    expect(initialized.status).toEqual({ available: false, reason: 'missing_configuration' });
    expect(runtime.getCredentialVault()).toBe(initialized);
  });

  it('initializes an available vault from versioned server configuration', async () => {
    vi.resetModules();
    const runtime = await import('./runtime.js');
    const initialized = runtime.initializeCredentialVault(
      parseEnvironment({
        CREDENTIAL_VAULT_ACTIVE_KEY_VERSION: 'v1',
        CREDENTIAL_VAULT_MASTER_KEYS: JSON.stringify({
          v1: Buffer.alloc(32, 7).toString('base64'),
        }),
      }),
    );

    expect(initialized.status).toEqual({ available: true });
    expect(initialized.activeKeyVersion).toBe('v1');
  });
});
