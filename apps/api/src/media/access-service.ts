import type { MediaAccessDependencies, MediaAccessOperations } from './access-types.js';

export class MediaAccessError extends Error {
  constructor(
    readonly code: 'UNAUTHORIZED' | 'INVALID' | 'NOT_FOUND' | 'UNAVAILABLE',
    message: string,
  ) {
    super(message);
    this.name = 'MediaAccessError';
  }
}

export class MediaAccessService implements MediaAccessOperations {
  constructor(private readonly dependencies: MediaAccessDependencies) {}

  async createAccessUrls(input: Parameters<MediaAccessOperations['createAccessUrls']>[0]) {
    const session = input.sessionToken
      ? await this.dependencies.sessions.read(input.sessionToken)
      : null;
    if (!session) throw new MediaAccessError('UNAUTHORIZED', 'An active session is required.');
    if (
      input.mediaIds.length < 1 ||
      input.mediaIds.length > 50 ||
      new Set(input.mediaIds).size !== input.mediaIds.length
    ) {
      throw new MediaAccessError('INVALID', 'The media_ids list is invalid.');
    }
    const assets = await this.dependencies.repository.findReadyAssets(
      session.familyId,
      input.mediaIds,
    );
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    if (byId.size !== input.mediaIds.length) {
      throw new MediaAccessError('NOT_FOUND', 'One or more media assets were not found.');
    }
    let connection;
    try {
      connection = await this.dependencies.connections.get(session.familyId);
    } catch {
      throw new MediaAccessError('UNAVAILABLE', 'Media storage is not configured.');
    }
    const items = [];
    try {
      for (const mediaId of input.mediaIds) {
        const asset = byId.get(mediaId);
        if (!asset) throw new MediaAccessError('NOT_FOUND', 'A media asset was not found.');
        const signed = await this.dependencies.cos.createReadUrl({
          connection,
          objectKey: asset.objectKey,
          expiresInSeconds: 900,
        });
        items.push({ mediaId, url: signed.url, expiresAt: signed.expiresAt });
      }
    } catch (error) {
      if (error instanceof MediaAccessError) throw error;
      throw new MediaAccessError('UNAVAILABLE', 'Media storage is temporarily unavailable.');
    }
    return { items };
  }
}
