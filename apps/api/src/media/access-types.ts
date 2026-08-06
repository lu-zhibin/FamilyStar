import type { SessionStore } from '../family-auth/types.js';
import type { CosClientPort, CosConnectionProvider } from './types.js';

export type MediaAccessAsset = Readonly<{
  id: string;
  objectKey: string;
}>;

export type MediaAccessRepository = {
  findReadyAssets(
    familyId: string,
    mediaIds: readonly string[],
  ): Promise<readonly MediaAccessAsset[]>;
};

export type MediaAccessOperations = {
  createAccessUrls(input: { sessionToken?: string; mediaIds: readonly string[] }): Promise<{
    items: readonly Readonly<{ mediaId: string; url: string; expiresAt: Date }>[];
  }>;
};

export type MediaAccessDependencies = Readonly<{
  repository: MediaAccessRepository;
  sessions: SessionStore;
  connections: CosConnectionProvider;
  cos: CosClientPort;
}>;
