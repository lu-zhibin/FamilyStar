import { describe, expect, it, vi } from 'vitest';

import { MediaAccessError, MediaAccessService } from './access-service.js';
import type { CosClientPort } from './types.js';

const familyId = '11111111-1111-4111-8111-111111111111';
const mediaId = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

function fixture(availableIds: readonly string[]) {
  const createReadUrl = vi.fn(
    async ({ objectKey }: Parameters<CosClientPort['createReadUrl']>[0]) => ({
      url: `https://media.test/${objectKey}`,
      expiresAt: new Date('2026-08-05T12:15:00.000Z'),
    }),
  );
  const repository = {
    findReadyAssets: vi
      .fn()
      .mockResolvedValue(availableIds.map((id) => ({ id, objectKey: `objects/${id}` }))),
  };
  const connections = {
    get: vi.fn().mockResolvedValue({
      bucket: 'bucket',
      region: 'region',
      secretId: 'id',
      secretKey: 'key',
    }),
  };
  const service = new MediaAccessService({
    repository,
    sessions: {
      create: vi.fn(),
      read: vi.fn().mockResolvedValue({
        subjectId: 'parent',
        familyId,
        role: 'parent',
        issuedAt: '2026-08-05T12:00:00.000Z',
      }),
      revoke: vi.fn(),
      revokeSubject: vi.fn(),
    },
    connections,
    cos: {
      initializeMultipart: vi.fn(),
      authorizePart: vi.fn(),
      completeMultipart: vi.fn(),
      abortMultipart: vi.fn(),
      deleteObject: vi.fn(),
      inspectObject: vi.fn(),
      createReadUrl,
    },
  });
  return { connections, createReadUrl, repository, service };
}

describe('MediaAccessService', () => {
  it.each([1, 50])('signs %s READY assets in input order with 900 second expiry', async (count) => {
    const ids = Array.from({ length: count }, (_, index) => mediaId(index + 1)).reverse();
    const { createReadUrl, repository, service } = fixture([...ids].reverse());
    const result = await service.createAccessUrls({ sessionToken: 'token', mediaIds: ids });

    expect(repository.findReadyAssets).toHaveBeenCalledWith(familyId, ids);
    expect(result.items.map(({ mediaId: id }) => id)).toEqual(ids);
    expect(createReadUrl).toHaveBeenCalledTimes(count);
    expect(createReadUrl.mock.calls.every(([input]) => input.expiresInSeconds === 900)).toBe(true);
  });

  it('rejects 51 and duplicate IDs before repository access', async () => {
    const { repository, service } = fixture([]);
    await expect(
      service.createAccessUrls({
        sessionToken: 'token',
        mediaIds: Array.from({ length: 51 }, (_, index) => mediaId(index + 1)),
      }),
    ).rejects.toMatchObject({ code: 'INVALID' } satisfies Partial<MediaAccessError>);
    await expect(
      service.createAccessUrls({ sessionToken: 'token', mediaIds: [mediaId(1), mediaId(1)] }),
    ).rejects.toMatchObject({ code: 'INVALID' } satisfies Partial<MediaAccessError>);
    expect(repository.findReadyAssets).not.toHaveBeenCalled();
  });

  it('returns all-or-nothing 404 for missing, cross-family, non-READY, or deleted assets', async () => {
    const ids = [mediaId(1), mediaId(2)];
    const { createReadUrl, service } = fixture([ids[0] as string]);
    await expect(
      service.createAccessUrls({ sessionToken: 'token', mediaIds: ids }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' } satisfies Partial<MediaAccessError>);
    expect(createReadUrl).not.toHaveBeenCalled();
  });

  it('maps missing sessions and connection details to stable errors', async () => {
    const { service } = fixture([mediaId(1)]);
    await expect(service.createAccessUrls({ mediaIds: [mediaId(1)] })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    } satisfies Partial<MediaAccessError>);
    const broken = fixture([mediaId(1)]);
    broken.connections.get.mockRejectedValue(new Error('secret configuration detail'));
    await expect(
      broken.service.createAccessUrls({ sessionToken: 'token', mediaIds: [mediaId(1)] }),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE', message: 'Media storage is not configured.' });
  });
});
