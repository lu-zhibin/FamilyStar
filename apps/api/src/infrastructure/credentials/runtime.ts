import type { AppEnvironment } from '../../config/environment.js';
import { CREDENTIAL_VAULT_ERROR_CODES, CredentialVaultError } from './errors.js';
import { createMasterKeyring } from './keyring.js';
import { CredentialVault } from './vault.js';

let credentialVault: CredentialVault | undefined;

export function initializeCredentialVault(environment: AppEnvironment): CredentialVault {
  credentialVault = new CredentialVault(createMasterKeyring(environment));
  return credentialVault;
}

export function getCredentialVault(): CredentialVault {
  if (credentialVault === undefined) {
    throw new CredentialVaultError(
      CREDENTIAL_VAULT_ERROR_CODES.UNAVAILABLE,
      'Credential vault has not been initialized.',
    );
  }
  return credentialVault;
}
