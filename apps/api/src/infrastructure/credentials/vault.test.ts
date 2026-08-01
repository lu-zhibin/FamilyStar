import { describe, expect, it } from 'vitest';

import { CREDENTIAL_VAULT_ERROR_CODES, CredentialVaultError } from './errors.js';
import { createMasterKeyring } from './keyring.js';
import {
  CredentialVault,
  type CredentialRecordContext,
  type EncryptedCredentialEnvelope,
} from './vault.js';

const CONTEXT: CredentialRecordContext = {
  recordId: '018f5f3a-9b2e-7c41-8d56-1234567890ab',
  familyId: '018f5f3a-9b2e-7c41-8d56-abcdef123456',
  integrationType: 'email',
};
const KEY_V1 = Buffer.alloc(32, 1).toString('base64');
const KEY_V2 = Buffer.alloc(32, 2).toString('base64');

function createVault(activeKeyVersion = 'v1'): CredentialVault {
  return new CredentialVault(
    createMasterKeyring({
      CREDENTIAL_VAULT_ACTIVE_KEY_VERSION: activeKeyVersion,
      CREDENTIAL_VAULT_MASTER_KEYS: JSON.stringify({ v1: KEY_V1, v2: KEY_V2 }),
    }),
  );
}

function mutate(buffer: Buffer): Buffer {
  const changed = Buffer.from(buffer);
  changed[0] = (changed[0] ?? 0) ^ 1;
  return changed;
}

describe('CredentialVault', () => {
  it('encrypts and decrypts an email credential payload', () => {
    const vault = createVault();
    const envelope = vault.encrypt(CONTEXT, {
      username: 'parent@example.test',
      password: 'smtp-authorization-code',
    });

    expect(envelope.keyVersion).toBe('v1');
    expect(envelope.credentialNonce).toHaveLength(12);
    expect(envelope.credentialAuthTag).toHaveLength(16);
    expect(envelope.wrappedDataKey).toHaveLength(32);
    expect(envelope.dataKeyNonce).toHaveLength(12);
    expect(envelope.dataKeyAuthTag).toHaveLength(16);
    expect(vault.decrypt(CONTEXT, envelope)).toEqual({
      username: 'parent@example.test',
      password: 'smtp-authorization-code',
    });
  });

  it('uses independent data keys and nonces for each record encryption', () => {
    const vault = createVault();
    const first = vault.encrypt(CONTEXT, { secretId: 'id', secretKey: 'key' });
    const second = vault.encrypt(CONTEXT, { secretId: 'id', secretKey: 'key' });

    expect(first.encryptedCredentials).not.toEqual(second.encryptedCredentials);
    expect(first.wrappedDataKey).not.toEqual(second.wrappedDataKey);
    expect(first.credentialNonce).not.toEqual(second.credentialNonce);
    expect(first.dataKeyNonce).not.toEqual(second.dataKeyNonce);
  });

  it.each([
    'encryptedCredentials',
    'credentialNonce',
    'credentialAuthTag',
    'wrappedDataKey',
    'dataKeyNonce',
    'dataKeyAuthTag',
  ] as const)('rejects tampering with %s', (field) => {
    const vault = createVault();
    const envelope = vault.encrypt(CONTEXT, { password: 'secret' });
    const tampered = { ...envelope, [field]: mutate(envelope[field]) };

    expect(() => vault.decrypt(CONTEXT, tampered)).toThrowError(
      expect.objectContaining({ code: CREDENTIAL_VAULT_ERROR_CODES.AUTHENTICATION_FAILED }),
    );
  });

  it('binds ciphertext to its family, integration type, and record ID', () => {
    const vault = createVault();
    const envelope = vault.encrypt(CONTEXT, { password: 'secret' });

    for (const changedContext of [
      { ...CONTEXT, familyId: '018f5f3a-9b2e-7c41-8d56-abcdef123457' },
      { ...CONTEXT, recordId: '018f5f3a-9b2e-7c41-8d56-1234567890ac' },
      { ...CONTEXT, integrationType: 'cos' as const },
    ]) {
      expect(() => vault.decrypt(changedContext, envelope)).toThrowError(
        expect.objectContaining({ code: CREDENTIAL_VAULT_ERROR_CODES.AUTHENTICATION_FAILED }),
      );
    }
  });

  it('reports an unknown historical master-key version', () => {
    const vault = createVault();
    const envelope = vault.encrypt(CONTEXT, { password: 'secret' });

    expect(() => vault.decrypt(CONTEXT, { ...envelope, keyVersion: 'retired' })).toThrowError(
      expect.objectContaining({ code: CREDENTIAL_VAULT_ERROR_CODES.UNKNOWN_KEY_VERSION }),
    );
  });

  it('rewraps only the data key under the active master-key version', () => {
    const oldVault = createVault('v1');
    const envelope = oldVault.encrypt(CONTEXT, { secretId: 'cos-id', secretKey: 'cos-key' });
    const rotatedVault = createVault('v2');
    const rewrapped = rotatedVault.rewrapDataKey(CONTEXT, envelope);
    const rotatedEnvelope: EncryptedCredentialEnvelope = { ...envelope, ...rewrapped };

    expect(rewrapped.keyVersion).toBe('v2');
    expect(rewrapped.wrappedDataKey).not.toEqual(envelope.wrappedDataKey);
    expect(rotatedEnvelope.encryptedCredentials).toBe(envelope.encryptedCredentials);
    expect(rotatedEnvelope.credentialNonce).toBe(envelope.credentialNonce);
    expect(rotatedEnvelope.credentialAuthTag).toBe(envelope.credentialAuthTag);
    expect(rotatedVault.decrypt(CONTEXT, rotatedEnvelope)).toEqual({
      secretId: 'cos-id',
      secretKey: 'cos-key',
    });
  });

  it('blocks operations while optional key configuration is unavailable', () => {
    const vault = new CredentialVault(createMasterKeyring({}));

    expect(vault.status).toEqual({ available: false, reason: 'missing_configuration' });
    expect(vault.activeKeyVersion).toBeUndefined();
    expect(() => vault.encrypt(CONTEXT, { password: 'secret' })).toThrowError(
      expect.objectContaining({ code: CREDENTIAL_VAULT_ERROR_CODES.UNAVAILABLE }),
    );
  });

  it('rejects invalid record context and empty payload with stable errors', () => {
    const vault = createVault();

    expect(() =>
      vault.encrypt({ ...CONTEXT, familyId: 'invalid' }, { password: 'secret' }),
    ).toThrow(CredentialVaultError);
    expect(() => vault.encrypt(CONTEXT, {})).toThrowError(
      expect.objectContaining({ code: CREDENTIAL_VAULT_ERROR_CODES.INVALID_INPUT }),
    );
  });
});
