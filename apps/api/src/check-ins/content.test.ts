import { describe, expect, it } from 'vitest';

import type { MediaAssetRecord } from '../media/types.js';
import { MAX_VIDEO_BYTES } from '../media/validation.js';
import { validateSubmissionContent } from './content.js';

function asset(
  id: string,
  type: 'IMAGE' | 'VIDEO' | 'AUDIO',
  overrides: Partial<MediaAssetRecord> = {},
): MediaAssetRecord {
  return {
    id,
    familyId: 'family-1',
    type,
    objectKey: id,
    mimeType: type === 'IMAGE' ? 'image/jpeg' : type === 'VIDEO' ? 'video/mp4' : 'audio/mpeg',
    checksum: 'a'.repeat(64),
    sizeBytes: 1024,
    duration: type === 'VIDEO' ? 30 : null,
    uploadStatus: 'READY',
    ...overrides,
  };
}

describe('validateSubmissionContent', () => {
  it('enforces TICK and TEXT content shapes', () => {
    expect(validateSubmissionContent('TICK', undefined, [])).toEqual({ mediaIds: [] });
    expect(validateSubmissionContent('TEXT', '  finished  ', [])).toEqual({
      text: 'finished',
      mediaIds: [],
    });
    expect(() => validateSubmissionContent('TICK', 'text', [])).toThrow();
    expect(() => validateSubmissionContent('TEXT', ' ', [])).toThrow();
    expect(() => validateSubmissionContent('TEXT', 'text', [asset('image', 'IMAGE')])).toThrow();
  });

  it('accepts nine photos and rejects ten', () => {
    const nine = Array.from({ length: 9 }, (_, index) => asset(`image-${index}`, 'IMAGE'));
    expect(validateSubmissionContent('PHOTO', undefined, nine).mediaIds).toHaveLength(9);
    expect(() =>
      validateSubmissionContent('PHOTO', undefined, [...nine, asset('image-10', 'IMAGE')]),
    ).toThrow();
  });

  it('accepts the exact video duration and size boundaries', () => {
    const boundary = asset('video', 'VIDEO', { duration: 180, sizeBytes: MAX_VIDEO_BYTES });
    expect(validateSubmissionContent('VIDEO', undefined, [boundary]).mediaIds).toEqual(['video']);
    expect(() =>
      validateSubmissionContent('VIDEO', undefined, [asset('long', 'VIDEO', { duration: 181 })]),
    ).toThrow();
    expect(() =>
      validateSubmissionContent('VIDEO', undefined, [
        asset('large', 'VIDEO', { sizeBytes: MAX_VIDEO_BYTES + 1 }),
      ]),
    ).toThrow();
  });

  it('allows mixed text, up to nine images and one video', () => {
    const media = [
      ...Array.from({ length: 9 }, (_, index) => asset(`image-${index}`, 'IMAGE')),
      asset('video', 'VIDEO'),
    ];
    expect(validateSubmissionContent('MIXED', 'notes', media).mediaIds).toHaveLength(10);
    expect(validateSubmissionContent('MIXED', 'notes', []).text).toBe('notes');
    expect(() => validateSubmissionContent('MIXED', undefined, [])).toThrow();
    expect(() =>
      validateSubmissionContent('MIXED', undefined, [asset('audio', 'AUDIO')]),
    ).toThrow();
  });

  it('rejects unavailable and duplicate media', () => {
    expect(() =>
      validateSubmissionContent('PHOTO', undefined, [
        asset('pending', 'IMAGE', { uploadStatus: 'UPLOADING' }),
      ]),
    ).toThrow();
    expect(() =>
      validateSubmissionContent('PHOTO', undefined, [
        asset('same', 'IMAGE'),
        asset('same', 'IMAGE'),
      ]),
    ).toThrow();
  });
});
