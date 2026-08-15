import { describe, expect, it, vi } from 'vitest';

import { createMasterKeyring } from './keyring.js';
import {
  IntegrationCreatorRequiredError,
  type IntegrationSettingsRepository,
  IntegrationSettingsService,
} from './integration-service.js';
import { CredentialVault } from './vault.js';

const familyId = '10000000-0000-4000-8000-000000000001';
const creatorId = '20000000-0000-4000-8000-000000000001';
const managerId = '30000000-0000-4000-8000-000000000001';
const recordId = '40000000-0000-4000-8000-000000000001';

function vault() {
  return new CredentialVault(
    createMasterKeyring({
      CREDENTIAL_VAULT_ACTIVE_KEY_VERSION: 'v1',
      CREDENTIAL_VAULT_MASTER_KEYS: JSON.stringify({ v1: Buffer.alloc(32, 7).toString('base64') }),
    }),
  );
}

function sessions(subjectId: string) {
  return {
    create: vi.fn(),
    read: vi.fn().mockResolvedValue({
      subjectId,
      familyId,
      role: 'parent' as const,
      issuedAt: '2026-07-31T00:00:00.000Z',
    }),
    revoke: vi.fn(),
    revokeSubject: vi.fn(),
  };
}

function repository(creator: boolean) {
  const save = vi.fn(async (input: Parameters<IntegrationSettingsRepository['save']>[0]) => ({
    id: input.id,
    familyId: input.familyId,
    integrationType: input.integrationType,
    configuration: input.configuration,
    status: 'PENDING' as const,
    lastVerifiedAt: null,
    lastVerificationResult: null,
    envelope: input.envelope!,
  }));
  return {
    isFamilyCreator: vi.fn().mockResolvedValue(creator),
    find: vi.fn().mockResolvedValue(null),
    save,
    remove: vi.fn().mockResolvedValue(true),
    recordVerification: vi.fn(),
  } satisfies IntegrationSettingsRepository;
}

describe('IntegrationSettingsService permissions and redaction', () => {
  it('allows the family creator to save credentials and returns only masked status', async () => {
    const storage = repository(true);
    const service = new IntegrationSettingsService(storage, sessions(creatorId), vault());

    const result = await service.update({
      sessionToken: 'creator-session',
      integrationType: 'cos',
      configuration: { bucket: 'family', region: 'ap-guangzhou', domain: 'https://example.com' },
      credentials: { secret_id: 'secret-id', secret_key: 'secret-key' },
    });

    expect(result).toMatchObject({
      configured: true,
      status: 'pending',
      credentials_configured: true,
    });
    expect(JSON.stringify(result)).not.toContain('secret-id');
    expect(JSON.stringify(result)).not.toContain('secret-key');
    expect(storage.save).toHaveBeenCalledWith(
      expect.objectContaining({ familyId, actorId: creatorId, integrationType: 'cos' }),
    );
  });

  it('allows a co-manager to read status and blocks credential maintenance', async () => {
    const storage = repository(false);
    const service = new IntegrationSettingsService(storage, sessions(managerId), vault());

    await expect(
      service.get({ sessionToken: 'manager-session', integrationType: 'email' }),
    ).resolves.toMatchObject({
      configured: false,
      credentials_configured: false,
    });
    await expect(
      service.update({
        sessionToken: 'manager-session',
        integrationType: 'email',
        configuration: {
          host: 'smtp.example.com',
          port: 465,
          tls_mode: 'tls',
          from_name: 'FamilyStar',
          from_address: 'family@example.com',
        },
        credentials: { username: 'family@example.com', password: 'authorization-code' },
      }),
    ).rejects.toBeInstanceOf(IntegrationCreatorRequiredError);
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('keeps decrypted credentials inside one verification call and stores a safe result code', async () => {
    const credentialVault = vault();
    const envelope = credentialVault.encrypt(
      { recordId, familyId, integrationType: 'cos' },
      { secret_id: 'secret-id', secret_key: 'secret-key' },
    );
    const storage = repository(true);
    storage.find.mockResolvedValue({
      id: recordId,
      familyId,
      integrationType: 'cos',
      configuration: { bucket: 'family' },
      status: 'PENDING',
      lastVerifiedAt: null,
      lastVerificationResult: null,
      envelope,
    });
    storage.recordVerification.mockImplementation(async (input) => ({
      id: recordId,
      familyId,
      integrationType: 'cos',
      configuration: { bucket: 'family' },
      status: input.status,
      lastVerifiedAt: input.verifiedAt,
      lastVerificationResult: input.result,
      envelope,
    }));
    const verify = vi.fn().mockResolvedValue({ success: true, code: 'connection_ok' });
    const service = new IntegrationSettingsService(storage, sessions(creatorId), credentialVault, {
      verify,
    });

    const result = await service.test({ sessionToken: 'creator-session', integrationType: 'cos' });

    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: { secret_id: 'secret-id', secret_key: 'secret-key' },
      }),
    );
    expect(storage.recordVerification).toHaveBeenCalledWith(
      expect.objectContaining({ result: { code: 'connection_ok' }, status: 'VERIFIED' }),
    );
    expect(JSON.stringify(result)).not.toContain('secret-key');
  });
});
