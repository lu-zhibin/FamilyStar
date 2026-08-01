import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { PrismaCredentialVaultRepository } from './prisma-repository.js';

const FAMILY_ID = '018f5f3a-9b2e-7c41-8d56-abcdef123456';
const RECORD_ID = '018f5f3a-9b2e-7c41-8d56-1234567890ab';

function storedRecord() {
  return {
    id: RECORD_ID,
    familyId: FAMILY_ID,
    encryptedCredentials: Uint8Array.from([1, 2]),
    credentialNonce: new Uint8Array(12),
    credentialAuthTag: new Uint8Array(16),
    wrappedDataKey: new Uint8Array(32),
    dataKeyNonce: new Uint8Array(12),
    dataKeyAuthTag: new Uint8Array(16),
    keyVersion: 'v1',
  };
}

describe('PrismaCredentialVaultRepository', () => {
  it('loads family-scoped encrypted fields without selecting configuration or credentials', async () => {
    const findFirst = vi.fn().mockResolvedValue(storedRecord());
    const repository = new PrismaCredentialVaultRepository({
      familyIntegrationSetting: { findFirst, updateMany: vi.fn() },
    } as unknown as PrismaClient);

    const record = await repository.findByFamilyAndType(FAMILY_ID, 'cos');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          familyId: FAMILY_ID,
          integrationType: 'COS',
          family: { deletedAt: null },
        },
      }),
    );
    expect(record?.context).toEqual({
      recordId: RECORD_ID,
      familyId: FAMILY_ID,
      integrationType: 'cos',
    });
    expect(record?.envelope.encryptedCredentials).toEqual(Buffer.from([1, 2]));
  });

  it('returns null when the family integration record does not exist', async () => {
    const repository = new PrismaCredentialVaultRepository({
      familyIntegrationSetting: {
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn(),
      },
    } as unknown as PrismaClient);

    await expect(repository.findByFamilyAndType(FAMILY_ID, 'email')).resolves.toBeNull();
  });

  it('updates only wrapped-key metadata with an expected key version', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new PrismaCredentialVaultRepository({
      familyIntegrationSetting: {
        findFirst: vi.fn().mockResolvedValue(storedRecord()),
        updateMany,
      },
    } as unknown as PrismaClient);
    const record = await repository.findByFamilyAndType(FAMILY_ID, 'email');
    if (record === null) throw new Error('Expected record');

    const updated = await repository.updateWrappedDataKey(record, {
      wrappedDataKey: Buffer.alloc(32, 2),
      dataKeyNonce: Buffer.alloc(12, 3),
      dataKeyAuthTag: Buffer.alloc(16, 4),
      keyVersion: 'v2',
    });

    expect(updated).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: RECORD_ID,
        familyId: FAMILY_ID,
        integrationType: 'EMAIL',
        keyVersion: 'v1',
      },
      data: {
        wrappedDataKey: Uint8Array.from(Buffer.alloc(32, 2)),
        dataKeyNonce: Uint8Array.from(Buffer.alloc(12, 3)),
        dataKeyAuthTag: Uint8Array.from(Buffer.alloc(16, 4)),
        keyVersion: 'v2',
      },
    });
  });

  it('reports an optimistic rewrap conflict', async () => {
    const repository = new PrismaCredentialVaultRepository({
      familyIntegrationSetting: {
        findFirst: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as PrismaClient);
    const record = {
      context: { recordId: RECORD_ID, familyId: FAMILY_ID, integrationType: 'cos' as const },
      envelope: {
        encryptedCredentials: Buffer.from([1]),
        credentialNonce: Buffer.alloc(12),
        credentialAuthTag: Buffer.alloc(16),
        wrappedDataKey: Buffer.alloc(32),
        dataKeyNonce: Buffer.alloc(12),
        dataKeyAuthTag: Buffer.alloc(16),
        keyVersion: 'v1',
      },
    };

    await expect(
      repository.updateWrappedDataKey(record, {
        wrappedDataKey: Buffer.alloc(32),
        dataKeyNonce: Buffer.alloc(12),
        dataKeyAuthTag: Buffer.alloc(16),
        keyVersion: 'v2',
      }),
    ).resolves.toBe(false);
  });
});
