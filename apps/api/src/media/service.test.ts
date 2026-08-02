import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { MediaError, MediaService } from './service.js';
import type {
  CosClientPort,
  CosObjectVerification,
  MediaAssetRecord,
  MediaRepository,
  MediaUploadSessionRecord,
} from './types.js';
import { hasExpectedSignature, MAX_VIDEO_BYTES } from './validation.js';

const familyId = '11111111-1111-4111-8111-111111111111';

function checksum(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

class MemoryMediaRepository implements MediaRepository {
  readonly uploads = new Map<string, MediaUploadSessionRecord>();
  readonly keys = new Map<string, string>();

  async findUploadByIdempotencyKey(scope: string, key: string) {
    const id = this.keys.get(`${scope}:${key}`);
    return id ? (this.uploads.get(id) ?? null) : null;
  }

  async createUpload(input: Parameters<MediaRepository['createUpload']>[0]) {
    const id = `upload-${this.uploads.size + 1}`;
    const upload: MediaUploadSessionRecord = {
      id,
      familyId: input.familyId,
      idempotencyKey: input.idempotencyKey,
      uploadId: null,
      status: 'PENDING',
      failureCode: null,
      asset: {
        id: `asset-${this.uploads.size + 1}`,
        familyId: input.familyId,
        type: input.type,
        objectKey: input.objectKey,
        mimeType: input.mimeType,
        checksum: input.checksum,
        sizeBytes: input.sizeBytes,
        duration: input.duration ?? null,
        uploadStatus: 'PENDING',
      },
      parts: [],
    };
    this.uploads.set(id, upload);
    this.keys.set(`${input.familyId}:${input.idempotencyKey}`, id);
    return upload;
  }

  async findUpload(scope: string, id: string) {
    const upload = this.uploads.get(id);
    return upload?.familyId === scope ? upload : null;
  }

  async startUpload(scope: string, id: string, uploadId: string) {
    return this.patch(scope, id, { uploadId, status: 'UPLOADING', failureCode: null });
  }

  async confirmPart(input: Parameters<MediaRepository['confirmPart']>[0]) {
    const upload = await this.required(input.familyId, input.sessionId);
    return this.patch(input.familyId, input.sessionId, {
      parts: [
        ...upload.parts,
        {
          partNumber: input.partNumber,
          etag: input.etag,
          checksum: input.checksum,
          sizeBytes: input.sizeBytes,
        },
      ],
    });
  }

  async markReady(scope: string, id: string) {
    const upload = await this.required(scope, id);
    return this.patch(scope, id, {
      status: 'READY',
      failureCode: null,
      asset: { ...upload.asset, uploadStatus: 'READY' },
    });
  }

  async markFailed(scope: string, id: string, failureCode: string) {
    const upload = await this.required(scope, id);
    this.uploads.set(id, {
      ...upload,
      status: 'FAILED',
      failureCode,
      asset: { ...upload.asset, uploadStatus: 'FAILED' },
    });
  }

  async restart(scope: string, id: string, uploadId: string) {
    const upload = await this.required(scope, id);
    return this.patch(scope, id, {
      uploadId,
      status: 'UPLOADING',
      failureCode: null,
      parts: [],
      asset: { ...upload.asset, uploadStatus: 'UPLOADING' },
    });
  }

  async findReadyAsset(scope: string, mediaId: string): Promise<MediaAssetRecord | null> {
    for (const upload of this.uploads.values()) {
      if (
        upload.familyId === scope &&
        upload.asset.id === mediaId &&
        upload.asset.uploadStatus === 'READY'
      ) {
        return upload.asset;
      }
    }
    return null;
  }

  private async required(scope: string, id: string) {
    const upload = await this.findUpload(scope, id);
    if (!upload) throw new Error('missing upload');
    return upload;
  }

  private async patch(scope: string, id: string, patch: Partial<MediaUploadSessionRecord>) {
    const upload = await this.required(scope, id);
    const updated = { ...upload, ...patch };
    this.uploads.set(id, updated);
    return updated;
  }
}

class MemoryCos implements CosClientPort {
  initialized = 0;

  async initializeMultipart() {
    this.initialized += 1;
    return { uploadId: `cos-${this.initialized}` };
  }

  async authorizePart() {
    return { url: 'https://example.test/upload', expiresAt: new Date('2026-07-31T00:15:00Z') };
  }

  async completeMultipart() {}

  async abortMultipart() {}

  async deleteObject() {}

  async inspectObject(): Promise<CosObjectVerification> {
    throw new Error('test supplies object bytes');
  }

  async createReadUrl() {
    return { url: 'https://example.test/read', expiresAt: new Date('2026-07-31T00:15:00Z') };
  }
}

function fixture() {
  const repository = new MemoryMediaRepository();
  const cos = new MemoryCos();
  const service = new MediaService({
    repository,
    sessions: {
      async create() {
        return 'token';
      },
      async read(token: string) {
        return token === 'token'
          ? {
              subjectId: 'child',
              familyId,
              role: 'child' as const,
              issuedAt: '2026-07-31T00:00:00Z',
            }
          : null;
      },
      async revoke() {},
      async revokeSubject() {},
    },
    connections: {
      async get() {
        return { bucket: 'bucket-123', region: 'ap-test', secretId: 'id', secretKey: 'secret' };
      },
    },
    cos,
    objectKeyFactory: () => 'random-object',
  });
  return { repository, cos, service };
}

describe('MediaService', () => {
  it('validates declarations including audio and video boundaries', async () => {
    const { service } = fixture();
    const base = {
      sessionToken: 'token',
      idempotencyKey: 'video',
      type: 'VIDEO' as const,
      mimeType: 'video/mp4',
      checksum: 'a'.repeat(64),
      sizeBytes: MAX_VIDEO_BYTES,
      duration: 180,
    };
    await expect(service.initialize(base)).resolves.toBeDefined();
    await expect(
      service.initialize({ ...base, idempotencyKey: 'large', sizeBytes: MAX_VIDEO_BYTES + 1 }),
    ).rejects.toBeInstanceOf(MediaError);
    await expect(
      service.initialize({ ...base, idempotencyKey: 'long', duration: 181 }),
    ).rejects.toBeInstanceOf(MediaError);
    await expect(
      service.initialize({
        ...base,
        idempotencyKey: 'audio',
        type: 'AUDIO',
        mimeType: 'audio/mpeg',
      }),
    ).rejects.toBeInstanceOf(MediaError);
  });

  it('makes initialization and identical part confirmation idempotent', async () => {
    const bytes = Buffer.from('ffd8ff00', 'hex');
    const { cos, service } = fixture();
    const input = {
      sessionToken: 'token',
      idempotencyKey: 'image',
      type: 'IMAGE' as const,
      mimeType: 'image/jpeg',
      checksum: checksum(bytes),
      sizeBytes: bytes.length,
    };
    const first = await service.initialize(input);
    const duplicate = await service.initialize(input);
    expect(duplicate.upload.id).toBe(first.upload.id);
    expect(cos.initialized).toBe(1);
    const part = {
      sessionToken: 'token',
      uploadId: first.upload.id,
      partNumber: 1,
      etag: 'etag-1',
      checksum: checksum(bytes),
      sizeBytes: bytes.length,
    };
    await service.confirmPart(part);
    await expect(service.confirmPart(part)).resolves.toBeDefined();
    await expect(service.confirmPart({ ...part, etag: 'different' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('verifies signature and checksum, marks failure, and restarts cleanly', async () => {
    const bytes = Buffer.from('ffd8ff00', 'hex');
    const { repository, service } = fixture();
    const initialized = await service.initialize({
      sessionToken: 'token',
      idempotencyKey: 'recover',
      type: 'IMAGE',
      mimeType: 'image/jpeg',
      checksum: checksum(bytes),
      sizeBytes: bytes.length,
    });
    await service.confirmPart({
      sessionToken: 'token',
      uploadId: initialized.upload.id,
      partNumber: 1,
      etag: 'etag',
      checksum: checksum(bytes),
      sizeBytes: bytes.length,
    });
    await expect(
      service.complete({
        sessionToken: 'token',
        uploadId: initialized.upload.id,
        objectBytes: Buffer.from('89504e47', 'hex'),
        objectMimeType: 'image/jpeg',
      }),
    ).rejects.toMatchObject({ code: 'INVALID' });
    expect(repository.uploads.get(initialized.upload.id)?.status).toBe('FAILED');
    const retried = await service.retry({ sessionToken: 'token', uploadId: initialized.upload.id });
    expect(retried.upload.status).toBe('UPLOADING');
    expect(retried.upload.parts).toEqual([]);
  });

  it('accepts supported file signatures and rejects MIME mismatches', () => {
    expect(hasExpectedSignature('image/jpeg', Buffer.from('ffd8ff', 'hex'))).toBe(true);
    expect(hasExpectedSignature('image/png', Buffer.from('89504e470d0a1a0a', 'hex'))).toBe(true);
    expect(hasExpectedSignature('image/webp', Buffer.from('RIFF0000WEBP'))).toBe(true);
    expect(hasExpectedSignature('video/mp4', Buffer.from('000000006674797069736f6d', 'hex'))).toBe(
      true,
    );
    expect(hasExpectedSignature('image/png', Buffer.from('ffd8ff', 'hex'))).toBe(false);
  });

  it('keeps ready media access family scoped', async () => {
    const bytes = Buffer.from('ffd8ff00', 'hex');
    const { repository, service } = fixture();
    const initialized = await service.initialize({
      sessionToken: 'token',
      idempotencyKey: 'ready',
      type: 'IMAGE',
      mimeType: 'image/jpeg',
      checksum: checksum(bytes),
      sizeBytes: bytes.length,
    });
    await repository.markReady(familyId, initialized.upload.id);
    await expect(
      service.accessUrl({ sessionToken: 'token', mediaId: initialized.upload.asset.id }),
    ).resolves.toMatchObject({ url: 'https://example.test/read' });
    await expect(
      repository.findReadyAsset('other-family', initialized.upload.asset.id),
    ).resolves.toBeNull();
  });
});
