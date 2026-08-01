import type { MediaType, MediaUploadStatus } from '@prisma/client';

import type { SessionStore } from '../family-auth/types.js';

export type MediaAssetRecord = Readonly<{
  id: string;
  familyId: string;
  type: MediaType;
  objectKey: string;
  mimeType: string;
  checksum: string;
  sizeBytes: number;
  duration: number | null;
  uploadStatus: MediaUploadStatus;
}>;

export type MediaUploadPartRecord = Readonly<{
  partNumber: number;
  etag: string;
  checksum: string;
  sizeBytes: number;
}>;

export type MediaUploadSessionRecord = Readonly<{
  id: string;
  familyId: string;
  idempotencyKey: string;
  uploadId: string | null;
  status: MediaUploadStatus;
  failureCode: string | null;
  asset: MediaAssetRecord;
  parts: readonly MediaUploadPartRecord[];
}>;

export type CosConnection = Readonly<{
  bucket: string;
  region: string;
  accessDomain?: string;
  secretId: string;
  secretKey: string;
}>;

export type CosObjectVerification = Readonly<{
  bytes: Buffer;
  mimeType: string;
  sizeBytes: number;
  checksum?: string;
}>;

export type CosClientPort = {
  initializeMultipart(input: {
    connection: CosConnection;
    objectKey: string;
    mimeType: string;
  }): Promise<{ uploadId: string }>;
  authorizePart(input: {
    connection: CosConnection;
    objectKey: string;
    uploadId: string;
    partNumber: number;
    expiresInSeconds: number;
  }): Promise<{ url: string; expiresAt: Date }>;
  completeMultipart(input: {
    connection: CosConnection;
    objectKey: string;
    uploadId: string;
    parts: readonly MediaUploadPartRecord[];
  }): Promise<void>;
  abortMultipart(input: {
    connection: CosConnection;
    objectKey: string;
    uploadId: string;
  }): Promise<void>;
  deleteObject(input: { connection: CosConnection; objectKey: string }): Promise<void>;
  inspectObject(input: {
    connection: CosConnection;
    objectKey: string;
    maximumBytes: number;
  }): Promise<CosObjectVerification>;
  createReadUrl(input: {
    connection: CosConnection;
    objectKey: string;
    expiresInSeconds: number;
  }): Promise<{ url: string; expiresAt: Date }>;
};

export type CosConnectionProvider = {
  get(familyId: string): Promise<CosConnection>;
};

export type MediaRepository = {
  findUploadByIdempotencyKey(
    familyId: string,
    idempotencyKey: string,
  ): Promise<MediaUploadSessionRecord | null>;
  createUpload(input: {
    familyId: string;
    idempotencyKey: string;
    type: MediaType;
    objectKey: string;
    mimeType: string;
    checksum: string;
    sizeBytes: number;
    duration?: number;
  }): Promise<MediaUploadSessionRecord>;
  findUpload(familyId: string, uploadId: string): Promise<MediaUploadSessionRecord | null>;
  startUpload(
    familyId: string,
    sessionId: string,
    cosUploadId: string,
  ): Promise<MediaUploadSessionRecord>;
  confirmPart(input: {
    familyId: string;
    sessionId: string;
    partNumber: number;
    etag: string;
    checksum: string;
    sizeBytes: number;
  }): Promise<MediaUploadSessionRecord>;
  markReady(familyId: string, sessionId: string): Promise<MediaUploadSessionRecord>;
  markFailed(familyId: string, sessionId: string, failureCode: string): Promise<void>;
  restart(
    familyId: string,
    sessionId: string,
    cosUploadId: string,
  ): Promise<MediaUploadSessionRecord>;
  findReadyAsset(familyId: string, mediaId: string): Promise<MediaAssetRecord | null>;
};

export type MediaOperations = {
  initialize(input: {
    sessionToken?: string;
    idempotencyKey: string;
    type: MediaType;
    mimeType: string;
    checksum: string;
    sizeBytes: number;
    duration?: number;
  }): Promise<{ upload: MediaUploadSessionRecord }>;
  authorizePart(input: {
    sessionToken?: string;
    uploadId: string;
    partNumber: number;
  }): Promise<{ url: string; expiresAt: Date }>;
  confirmPart(input: {
    sessionToken?: string;
    uploadId: string;
    partNumber: number;
    etag: string;
    checksum: string;
    sizeBytes: number;
  }): Promise<{ upload: MediaUploadSessionRecord }>;
  complete(input: {
    sessionToken?: string;
    uploadId: string;
    objectBytes?: Buffer;
    objectMimeType?: string;
  }): Promise<{ upload: MediaUploadSessionRecord }>;
  retry(input: {
    sessionToken?: string;
    uploadId: string;
  }): Promise<{ upload: MediaUploadSessionRecord }>;
  accessUrl(input: {
    sessionToken?: string;
    mediaId: string;
  }): Promise<{ url: string; expiresAt: Date }>;
};

export type MediaDependencies = Readonly<{
  repository: MediaRepository;
  sessions: SessionStore;
  connections: CosConnectionProvider;
  cos: CosClientPort;
  now?: () => Date;
  objectKeyFactory?: () => string;
}>;
