import { randomUUID } from 'node:crypto';

import type { SessionStore } from '../../family-auth/types.js';
import type { CredentialPayload, CredentialVault, IntegrationType } from './vault.js';
import type { EncryptedCredentialEnvelope } from './vault.js';

export type IntegrationSetting = Readonly<{
  id: string;
  familyId: string;
  integrationType: IntegrationType;
  configuration: Readonly<Record<string, unknown>>;
  status: 'PENDING' | 'VERIFIED' | 'INVALID';
  lastVerifiedAt: Date | null;
  lastVerificationResult: unknown;
  envelope: EncryptedCredentialEnvelope;
}>;

export type IntegrationSettingsRepository = {
  isFamilyCreator(familyId: string, parentId: string): Promise<boolean | null>;
  find(familyId: string, integrationType: IntegrationType): Promise<IntegrationSetting | null>;
  save(input: {
    id: string;
    familyId: string;
    integrationType: IntegrationType;
    configuration: Readonly<Record<string, unknown>>;
    actorId: string;
    envelope?: EncryptedCredentialEnvelope;
  }): Promise<IntegrationSetting>;
  remove(familyId: string, integrationType: IntegrationType): Promise<boolean>;
  recordVerification(input: {
    familyId: string;
    integrationType: IntegrationType;
    actorId: string;
    status: 'VERIFIED' | 'INVALID';
    verifiedAt: Date;
    result: Readonly<{ code: string }>;
  }): Promise<IntegrationSetting | null>;
};

export type IntegrationVerifier = {
  verify(input: {
    integrationType: IntegrationType;
    configuration: Readonly<Record<string, unknown>>;
    credentials: CredentialPayload;
  }): Promise<{ success: boolean; code: string }>;
};

export class IntegrationAuthenticationError extends Error {}
export class IntegrationCreatorRequiredError extends Error {}
export class IntegrationNotFoundError extends Error {}
export class IntegrationVerificationUnavailableError extends Error {}
export class InvalidIntegrationSettingError extends Error {}

export type IntegrationSettingsOperations = {
  get(input: { sessionToken?: string; integrationType: IntegrationType }): Promise<unknown>;
  update(input: {
    sessionToken?: string;
    integrationType: IntegrationType;
    configuration: Readonly<Record<string, unknown>>;
    credentials?: CredentialPayload;
  }): Promise<unknown>;
  remove(input: { sessionToken?: string; integrationType: IntegrationType }): Promise<void>;
  test(input: { sessionToken?: string; integrationType: IntegrationType }): Promise<unknown>;
};

function publicSetting(setting: IntegrationSetting | null) {
  return setting === null
    ? {
        configured: false,
        status: null,
        configuration: null,
        credentials_configured: false,
        last_verified_at: null,
        last_verification_result: null,
      }
    : {
        configured: true,
        status: setting.status.toLowerCase(),
        configuration: setting.configuration,
        credentials_configured: true,
        last_verified_at: setting.lastVerifiedAt?.toISOString() ?? null,
        last_verification_result: setting.lastVerificationResult,
      };
}

export class IntegrationSettingsService implements IntegrationSettingsOperations {
  constructor(
    private readonly repository: IntegrationSettingsRepository,
    private readonly sessions: SessionStore,
    private readonly vault: CredentialVault,
    private readonly verifier?: IntegrationVerifier,
  ) {}

  private async parent(sessionToken?: string) {
    const session = sessionToken === undefined ? null : await this.sessions.read(sessionToken);
    if (!session || session.role !== 'parent') throw new IntegrationAuthenticationError();
    const creator = await this.repository.isFamilyCreator(session.familyId, session.subjectId);
    if (creator === null) throw new IntegrationAuthenticationError();
    return { session, creator };
  }

  private async creator(sessionToken?: string) {
    const context = await this.parent(sessionToken);
    if (!context.creator) throw new IntegrationCreatorRequiredError();
    return context.session;
  }

  async get(input: { sessionToken?: string; integrationType: IntegrationType }) {
    const { session } = await this.parent(input.sessionToken);
    return publicSetting(await this.repository.find(session.familyId, input.integrationType));
  }

  async update(input: {
    sessionToken?: string;
    integrationType: IntegrationType;
    configuration: Readonly<Record<string, unknown>>;
    credentials?: CredentialPayload;
  }) {
    const session = await this.creator(input.sessionToken);
    const current = await this.repository.find(session.familyId, input.integrationType);
    if (current === null && input.credentials === undefined) {
      throw new InvalidIntegrationSettingError('Credentials are required for a new integration.');
    }
    const id = current?.id ?? randomUUID();
    const envelope =
      input.credentials === undefined
        ? undefined
        : this.vault.encrypt(
            { recordId: id, familyId: session.familyId, integrationType: input.integrationType },
            input.credentials,
          );
    const setting = await this.repository.save({
      id,
      familyId: session.familyId,
      integrationType: input.integrationType,
      configuration: input.configuration,
      actorId: session.subjectId,
      ...(envelope === undefined ? {} : { envelope }),
    });
    return publicSetting(setting);
  }

  async remove(input: { sessionToken?: string; integrationType: IntegrationType }): Promise<void> {
    const session = await this.creator(input.sessionToken);
    if (!(await this.repository.remove(session.familyId, input.integrationType))) {
      throw new IntegrationNotFoundError();
    }
  }

  async test(input: { sessionToken?: string; integrationType: IntegrationType }) {
    const session = await this.creator(input.sessionToken);
    if (!this.verifier) throw new IntegrationVerificationUnavailableError();
    const setting = await this.repository.find(session.familyId, input.integrationType);
    if (!setting) throw new IntegrationNotFoundError();
    const credentials = this.vault.decrypt(
      { recordId: setting.id, familyId: session.familyId, integrationType: input.integrationType },
      setting.envelope,
    );
    const result = await this.verifier.verify({
      integrationType: input.integrationType,
      configuration: setting.configuration,
      credentials,
    });
    const updated = await this.repository.recordVerification({
      familyId: session.familyId,
      integrationType: input.integrationType,
      actorId: session.subjectId,
      status: result.success ? 'VERIFIED' : 'INVALID',
      verifiedAt: new Date(),
      result: { code: result.code },
    });
    if (!updated) throw new IntegrationNotFoundError();
    return publicSetting(updated);
  }
}
