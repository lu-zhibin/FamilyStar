import { afterEach, describe, expect, it, vi } from 'vitest';

import { sha256, uploadMediaFile, type UploadApi, type RawUpload } from './media-upload';

function file(content: string, type = 'image/png', name = 'proof.png'): File {
  return new File([content], name, { type, lastModified: 1 });
}

function upload(status: 'UPLOADING' | 'READY' | 'FAILED', parts: unknown[] = []) {
  return {
    id: 'upload-1',
    media_id: 'media-1',
    status,
    failure_code: status === 'FAILED' ? 'OBJECT_VERIFICATION_FAILED' : null,
    mime_type: 'image/png',
    media_type: 'IMAGE' as const,
    size_bytes: 5,
    duration: null,
    parts,
  };
}

describe('media upload orchestration', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('hashes bytes as lowercase SHA-256', async () => {
    expect(await sha256(new TextEncoder().encode('hello').buffer)).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('hashes bytes when SubtleCrypto is unavailable on HTTP origins', async () => {
    vi.stubGlobal('crypto', {});

    expect(await sha256(new TextEncoder().encode('hello').buffer)).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('initializes, uploads, confirms, and completes a single part', async () => {
    const calls: string[] = [];
    const api: UploadApi = async <T>(path: string) => {
      calls.push(path);
      const value = path.endsWith('/authorize')
        ? { url: 'https://cos.example/upload', expires_at: '2026-08-03T00:00:00.000Z' }
        : path.endsWith('/complete')
          ? { upload: upload('READY') }
          : { upload: upload('UPLOADING') };
      return value as T;
    };
    const rawUpload: RawUpload = vi.fn(
      async () => new Response(null, { status: 200, headers: { etag: '"part-etag"' } }),
    );

    await expect(
      uploadMediaFile(file('hello'), {
        api,
        rawUpload,
        idempotencyKey: 'media-key',
      }),
    ).resolves.toBe('media-1');
    expect(calls).toEqual([
      '/media/uploads',
      '/media/uploads/upload-1/parts/1/authorize',
      '/media/uploads/upload-1/parts/1',
      '/media/uploads/upload-1/complete',
    ]);
    expect(rawUpload).toHaveBeenCalledOnce();
  });

  it.each(['video/mp4', 'video/quicktime', 'video/x-m4v'])(
    'declares %s browser files as video uploads',
    async (mimeType) => {
      let requestBody = '';
      const api: UploadApi = async <T>(path: string, init?: RequestInit) => {
        if (path === '/media/uploads') requestBody = String(init?.body ?? '');
        return { upload: upload('READY') } as T;
      };

      await uploadMediaFile(file('video', mimeType), {
        api,
        rawUpload: vi.fn(),
        readDuration: async () => 12,
        idempotencyKey: 'video-key',
      });

      expect(JSON.parse(requestBody)).toMatchObject({
        type: 'VIDEO',
        mime_type: mimeType,
        duration: 12,
      });
    },
  );

  it('infers a QuickTime MIME type when a mobile picker returns an empty type', async () => {
    let requestBody = '';
    const api: UploadApi = async <T>(path: string, init?: RequestInit) => {
      if (path === '/media/uploads') requestBody = String(init?.body ?? '');
      return { upload: upload('READY') } as T;
    };

    await uploadMediaFile(file('video', '', '相册视频.MOV'), {
      api,
      rawUpload: vi.fn(),
      readDuration: async () => 12,
      idempotencyKey: 'mobile-video-key',
    });

    expect(JSON.parse(requestBody)).toMatchObject({
      type: 'VIDEO',
      mime_type: 'video/quicktime',
      duration: 12,
    });
  });

  it('returns an already ready idempotent upload without a COS request', async () => {
    const api: UploadApi = async <T>() => ({ upload: upload('READY') }) as T;
    const rawUpload: RawUpload = vi.fn();

    await expect(
      uploadMediaFile(file('hello'), { api, rawUpload, idempotencyKey: 'media-key' }),
    ).resolves.toBe('media-1');
    expect(rawUpload).not.toHaveBeenCalled();
  });

  it('reports a missing exposed ETag as a COS CORS configuration error', async () => {
    const api: UploadApi = async <T>(path: string) => {
      const value = path.endsWith('/authorize')
        ? { url: 'https://cos.example/upload', expires_at: '2026-08-03T00:00:00.000Z' }
        : { upload: upload('UPLOADING') };
      return value as T;
    };
    const rawUpload: RawUpload = vi.fn(async () => new Response(null, { status: 200 }));

    await expect(
      uploadMediaFile(file('hello'), { api, rawUpload, idempotencyKey: 'media-key' }),
    ).rejects.toThrow('对象存储未返回 ETag，请检查 Bucket CORS 配置。');
  });

  it('maps a browser network failure to actionable COS CORS guidance', async () => {
    const api: UploadApi = async <T>(path: string) => {
      const value = path.endsWith('/authorize')
        ? { url: 'https://cos.example/upload', expires_at: '2026-08-03T00:00:00.000Z' }
        : { upload: upload('UPLOADING') };
      return value as T;
    };
    const rawUpload: RawUpload = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      uploadMediaFile(file('hello'), { api, rawUpload, idempotencyKey: 'media-key' }),
    ).rejects.toThrow('无法连接对象存储，请检查 Bucket CORS 是否允许当前站点使用 PUT。');
  });
});
