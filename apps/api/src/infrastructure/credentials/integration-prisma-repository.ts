import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

import type { IntegrationSetting, IntegrationSettingsRepository } from './integration-service.js';
import type { IntegrationType } from './vault.js';

const integrationType = (value: IntegrationType) => (value === 'email' ? 'EMAIL' : 'COS');

const select = {
  id: true,
  familyId: true,
  integrationType: true,
  configuration: true,
  status: true,
  lastVerifiedAt: true,
  lastVerificationResult: true,
  encryptedCredentials: true,
  credentialNonce: true,
  credentialAuthTag: true,
  wrappedDataKey: true,
  dataKeyNonce: true,
  dataKeyAuthTag: true,
  keyVersion: true,
} satisfies Prisma.FamilyIntegrationSettingSelect;

type SelectedSetting = Prisma.FamilyIntegrationSettingGetPayload<{ select: typeof select }>;

function setting(value: SelectedSetting): IntegrationSetting {
  return {
    id: value.id,
    familyId: value.familyId,
    integrationType: value.integrationType === 'EMAIL' ? 'email' : 'cos',
    configuration: value.configuration as Record<string, unknown>,
    status: value.status,
    lastVerifiedAt: value.lastVerifiedAt,
    lastVerificationResult: value.lastVerificationResult,
    envelope: {
      encryptedCredentials: Buffer.from(value.encryptedCredentials),
      credentialNonce: Buffer.from(value.credentialNonce),
      credentialAuthTag: Buffer.from(value.credentialAuthTag),
      wrappedDataKey: Buffer.from(value.wrappedDataKey),
      dataKeyNonce: Buffer.from(value.dataKeyNonce),
      dataKeyAuthTag: Buffer.from(value.dataKeyAuthTag),
      keyVersion: value.keyVersion,
    },
  };
}

export class PrismaIntegrationSettingsRepository implements IntegrationSettingsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async isFamilyCreator(familyId: string, parentId: string): Promise<boolean | null> {
    const parent = await this.prisma.user.findFirst({
      where: {
        id: parentId,
        familyId,
        role: 'PARENT',
        deletedAt: null,
        family: { deletedAt: null },
      },
      select: { family: { select: { createdById: true } } },
    });
    return parent === null ? null : parent.family.createdById === parentId;
  }

  async find(familyId: string, type: IntegrationType): Promise<IntegrationSetting | null> {
    const value = await this.prisma.familyIntegrationSetting.findFirst({
      where: { familyId, integrationType: integrationType(type), family: { deletedAt: null } },
      select,
    });
    return value === null ? null : setting(value);
  }

  async save(input: Parameters<IntegrationSettingsRepository['save']>[0]) {
    const envelopeData =
      input.envelope === undefined
        ? {}
        : {
            encryptedCredentials: Uint8Array.from(input.envelope.encryptedCredentials),
            credentialNonce: Uint8Array.from(input.envelope.credentialNonce),
            credentialAuthTag: Uint8Array.from(input.envelope.credentialAuthTag),
            wrappedDataKey: Uint8Array.from(input.envelope.wrappedDataKey),
            dataKeyNonce: Uint8Array.from(input.envelope.dataKeyNonce),
            dataKeyAuthTag: Uint8Array.from(input.envelope.dataKeyAuthTag),
            keyVersion: input.envelope.keyVersion,
          };
    const value = await this.prisma.familyIntegrationSetting.upsert({
      where: {
        familyId_integrationType: {
          familyId: input.familyId,
          integrationType: integrationType(input.integrationType),
        },
      },
      create: {
        id: input.id,
        familyId: input.familyId,
        integrationType: integrationType(input.integrationType),
        configuration: input.configuration as Prisma.InputJsonObject,
        createdById: input.actorId,
        updatedById: input.actorId,
        ...envelopeData,
      } as Prisma.FamilyIntegrationSettingUncheckedCreateInput,
      update: {
        configuration: input.configuration as Prisma.InputJsonObject,
        updatedById: input.actorId,
        status: 'PENDING',
        lastVerifiedAt: null,
        lastVerificationResult: Prisma.JsonNull,
        ...envelopeData,
      },
      select,
    });
    return setting(value);
  }

  async remove(familyId: string, type: IntegrationType): Promise<boolean> {
    const result = await this.prisma.familyIntegrationSetting.deleteMany({
      where: { familyId, integrationType: integrationType(type), family: { deletedAt: null } },
    });
    return result.count === 1;
  }

  async recordVerification(
    input: Parameters<IntegrationSettingsRepository['recordVerification']>[0],
  ) {
    const updated = await this.prisma.familyIntegrationSetting.updateMany({
      where: {
        familyId: input.familyId,
        integrationType: integrationType(input.integrationType),
        family: { deletedAt: null },
      },
      data: {
        status: input.status,
        lastVerifiedAt: input.verifiedAt,
        lastVerificationResult: input.result,
        updatedById: input.actorId,
      },
    });
    return updated.count === 1 ? this.find(input.familyId, input.integrationType) : null;
  }
}
