import type { Prisma, PrismaClient } from '@prisma/client';

import { PrismaCredentialVaultRepository } from '../infrastructure/credentials/prisma-repository.js';
import type { CredentialVault } from '../infrastructure/credentials/vault.js';
import type {
  CosConnection,
  CosConnectionProvider,
  MediaAssetRecord,
  MediaRepository,
  MediaUploadSessionRecord,
} from './types.js';

const uploadInclude = {
  mediaAsset: true,
  parts: { where: { status: 'CONFIRMED' as const }, orderBy: { partNumber: 'asc' as const } },
} satisfies Prisma.MediaUploadSessionInclude;

type UploadWithRelations = Prisma.MediaUploadSessionGetPayload<{ include: typeof uploadInclude }>;

function safeNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new Error('Stored media size exceeds safe integer range.');
  return number;
}

function assetRecord(asset: UploadWithRelations['mediaAsset']): MediaAssetRecord {
  return {
    id: asset.id,
    familyId: asset.familyId,
    type: asset.type,
    objectKey: asset.objectKey,
    mimeType: asset.mimeType,
    checksum: asset.checksum,
    sizeBytes: safeNumber(asset.sizeBytes),
    duration: asset.duration,
    uploadStatus: asset.uploadStatus,
  };
}

function uploadRecord(upload: UploadWithRelations): MediaUploadSessionRecord {
  return {
    id: upload.id,
    familyId: upload.familyId,
    idempotencyKey: upload.idempotencyKey,
    uploadId: upload.uploadId,
    status: upload.status,
    failureCode: upload.failureCode,
    asset: assetRecord(upload.mediaAsset),
    parts: upload.parts.map((part) => ({
      partNumber: part.partNumber,
      etag: part.etag ?? '',
      checksum: part.checksum ?? '',
      sizeBytes: safeNumber(part.sizeBytes ?? 0n),
    })),
  };
}

export class PrismaMediaRepository implements MediaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findUploadByIdempotencyKey(familyId: string, idempotencyKey: string) {
    const upload = await this.prisma.mediaUploadSession.findUnique({
      where: { familyId_idempotencyKey: { familyId, idempotencyKey } },
      include: uploadInclude,
    });
    return upload ? uploadRecord(upload) : null;
  }

  async createUpload(input: Parameters<MediaRepository['createUpload']>[0]) {
    return this.prisma.$transaction(async (transaction) => {
      const asset = await transaction.mediaAsset.create({
        data: {
          familyId: input.familyId,
          type: input.type,
          objectKey: input.objectKey,
          mimeType: input.mimeType,
          checksum: input.checksum,
          sizeBytes: BigInt(input.sizeBytes),
          ...(input.duration === undefined ? {} : { duration: input.duration }),
        },
      });
      const upload = await transaction.mediaUploadSession.create({
        data: {
          familyId: input.familyId,
          idempotencyKey: input.idempotencyKey,
          mediaAssetId: asset.id,
        },
        include: uploadInclude,
      });
      return uploadRecord(upload);
    });
  }

  async findUpload(familyId: string, uploadId: string) {
    const upload = await this.prisma.mediaUploadSession.findFirst({
      where: { id: uploadId, familyId },
      include: uploadInclude,
    });
    return upload ? uploadRecord(upload) : null;
  }

  async startUpload(familyId: string, sessionId: string, cosUploadId: string) {
    return this.updateUpload(familyId, sessionId, {
      uploadId: cosUploadId,
      status: 'UPLOADING',
      failureCode: null,
      mediaAsset: { update: { uploadStatus: 'UPLOADING' } },
    });
  }

  async confirmPart(input: Parameters<MediaRepository['confirmPart']>[0]) {
    await this.prisma.mediaUploadPart.upsert({
      where: { sessionId_partNumber: { sessionId: input.sessionId, partNumber: input.partNumber } },
      create: {
        familyId: input.familyId,
        sessionId: input.sessionId,
        partNumber: input.partNumber,
        status: 'CONFIRMED',
        etag: input.etag,
        checksum: input.checksum,
        sizeBytes: BigInt(input.sizeBytes),
        confirmedAt: new Date(),
      },
      update: {},
    });
    const upload = await this.findUpload(input.familyId, input.sessionId);
    if (!upload) throw new Error('Upload disappeared during part confirmation.');
    const part = upload.parts.find(({ partNumber }) => partNumber === input.partNumber);
    if (
      !part ||
      part.etag !== input.etag ||
      part.checksum !== input.checksum ||
      part.sizeBytes !== input.sizeBytes
    ) {
      throw new Error('Upload part confirmation conflict.');
    }
    return upload;
  }

  async markReady(familyId: string, sessionId: string) {
    return this.updateUpload(familyId, sessionId, {
      status: 'READY',
      failureCode: null,
      completedAt: new Date(),
      mediaAsset: { update: { uploadStatus: 'READY' } },
    });
  }

  async markFailed(familyId: string, sessionId: string, failureCode: string): Promise<void> {
    await this.prisma.mediaUploadSession.updateMany({
      where: { id: sessionId, familyId },
      data: { status: 'FAILED', failureCode },
    });
    await this.prisma.mediaAsset.updateMany({
      where: { uploadSession: { id: sessionId, familyId } },
      data: { uploadStatus: 'FAILED' },
    });
  }

  async restart(familyId: string, sessionId: string, cosUploadId: string) {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.mediaUploadPart.deleteMany({ where: { sessionId, familyId } });
      const upload = await transaction.mediaUploadSession.update({
        where: { id: sessionId, familyId },
        data: {
          uploadId: cosUploadId,
          status: 'UPLOADING',
          failureCode: null,
          completedAt: null,
          mediaAsset: { update: { uploadStatus: 'UPLOADING' } },
        },
        include: uploadInclude,
      });
      return uploadRecord(upload);
    });
  }

  async findReadyAsset(familyId: string, mediaId: string) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: mediaId, familyId, uploadStatus: 'READY', deletedAt: null },
    });
    if (!asset) return null;
    return {
      id: asset.id,
      familyId: asset.familyId,
      type: asset.type,
      objectKey: asset.objectKey,
      mimeType: asset.mimeType,
      checksum: asset.checksum,
      sizeBytes: safeNumber(asset.sizeBytes),
      duration: asset.duration,
      uploadStatus: asset.uploadStatus,
    };
  }

  private async updateUpload(
    familyId: string,
    sessionId: string,
    data: Prisma.MediaUploadSessionUpdateInput,
  ) {
    const existing = await this.prisma.mediaUploadSession.findFirst({
      where: { id: sessionId, familyId },
      select: { id: true },
    });
    if (!existing) throw new Error('Upload not found.');
    const upload = await this.prisma.mediaUploadSession.update({
      where: { id: sessionId },
      data,
      include: uploadInclude,
    });
    return uploadRecord(upload);
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(source: Record<string, unknown>, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = source[name];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

export class PrismaCosConnectionProvider implements CosConnectionProvider {
  constructor(
    private readonly credentials: PrismaCredentialVaultRepository,
    private readonly vault: CredentialVault,
  ) {}

  async get(familyId: string): Promise<CosConnection> {
    const [stored, configured] = await Promise.all([
      this.credentials.findByFamilyAndType(familyId, 'cos'),
      this.credentials.findConfigurationByFamilyAndType(familyId, 'cos'),
    ]);
    if (!stored || !configured || configured.status !== 'VERIFIED') {
      throw new Error('COS is not configured.');
    }
    const configuration = record(configured.configuration);
    const secret = this.vault.decrypt(stored.context, stored.envelope);
    if (!configuration) throw new Error('COS configuration is invalid.');
    const bucket = stringField(configuration, 'bucket');
    const region = stringField(configuration, 'region');
    const accessDomain = stringField(configuration, 'accessDomain', 'access_domain');
    const secretId = stringField(secret, 'secretId', 'secret_id');
    const secretKey = stringField(secret, 'secretKey', 'secret_key');
    if (!bucket || !region || !secretId || !secretKey)
      throw new Error('COS configuration is invalid.');
    return { bucket, region, secretId, secretKey, ...(accessDomain ? { accessDomain } : {}) };
  }
}
