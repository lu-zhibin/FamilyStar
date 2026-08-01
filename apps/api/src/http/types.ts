import type { AuthSession } from '../family-auth/types.js';

export type AppVariables = {
  requestId: string;
  authSession: AuthSession | undefined;
  sessionToken: string | undefined;
};

export type AppEnvironment = {
  Variables: AppVariables;
};
