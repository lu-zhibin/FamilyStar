import type { AppEnvironment } from '../../config/environment.js';

const MASTER_KEY_BYTES = 32;
const KEY_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

type VaultEnvironment = Pick<
  AppEnvironment,
  'CREDENTIAL_VAULT_ACTIVE_KEY_VERSION' | 'CREDENTIAL_VAULT_MASTER_KEYS'
>;

export type CredentialVaultUnavailableReason = 'missing_configuration' | 'invalid_configuration';

export type AvailableMasterKeyring = Readonly<{
  available: true;
  activeKeyVersion: string;
  getKey(keyVersion: string): Buffer | undefined;
}>;

export type UnavailableMasterKeyring = Readonly<{
  available: false;
  reason: CredentialVaultUnavailableReason;
}>;

export type MasterKeyring = AvailableMasterKeyring | UnavailableMasterKeyring;

function decodeMasterKey(value: unknown): Buffer | undefined {
  if (typeof value !== 'string' || !BASE64_PATTERN.test(value)) {
    return undefined;
  }

  const key = Buffer.from(value, 'base64');
  if (key.length !== MASTER_KEY_BYTES || key.toString('base64') !== value) {
    return undefined;
  }

  return key;
}

export function createMasterKeyring(environment: VaultEnvironment): MasterKeyring {
  const activeKeyVersion = environment.CREDENTIAL_VAULT_ACTIVE_KEY_VERSION;
  const serializedKeys = environment.CREDENTIAL_VAULT_MASTER_KEYS;

  if (activeKeyVersion === undefined && serializedKeys === undefined) {
    return Object.freeze({ available: false, reason: 'missing_configuration' });
  }

  if (
    activeKeyVersion === undefined ||
    serializedKeys === undefined ||
    !KEY_VERSION_PATTERN.test(activeKeyVersion)
  ) {
    return Object.freeze({ available: false, reason: 'invalid_configuration' });
  }

  try {
    const parsed: unknown = JSON.parse(serializedKeys);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return Object.freeze({ available: false, reason: 'invalid_configuration' });
    }

    const entries = Object.entries(parsed);
    if (entries.length === 0) {
      return Object.freeze({ available: false, reason: 'invalid_configuration' });
    }

    const keys = new Map<string, Buffer>();
    for (const [version, encodedKey] of entries) {
      const key = decodeMasterKey(encodedKey);
      if (!KEY_VERSION_PATTERN.test(version) || key === undefined) {
        return Object.freeze({ available: false, reason: 'invalid_configuration' });
      }
      keys.set(version, key);
    }

    if (!keys.has(activeKeyVersion)) {
      return Object.freeze({ available: false, reason: 'invalid_configuration' });
    }

    return Object.freeze({
      available: true,
      activeKeyVersion,
      getKey(keyVersion: string): Buffer | undefined {
        const key = keys.get(keyVersion);
        return key === undefined ? undefined : Buffer.from(key);
      },
    });
  } catch {
    return Object.freeze({ available: false, reason: 'invalid_configuration' });
  }
}
