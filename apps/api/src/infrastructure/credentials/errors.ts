export const CREDENTIAL_VAULT_ERROR_CODES = {
  UNAVAILABLE: 'VAULT_UNAVAILABLE',
  INVALID_INPUT: 'INVALID_INPUT',
  UNKNOWN_KEY_VERSION: 'UNKNOWN_KEY_VERSION',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
} as const;

export type CredentialVaultErrorCode =
  (typeof CREDENTIAL_VAULT_ERROR_CODES)[keyof typeof CREDENTIAL_VAULT_ERROR_CODES];

export class CredentialVaultError extends Error {
  override readonly name = 'CredentialVaultError';

  constructor(
    readonly code: CredentialVaultErrorCode,
    message: string,
  ) {
    super(message);
  }
}
