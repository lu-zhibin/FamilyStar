import { afterEach, describe, expect, it, vi } from 'vitest';

import { TencentCosClient } from './cos-client.js';
import type { CosConnection } from './types.js';

const connection: CosConnection = {
  bucket: 'family-assets-123456',
  region: 'ap-shanghai',
  secretId: 'secret-id',
  secretKey: 'private-secret-key',
};

afterEach(() => vi.unstubAllGlobals());

describe('TencentCosClient', () => {
  it('signs multipart initialization without exposing the secret key', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get('authorization');
      expect(authorization).toContain('q-ak=secret-id');
      expect(authorization).not.toContain(connection.secretKey);
      return new Response(
        '<InitiateMultipartUploadResult><UploadId>cos-1</UploadId></InitiateMultipartUploadResult>',
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new TencentCosClient().initializeMultipart({
        connection,
        objectKey: 'family/a photo.png',
        mimeType: 'image/png',
      }),
    ).resolves.toEqual({ uploadId: 'cos-1' });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('family/a%20photo.png?uploads=');
  });

  it('creates a short-lived signed part URL', async () => {
    const result = await new TencentCosClient().authorizePart({
      connection,
      objectKey: 'family/video.mp4',
      uploadId: 'cos-1',
      partNumber: 2,
      expiresInSeconds: 900,
    });

    expect(result.url).toContain('partnumber=2');
    expect(result.url).toContain('uploadid=cos-1');
    expect(result.url).toContain('q-signature=');
    expect(result.url).not.toContain(connection.secretKey);
  });

  it('completes ordered parts and inspects object metadata', async () => {
    const bytes = Buffer.from('89504e470d0a1a0a', 'hex');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(
        new Response(bytes, {
          status: 200,
          headers: {
            'content-length': String(bytes.length),
            'content-type': 'image/png',
            'x-cos-meta-sha256': 'checksum',
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const client = new TencentCosClient();

    await client.completeMultipart({
      connection,
      objectKey: 'family/image.png',
      uploadId: 'cos-1',
      parts: [{ partNumber: 1, etag: 'etag&one', checksum: 'a'.repeat(64), sizeBytes: 8 }],
    });
    const inspected = await client.inspectObject({
      connection,
      objectKey: 'family/image.png',
      maximumBytes: 100,
    });

    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain('etag&amp;one');
    expect(inspected).toMatchObject({ mimeType: 'image/png', sizeBytes: 8, checksum: 'checksum' });
    expect(inspected.bytes).toEqual(bytes);
  });

  it('aborts multipart uploads and deletes orphaned objects', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new TencentCosClient();

    await client.abortMultipart({
      connection,
      objectKey: 'family/orphan.png',
      uploadId: 'cos-orphan',
    });
    await client.deleteObject({ connection, objectKey: 'family/orphan.png' });

    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('uploadid=cos-orphan');
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('DELETE');
    expect(String(fetchMock.mock.calls[1]?.[0])).not.toContain('uploadid=');
  });

  it('treats already-removed cleanup targets as an idempotent success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    const client = new TencentCosClient();

    await expect(
      client.abortMultipart({
        connection,
        objectKey: 'family/missing.png',
        uploadId: 'missing-upload',
      }),
    ).resolves.toBeUndefined();
    await expect(
      client.deleteObject({ connection, objectKey: 'family/missing.png' }),
    ).resolves.toBeUndefined();
  });

  it('rejects failed and oversized COS responses', async () => {
    const client = new TencentCosClient();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    );
    await expect(
      client.initializeMultipart({ connection, objectKey: 'object', mimeType: 'image/png' }),
    ).rejects.toThrow('status 503');

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('large', {
            status: 200,
            headers: { 'content-length': '101', 'content-type': 'image/png' },
          }),
      ),
    );
    await expect(
      client.inspectObject({ connection, objectKey: 'object', maximumBytes: 100 }),
    ).rejects.toThrow('size is invalid');
  });
});
