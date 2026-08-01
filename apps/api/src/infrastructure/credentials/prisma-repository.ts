import type { PrismaClient } from '@prisma/client';

import type {
  CredentialRecordContext,
  EncryptedCredentialEnvelope,
  IntegrationType,
  RewrappedDataKey,
} from './vault.js';

export type StoredCredentialEncryption = Readonly<{
  context: CredentialRecordContext;
  envelope: EncryptedCredentialEnvelope;
}>;

function prismaIntegrationType(integrationType: IntegrationType): 'EMAIL' | 'COS' {
  return integrationType === 'email' ? 'EMAIL' : 'COS';
}

function prismaBytes(value: Buffer): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(value);
}

export class PrismaCredentialVaultRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByFamilyAndType(
    familyId: string,
    integrationType: IntegrationType,
  ): Promise<StoredCredentialEncryption | null> {
    const record = await this.prisma.familyIntegrationSetting.findFirst({
      where: {
        familyId,
        integrationType: prismaIntegrationType(integrationType),
        family: { deletedAt: null },
      },
      select: {
        id: true,
        familyId: true,
        encryptedCredentials: true,
        credentialNonce: true,
        credentialAuthTag: true,
        wrappedDataKey: true,
        dataKeyNonce: true,
        dataKeyAuthTag: true,
        keyVersion: true,
      },
    });

    if (record === null) {
      return null;
    }

    return Object.freeze({
      context: Object.freeze({ recordId: record.id, familyId: record.familyId, integrationType }),
      envelope: Object.freeze({
        encryptedCredentials: Buffer.from(record.encryptedCredentials),
        credentialNonce: Buffer.from(record.credentialNonce),
        credentialAuthTag: Buffer.from(record.credentialAuthTag),
        wrappedDataKey: Buffer.from(record.wrappedDataKey),
        dataKeyNonce: Buffer.from(record.dataKeyNonce),
        dataKeyAuthTag: Buffer.from(record.dataKeyAuthTag),
        keyVersion: record.keyVersion,
      }),
    });
  }

  async findConfigurationByFamilyAndType(
    familyId: string,
    integrationType: IntegrationType,
  ): Promise<{ configuration: unknown; status: 'PENDING' | 'VERIFIED' | 'INVALID' } | null> {
    return this.prisma.familyIntegrationSetting.findFirst({
      where: {
        familyId,
        integrationType: prismaIntegrationType(integrationType),
        family: { deletedAt: null },
      },
      select: { configuration: true, status: true },
    });
  }

  async updateWrappedDataKey(
    record: StoredCredentialEncryption,
    rewrapped: RewrappedDataKey,
  ): Promise<boolean> {
    const result = await this.prisma.familyIntegrationSetting.updateMany({
      where: {
        id: record.context.recordId,
        familyId: record.context.familyId,
        integrationType: prismaIntegrationType(record.context.integrationType),
        keyVersion: record.envelope.keyVersion,
      },
      data: {
        wrappedDataKey: prismaBytes(rewrapped.wrappedDataKey),
        dataKeyNonce: prismaBytes(rewrapped.dataKeyNonce),
        dataKeyAuthTag: prismaBytes(rewrapped.dataKeyAuthTag),
        keyVersion: rewrapped.keyVersion,
      },
    });

    return result.count === 1;
  }
}
