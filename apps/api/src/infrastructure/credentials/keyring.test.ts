import { describe, expect, it } from 'vitest';

import { createMasterKeyring } from './keyring.js';

const KEY_V1 = Buffer.alloc(32, 1).toString('base64');
const KEY_V2 = Buffer.alloc(32, 2).toString('base64');

describe('createMasterKeyring', () => {
  it('reports missing optional configuration without exposing key material', () => {
    expect(createMasterKeyring({})).toEqual({
      available: false,
      reason: 'missing_configuration',
    });
  });

  it('loads versioned 256-bit keys and returns defensive copies', () => {
    const keyring = createMasterKeyring({
      CREDENTIAL_VAULT_ACTIVE_KEY_VERSION: 'v2',
      CREDENTIAL_VAULT_MASTER_KEYS: JSON.stringify({ v1: KEY_V1, v2: KEY_V2 }),
    });

    expect(keyring.available).toBe(true);
    if (!keyring.available) return;

    expect(keyring.activeKeyVersion).toBe('v2');
    const first = keyring.getKey('v2');
    expect(first).toEqual(Buffer.alloc(32, 2));
    first?.fill(9);
    expect(keyring.getKey('v2')).toEqual(Buffer.alloc(32, 2));
    expect(keyring.getKey('missing')).toBeUndefined();
  });

  it.each([
    [{ CREDENTIAL_VAULT_ACTIVE_KEY_VERSION: 'v1' }],
    [{ CREDENTIAL_VAULT_MASTER_KEYS: JSON.stringify({ v1: KEY_V1 }) }],
    [
      {
        CREDENTIAL_VAULT_ACTIVE_KEY_VERSION: 'missing',
        CREDENTIAL_VAULT_MASTER_KEYS: JSON.stringify({ v1: KEY_V1 }),
      },
    ],
    [
      {
        CREDENTIAL_VAULT_ACTIVE_KEY_VERSION: 'invalid version',
        CREDENTIAL_VAULT_MASTER_KEYS: JSON.stringify({ 'invalid version': KEY_V1 }),
      },
    ],
    [
      {
        CREDENTIAL_VAULT_ACTIVE_KEY_VERSION: 'v1',
        CREDENTIAL_VAULT_MASTER_KEYS: JSON.stringify({ v1: Buffer.alloc(31).toString('base64') }),
      },
    ],
    [
      {
        CREDENTIAL_VAULT_ACTIVE_KEY_VERSION: 'v1',
        CREDENTIAL_VAULT_MASTER_KEYS: 'private-invalid-json',
      },
    ],
    [
      {
        CREDENTIAL_VAULT_ACTIVE_KEY_VERSION: 'v1',
        CREDENTIAL_VAULT_MASTER_KEYS: '[]',
      },
    ],
    [
      {
        CREDENTIAL_VAULT_ACTIVE_KEY_VERSION: 'v1',
        CREDENTIAL_VAULT_MASTER_KEYS: '{}',
      },
    ],
  ])('reports invalid configuration for malformed keyring input', (environment) => {
    expect(createMasterKeyring(environment)).toEqual({
      available: false,
      reason: 'invalid_configuration',
    });
  });
});
