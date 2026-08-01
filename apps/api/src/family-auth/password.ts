import { createRequire } from 'node:module';

import { BCRYPT_COST } from './constants.js';

type BcryptModule = {
  compare(value: string, hash: string): Promise<boolean>;
  getRounds(hash: string): number;
  hash(value: string, rounds: number): Promise<string>;
  truncates(value: string): boolean;
};

const require = createRequire(import.meta.url);

function loadBcrypt(): BcryptModule {
  return require('bcryptjs') as BcryptModule;
}

export type PasswordHasher = {
  hash(value: string): Promise<string>;
  verify(value: string, hash: string): Promise<boolean>;
};

export class InvalidParentPasswordError extends Error {
  constructor(readonly reason: 'too-short' | 'too-long') {
    super(
      reason === 'too-short'
        ? 'Password must contain at least 12 characters.'
        : 'Password exceeds the bcrypt byte limit.',
    );
    this.name = 'InvalidParentPasswordError';
  }
}

export function validateParentPassword(password: string): void {
  if (password.length < 12) throw new InvalidParentPasswordError('too-short');
  if (loadBcrypt().truncates(password)) throw new InvalidParentPasswordError('too-long');
}

export const parentPasswordHasher: PasswordHasher = Object.freeze({
  async hash(value) {
    validateParentPassword(value);
    return loadBcrypt().hash(value, BCRYPT_COST);
  },
  verify: (value, hash) => loadBcrypt().compare(value, hash),
});

export const bcryptHasher: PasswordHasher = Object.freeze({
  hash: (value) => loadBcrypt().hash(value, BCRYPT_COST),
  verify: (value, hash) => loadBcrypt().compare(value, hash),
});

export function getPasswordHashCost(hash: string): number {
  return loadBcrypt().getRounds(hash);
}
