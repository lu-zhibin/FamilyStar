import { randomBytes } from 'node:crypto';

import type { MediaDependencies, MediaOperations, MediaUploadSessionRecord } from './types.js';
import {
  hasExpectedSignature,
  MAX_VIDEO_BYTES,
  sha256,
  validateMediaDeclaration,
} from './validation.js';

export class MediaError extends Error {
  constructor(
    public readonly code: 'UNAUTHORIZED' | 'INVALID' | 'NOT_FOUND' | 'CONFLICT' | 'UNAVAILABLE',
    message: string,
  ) {
    super(message);
    this.name = 'MediaError';
  }
}

function defaultObjectKey(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '/');
  return `${date}/${randomBytes(24).toString('hex')}`;
}

export class MediaService implements MediaOperations {
  private readonly objectKeyFactory: () => string;

  constructor(private readonly dependencies: MediaDependencies) {
    this.objectKeyFactory = dependencies.objectKeyFactory ?? defaultObjectKey;
  }

  async initialize(input: Parameters<MediaOperations['initialize']>[0]) {
    const familyId = await this.requireFamily(input.sessionToken);
    try {
      validateMediaDeclaration(input);
    } catch (error) {
      throw new MediaError('INVALID', error instanceof Error ? error.message : 'Invalid media.');
    }
    const existing = await this.dependencies.repository.findUploadByIdempotencyKey(
      familyId,
      input.idempotencyKey,
    );
    if (existing) return { upload: existing };

    const connection = await this.connection(familyId);
    const objectKey = `${familyId}/${this.objectKeyFactory()}`;
    let upload: MediaUploadSessionRecord;
    try {
      upload = await this.dependencies.repository.createUpload({
        familyId,
        idempotencyKey: input.idempotencyKey,
        type: input.type,
        objectKey,
        mimeType: input.mimeType,
        checksum: input.checksum,
        sizeBytes: input.sizeBytes,
        ...(input.duration === undefined ? {} : { duration: input.duration }),
      });
    } catch {
      const raced = await this.dependencies.repository.findUploadByIdempotencyKey(
        familyId,
        input.idempotencyKey,
      );
      if (raced) return { upload: raced };
      throw new MediaError('CONFLICT', 'The media upload could not be initialized.');
    }
    try {
      const initialized = await this.dependencies.cos.initializeMultipart({
        connection,
        objectKey,
        mimeType: input.mimeType,
      });
      return {
        upload: await this.dependencies.repository.startUpload(
          familyId,
          upload.id,
          initialized.uploadId,
        ),
      };
    } catch {
      await this.dependencies.repository.markFailed(familyId, upload.id, 'COS_INITIALIZE_FAILED');
      throw new MediaError('UNAVAILABLE', 'Media storage is temporarily unavailable.');
    }
  }

  async authorizePart(input: Parameters<MediaOperations['authorizePart']>[0]) {
    const familyId = await this.requireFamily(input.sessionToken);
    if (
      !Number.isSafeInteger(input.partNumber) ||
      input.partNumber < 1 ||
      input.partNumber > 10000
    ) {
      throw new MediaError('INVALID', 'Invalid upload part number.');
    }
    const upload = await this.requireUpload(familyId, input.uploadId);
    if (upload.status !== 'UPLOADING' || !upload.uploadId) {
      throw new MediaError('CONFLICT', 'The upload is not accepting parts.');
    }
    return this.dependencies.cos.authorizePart({
      connection: await this.connection(familyId),
      objectKey: upload.asset.objectKey,
      uploadId: upload.uploadId,
      partNumber: input.partNumber,
      expiresInSeconds: 900,
    });
  }

  async confirmPart(input: Parameters<MediaOperations['confirmPart']>[0]) {
    const familyId = await this.requireFamily(input.sessionToken);
    if (
      !Number.isSafeInteger(input.partNumber) ||
      input.partNumber < 1 ||
      input.partNumber > 10000 ||
      !input.etag.trim() ||
      !/^[a-f0-9]{64}$/.test(input.checksum) ||
      !Number.isSafeInteger(input.sizeBytes) ||
      input.sizeBytes < 1
    ) {
      throw new MediaError('INVALID', 'Invalid upload part confirmation.');
    }
    const upload = await this.requireUpload(familyId, input.uploadId);
    if (upload.status !== 'UPLOADING')
      throw new MediaError('CONFLICT', 'The upload is not active.');
    const previous = upload.parts.find(({ partNumber }) => partNumber === input.partNumber);
    if (previous) {
      if (
        previous.etag !== input.etag ||
        previous.checksum !== input.checksum ||
        previous.sizeBytes !== input.sizeBytes
      ) {
        throw new MediaError('CONFLICT', 'The upload part was already confirmed differently.');
      }
      return { upload };
    }
    try {
      return {
        upload: await this.dependencies.repository.confirmPart({
          ...input,
          familyId,
          sessionId: upload.id,
        }),
      };
    } catch {
      throw new MediaError('CONFLICT', 'The upload part confirmation conflicts with stored data.');
    }
  }

  async complete(input: Parameters<MediaOperations['complete']>[0]) {
    const familyId = await this.requireFamily(input.sessionToken);
    const upload = await this.requireUpload(familyId, input.uploadId);
    if (upload.status === 'READY') return { upload };
    if (upload.status !== 'UPLOADING' || !upload.uploadId || upload.parts.length === 0) {
      throw new MediaError('CONFLICT', 'The upload cannot be completed.');
    }
    if (upload.parts.reduce((sum, part) => sum + part.sizeBytes, 0) !== upload.asset.sizeBytes) {
      throw new MediaError('INVALID', 'Upload part sizes do not match the declared object size.');
    }
    const connection = await this.connection(familyId);
    try {
      await this.dependencies.cos.completeMultipart({
        connection,
        objectKey: upload.asset.objectKey,
        uploadId: upload.uploadId,
        parts: upload.parts,
      });
      const inspected = input.objectBytes
        ? {
            bytes: input.objectBytes,
            mimeType: input.objectMimeType ?? upload.asset.mimeType,
            sizeBytes: input.objectBytes.length,
          }
        : await this.dependencies.cos.inspectObject({
            connection,
            objectKey: upload.asset.objectKey,
            maximumBytes: MAX_VIDEO_BYTES,
          });
      if (
        inspected.mimeType.split(';', 1)[0] !== upload.asset.mimeType ||
        inspected.sizeBytes !== upload.asset.sizeBytes ||
        inspected.bytes.length !== inspected.sizeBytes ||
        !hasExpectedSignature(upload.asset.mimeType, inspected.bytes) ||
        sha256(inspected.bytes) !== upload.asset.checksum ||
        (inspected.checksum !== undefined && inspected.checksum !== upload.asset.checksum)
      ) {
        throw new MediaError('INVALID', 'Uploaded object verification failed.');
      }
      return { upload: await this.dependencies.repository.markReady(familyId, upload.id) };
    } catch (error) {
      await this.dependencies.repository.markFailed(
        familyId,
        upload.id,
        'OBJECT_VERIFICATION_FAILED',
      );
      if (error instanceof MediaError) throw error;
      throw new MediaError('UNAVAILABLE', 'Media storage is temporarily unavailable.');
    }
  }

  async retry(input: Parameters<MediaOperations['retry']>[0]) {
    const familyId = await this.requireFamily(input.sessionToken);
    const upload = await this.requireUpload(familyId, input.uploadId);
    if (upload.status !== 'FAILED')
      throw new MediaError('CONFLICT', 'Only failed uploads can retry.');
    try {
      const initialized = await this.dependencies.cos.initializeMultipart({
        connection: await this.connection(familyId),
        objectKey: upload.asset.objectKey,
        mimeType: upload.asset.mimeType,
      });
      return {
        upload: await this.dependencies.repository.restart(
          familyId,
          upload.id,
          initialized.uploadId,
        ),
      };
    } catch {
      throw new MediaError('UNAVAILABLE', 'Media storage is temporarily unavailable.');
    }
  }

  async accessUrl(input: Parameters<MediaOperations['accessUrl']>[0]) {
    const familyId = await this.requireFamily(input.sessionToken);
    const asset = await this.dependencies.repository.findReadyAsset(familyId, input.mediaId);
    if (!asset) throw new MediaError('NOT_FOUND', 'The media asset was not found.');
    return this.dependencies.cos.createReadUrl({
      connection: await this.connection(familyId),
      objectKey: asset.objectKey,
      expiresInSeconds: 900,
    });
  }

  private async requireFamily(token?: string): Promise<string> {
    const session = token ? await this.dependencies.sessions.read(token) : null;
    if (!session) throw new MediaError('UNAUTHORIZED', 'An active session is required.');
    return session.familyId;
  }

  private async requireUpload(familyId: string, id: string): Promise<MediaUploadSessionRecord> {
    const upload = await this.dependencies.repository.findUpload(familyId, id);
    if (!upload) throw new MediaError('NOT_FOUND', 'The media upload was not found.');
    return upload;
  }

  private async connection(familyId: string) {
    try {
      return await this.dependencies.connections.get(familyId);
    } catch {
      throw new MediaError('UNAVAILABLE', 'Media storage is not configured.');
    }
  }
}
