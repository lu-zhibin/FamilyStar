import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { CREDENTIAL_VAULT_ERROR_CODES, CredentialVaultError } from './errors.js';
import type { AvailableMasterKeyring, MasterKeyring } from './keyring.js';

const AES_ALGORITHM = 'aes-256-gcm';
const DATA_KEY_BYTES = 32;
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type IntegrationType = 'email' | 'cos';

export type CredentialRecordContext = Readonly<{
  recordId: string;
  familyId: string;
  integrationType: IntegrationType;
}>;

export type CredentialPayload = Readonly<Record<string, string>>;

export type EncryptedCredentialEnvelope = Readonly<{
  encryptedCredentials: Buffer;
  credentialNonce: Buffer;
  credentialAuthTag: Buffer;
  wrappedDataKey: Buffer;
  dataKeyNonce: Buffer;
  dataKeyAuthTag: Buffer;
  keyVersion: string;
}>;

export type RewrappedDataKey = Readonly<{
  wrappedDataKey: Buffer;
  dataKeyNonce: Buffer;
  dataKeyAuthTag: Buffer;
  keyVersion: string;
}>;

function validateContext(context: CredentialRecordContext): void {
  if (!UUID_PATTERN.test(context.recordId) || !UUID_PATTERN.test(context.familyId)) {
    throw new CredentialVaultError(
      CREDENTIAL_VAULT_ERROR_CODES.INVALID_INPUT,
      'Credential record context is invalid.',
    );
  }
}

function validatePayload(payload: CredentialPayload): void {
  const entries = Object.entries(payload);
  if (
    entries.length === 0 ||
    entries.some(([name, value]) => name.length === 0 || typeof value !== 'string')
  ) {
    throw new CredentialVaultError(
      CREDENTIAL_VAULT_ERROR_CODES.INVALID_INPUT,
      'Credential payload is invalid.',
    );
  }
}

function associatedData(context: CredentialRecordContext, purpose: 'payload' | 'data-key'): Buffer {
  return Buffer.from(
    `familystar-credential-vault:v1:${purpose}:${context.familyId}:${context.integrationType}:${context.recordId}`,
    'utf8',
  );
}

function encrypt(plaintext: Buffer, key: Buffer, aad: Buffer): readonly [Buffer, Buffer, Buffer] {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(AES_ALGORITHM, key, nonce, { authTagLength: AUTH_TAG_BYTES });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return [ciphertext, nonce, cipher.getAuthTag()];
}

function decrypt(
  ciphertext: Buffer,
  key: Buffer,
  nonce: Buffer,
  authTag: Buffer,
  aad: Buffer,
): Buffer {
  if (nonce.length !== NONCE_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new CredentialVaultError(
      CREDENTIAL_VAULT_ERROR_CODES.AUTHENTICATION_FAILED,
      'Credential authentication failed.',
    );
  }

  try {
    const decipher = createDecipheriv(AES_ALGORITHM, key, nonce, {
      authTagLength: AUTH_TAG_BYTES,
    });
    decipher.setAAD(aad);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new CredentialVaultError(
      CREDENTIAL_VAULT_ERROR_CODES.AUTHENTICATION_FAILED,
      'Credential authentication failed.',
    );
  }
}

function requireAvailable(keyring: MasterKeyring): AvailableMasterKeyring {
  if (!keyring.available) {
    throw new CredentialVaultError(
      CREDENTIAL_VAULT_ERROR_CODES.UNAVAILABLE,
      'Credential vault is unavailable.',
    );
  }
  return keyring;
}

function requireMasterKey(keyring: AvailableMasterKeyring, keyVersion: string): Buffer {
  const key = keyring.getKey(keyVersion);
  if (key === undefined) {
    throw new CredentialVaultError(
      CREDENTIAL_VAULT_ERROR_CODES.UNKNOWN_KEY_VERSION,
      'Credential key version is unavailable.',
    );
  }
  return key;
}

function parsePayload(plaintext: Buffer): CredentialPayload {
  try {
    const parsed: unknown = JSON.parse(plaintext.toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('invalid payload');
    }
    const payload = Object.fromEntries(Object.entries(parsed));
    validatePayload(payload as CredentialPayload);
    return Object.freeze(payload as Record<string, string>);
  } catch (error) {
    if (error instanceof CredentialVaultError) {
      throw error;
    }
    throw new CredentialVaultError(
      CREDENTIAL_VAULT_ERROR_CODES.AUTHENTICATION_FAILED,
      'Credential authentication failed.',
    );
  }
}

export class CredentialVault {
  constructor(private readonly keyring: MasterKeyring) {}

  get status(): Readonly<{ available: boolean; reason?: string }> {
    return this.keyring.available
      ? Object.freeze({ available: true })
      : Object.freeze({ available: false, reason: this.keyring.reason });
  }

  get activeKeyVersion(): string | undefined {
    return this.keyring.available ? this.keyring.activeKeyVersion : undefined;
  }

  encrypt(
    context: CredentialRecordContext,
    payload: CredentialPayload,
  ): EncryptedCredentialEnvelope {
    validateContext(context);
    validatePayload(payload);
    const keyring = requireAvailable(this.keyring);
    const masterKey = requireMasterKey(keyring, keyring.activeKeyVersion);
    const dataKey = randomBytes(DATA_KEY_BYTES);
    const [encryptedCredentials, credentialNonce, credentialAuthTag] = encrypt(
      Buffer.from(JSON.stringify(payload), 'utf8'),
      dataKey,
      associatedData(context, 'payload'),
    );
    const [wrappedDataKey, dataKeyNonce, dataKeyAuthTag] = encrypt(
      dataKey,
      masterKey,
      associatedData(context, 'data-key'),
    );

    return Object.freeze({
      encryptedCredentials,
      credentialNonce,
      credentialAuthTag,
      wrappedDataKey,
      dataKeyNonce,
      dataKeyAuthTag,
      keyVersion: keyring.activeKeyVersion,
    });
  }

  decrypt(
    context: CredentialRecordContext,
    envelope: EncryptedCredentialEnvelope,
  ): CredentialPayload {
    validateContext(context);
    const keyring = requireAvailable(this.keyring);
    const masterKey = requireMasterKey(keyring, envelope.keyVersion);
    const dataKey = decrypt(
      envelope.wrappedDataKey,
      masterKey,
      envelope.dataKeyNonce,
      envelope.dataKeyAuthTag,
      associatedData(context, 'data-key'),
    );
    const plaintext = decrypt(
      envelope.encryptedCredentials,
      dataKey,
      envelope.credentialNonce,
      envelope.credentialAuthTag,
      associatedData(context, 'payload'),
    );
    return parsePayload(plaintext);
  }

  rewrapDataKey(
    context: CredentialRecordContext,
    envelope: EncryptedCredentialEnvelope,
  ): RewrappedDataKey {
    validateContext(context);
    const keyring = requireAvailable(this.keyring);
    const previousMasterKey = requireMasterKey(keyring, envelope.keyVersion);
    const dataKey = decrypt(
      envelope.wrappedDataKey,
      previousMasterKey,
      envelope.dataKeyNonce,
      envelope.dataKeyAuthTag,
      associatedData(context, 'data-key'),
    );
    const activeMasterKey = requireMasterKey(keyring, keyring.activeKeyVersion);
    const [wrappedDataKey, dataKeyNonce, dataKeyAuthTag] = encrypt(
      dataKey,
      activeMasterKey,
      associatedData(context, 'data-key'),
    );

    return Object.freeze({
      wrappedDataKey,
      dataKeyNonce,
      dataKeyAuthTag,
      keyVersion: keyring.activeKeyVersion,
    });
  }
}
