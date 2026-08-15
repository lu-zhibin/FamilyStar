import { childApi, createIdempotencyKey, normalizedMediaMimeType } from './child-portal';

type MediaUpload = {
  id: string;
  media_id: string;
  status: 'PENDING' | 'UPLOADING' | 'READY' | 'FAILED';
  failure_code: string | null;
  mime_type: string;
  media_type: 'IMAGE' | 'VIDEO' | 'AUDIO';
  size_bytes: number;
  duration: number | null;
  parts: Array<{
    part_number: number;
    etag: string;
    checksum: string;
    size_bytes: number;
  }>;
};

export type UploadApi = <T>(path: string, init?: RequestInit) => Promise<T>;
export type RawUpload = (url: string, init: RequestInit) => Promise<Response>;

type UploadOptions = Readonly<{
  api?: UploadApi;
  rawUpload?: RawUpload;
  idempotencyKey?: string;
  readDuration?: (file: File) => Promise<number>;
}>;

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('');
}

const sha256Constants = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotateRight(value: number, shift: number): number {
  return (value >>> shift) | (value << (32 - shift));
}

function sha256WithoutWebCrypto(input: ArrayBuffer): string {
  const bytes = new Uint8Array(input);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const paddedView = new DataView(padded.buffer);
  paddedView.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  paddedView.setUint32(paddedLength - 4, bitLength >>> 0);

  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = paddedView.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 64; index += 1) {
      const previous15 = words[index - 15]!;
      const previous2 = words[index - 2]!;
      const sigma0 = rotateRight(previous15, 7) ^ rotateRight(previous15, 18) ^ (previous15 >>> 3);
      const sigma1 = rotateRight(previous2, 17) ^ rotateRight(previous2, 19) ^ (previous2 >>> 10);
      words[index] = (words[index - 16]! + sigma0 + words[index - 7]! + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e!, 6) ^ rotateRight(e!, 11) ^ rotateRight(e!, 25);
      const choice = (e! & f!) ^ (~e! & g!);
      const temporary1 = (h! + sum1 + choice + sha256Constants[index]! + words[index]!) >>> 0;
      const sum0 = rotateRight(a!, 2) ^ rotateRight(a!, 13) ^ rotateRight(a!, 22);
      const majority = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d! + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    hash[0] = (hash[0]! + a!) >>> 0;
    hash[1] = (hash[1]! + b!) >>> 0;
    hash[2] = (hash[2]! + c!) >>> 0;
    hash[3] = (hash[3]! + d!) >>> 0;
    hash[4] = (hash[4]! + e!) >>> 0;
    hash[5] = (hash[5]! + f!) >>> 0;
    hash[6] = (hash[6]! + g!) >>> 0;
    hash[7] = (hash[7]! + h!) >>> 0;
  }

  const output = new ArrayBuffer(32);
  const outputView = new DataView(output);
  hash.forEach((value, index) => outputView.setUint32(index * 4, value));
  return bytesToHex(output);
}

export async function sha256(bytes: ArrayBuffer): Promise<string> {
  if (globalThis.crypto?.subtle) {
    return bytesToHex(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  }
  return sha256WithoutWebCrypto(bytes);
}

export function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const duration = video.duration;
      cleanup();
      if (Number.isFinite(duration)) resolve(duration);
      else reject(new Error('无法读取视频时长。'));
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('无法读取视频信息。'));
    };
    video.src = objectUrl;
  });
}

function mediaType(mimeType: string): 'IMAGE' | 'VIDEO' {
  if (['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) return 'IMAGE';
  if (['video/mp4', 'video/quicktime', 'video/x-m4v'].includes(mimeType)) return 'VIDEO';
  throw new Error('只支持 JPG、PNG、WebP 图片和 MP4、MOV、M4V 视频。');
}

async function transferSinglePart(
  upload: MediaUpload,
  bytes: ArrayBuffer,
  checksum: string,
  api: UploadApi,
  rawUpload: RawUpload,
): Promise<MediaUpload> {
  const existingPart = upload.parts.find((part) => part.part_number === 1);
  if (existingPart?.checksum === checksum && existingPart.size_bytes === bytes.byteLength) {
    return upload;
  }

  const authorization = await api<{ url: string; expires_at: string }>(
    `/media/uploads/${upload.id}/parts/1/authorize`,
    { method: 'POST', body: JSON.stringify({}) },
  );
  let response: Response;
  try {
    response = await rawUpload(authorization.url, { method: 'PUT', body: bytes });
  } catch {
    throw new Error('无法连接对象存储，请检查 Bucket CORS 是否允许当前站点使用 PUT。');
  }
  if (!response.ok) throw new Error(`媒体上传失败（HTTP ${response.status}）。`);
  const etag = response.headers.get('etag');
  if (!etag) throw new Error('对象存储未返回 ETag，请检查 Bucket CORS 配置。');

  const confirmed = await api<{ upload: MediaUpload }>(`/media/uploads/${upload.id}/parts/1`, {
    method: 'PUT',
    body: JSON.stringify({ etag, checksum, size_bytes: bytes.byteLength }),
  });
  return confirmed.upload;
}

async function finishUpload(
  upload: MediaUpload,
  bytes: ArrayBuffer,
  checksum: string,
  api: UploadApi,
  rawUpload: RawUpload,
): Promise<MediaUpload> {
  if (upload.status === 'READY') return upload;
  const active =
    upload.status === 'FAILED'
      ? (
          await api<{ upload: MediaUpload }>(`/media/uploads/${upload.id}/retry`, {
            method: 'POST',
            body: JSON.stringify({}),
          })
        ).upload
      : upload;
  await transferSinglePart(active, bytes, checksum, api, rawUpload);
  return (
    await api<{ upload: MediaUpload }>(`/media/uploads/${active.id}/complete`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
  ).upload;
}

export async function uploadMediaFile(file: File, options: UploadOptions = {}): Promise<string> {
  const api = options.api ?? childApi;
  const rawUpload = options.rawUpload ?? fetch;
  const bytes = await file.arrayBuffer();
  const checksum = await sha256(bytes);
  const mimeType = normalizedMediaMimeType(file);
  const type = mediaType(mimeType);
  const duration =
    type === 'VIDEO' ? await (options.readDuration ?? readVideoDuration)(file) : undefined;
  if (duration !== undefined && duration > 180) throw new Error('视频时长不能超过 3 分钟。');
  const idempotencyKey = options.idempotencyKey ?? createIdempotencyKey('check-in-media');
  const request = {
    type,
    mime_type: mimeType,
    checksum,
    size_bytes: bytes.byteLength,
    ...(duration === undefined ? {} : { duration }),
  };

  let upload = (
    await api<{ upload: MediaUpload }>('/media/uploads', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(request),
    })
  ).upload;
  try {
    upload = await finishUpload(upload, bytes, checksum, api, rawUpload);
  } catch (error) {
    upload = (
      await api<{ upload: MediaUpload }>('/media/uploads', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(request),
      })
    ).upload;
    if (upload.status !== 'READY') {
      upload = await finishUpload(upload, bytes, checksum, api, rawUpload);
    }
    if (upload.status !== 'READY') throw error;
  }
  if (upload.status !== 'READY') throw new Error('媒体校验尚未完成，请稍后重试。');
  return upload.media_id;
}
