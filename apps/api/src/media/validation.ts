import { createHash } from 'node:crypto';

import type { MediaType } from '@prisma/client';

export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_DURATION_SECONDS = 180;
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VIDEO_MIME_TYPES = new Set(['video/mp4']);

export function validateMediaDeclaration(input: {
  type: MediaType;
  mimeType: string;
  checksum: string;
  sizeBytes: number;
  duration?: number;
}): void {
  if (input.type === 'AUDIO') throw new Error('Audio media is not supported.');
  if (!/^[a-f0-9]{64}$/.test(input.checksum)) throw new Error('Invalid SHA-256 checksum.');
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1) {
    throw new Error('Invalid media size.');
  }
  if (input.type === 'IMAGE') {
    if (!IMAGE_MIME_TYPES.has(input.mimeType) || input.sizeBytes > MAX_IMAGE_BYTES) {
      throw new Error('Invalid image declaration.');
    }
    if (input.duration !== undefined) throw new Error('Images cannot declare a duration.');
    return;
  }
  if (
    !VIDEO_MIME_TYPES.has(input.mimeType) ||
    input.sizeBytes > MAX_VIDEO_BYTES ||
    input.duration === undefined ||
    !Number.isFinite(input.duration) ||
    input.duration < 0 ||
    input.duration > MAX_VIDEO_DURATION_SECONDS
  ) {
    throw new Error('Invalid video declaration.');
  }
}

export function hasExpectedSignature(mimeType: string, bytes: Buffer): boolean {
  if (mimeType === 'image/jpeg')
    return bytes.length >= 3 && bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
  if (mimeType === 'image/png')
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (mimeType === 'image/webp') {
    return (
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  if (mimeType === 'video/mp4') {
    return bytes.length >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp';
  }
  return false;
}

export function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
