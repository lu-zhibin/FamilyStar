import type { TaskCheckType } from '@prisma/client';

import type { MediaAssetRecord } from '../media/types.js';
import { MAX_VIDEO_BYTES, MAX_VIDEO_DURATION_SECONDS } from '../media/validation.js';

export class InvalidSubmissionContentError extends Error {
  constructor() {
    super('The submission content does not match the required check-in type.');
    this.name = 'InvalidSubmissionContentError';
  }
}

export function validateSubmissionContent(
  checkType: TaskCheckType,
  text: string | undefined,
  media: readonly MediaAssetRecord[],
): { text?: string; mediaIds: readonly string[] } {
  const normalizedText = text?.trim();
  const images = media.filter(({ type }) => type === 'IMAGE');
  const videos = media.filter(({ type }) => type === 'VIDEO');
  const invalidMedia = media.some(
    (asset) =>
      asset.uploadStatus !== 'READY' ||
      asset.type === 'AUDIO' ||
      (asset.type === 'VIDEO' &&
        (asset.duration === null ||
          asset.duration > MAX_VIDEO_DURATION_SECONDS ||
          asset.sizeBytes > MAX_VIDEO_BYTES)),
  );
  const duplicateMedia = new Set(media.map(({ id }) => id)).size !== media.length;
  if (invalidMedia || duplicateMedia || images.length > 9 || videos.length > 1) {
    throw new InvalidSubmissionContentError();
  }

  const hasText = Boolean(normalizedText);
  const valid =
    (checkType === 'TICK' && !hasText && media.length === 0) ||
    (checkType === 'TEXT' && hasText && media.length === 0) ||
    (checkType === 'PHOTO' &&
      !hasText &&
      images.length >= 1 &&
      images.length <= 9 &&
      videos.length === 0) ||
    (checkType === 'VIDEO' && !hasText && videos.length === 1 && images.length === 0) ||
    (checkType === 'MIXED' && (hasText || media.length > 0));
  if (!valid) throw new InvalidSubmissionContentError();
  return {
    ...(normalizedText ? { text: normalizedText } : {}),
    mediaIds: media.map(({ id }) => id),
  };
}
