import { createHash, createHmac } from 'node:crypto';

import type { CosClientPort, CosConnection } from './types.js';

function sha1(value: string): string {
  return createHash('sha1').update(value).digest('hex');
}

function hmacSha1(key: string, value: string): string {
  return createHmac('sha1', key).update(value).digest('hex');
}

function encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function endpoint(connection: CosConnection): string {
  return `${connection.bucket}.cos.${connection.region}.myqcloud.com`;
}

function path(objectKey: string): string {
  return `/${objectKey.split('/').map(encode).join('/')}`;
}

function sortedQuery(query: Readonly<Record<string, string>>): string {
  return Object.entries(query)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encode(key.toLowerCase())}=${encode(value)}`)
    .join('&');
}

function authorization(input: {
  connection: CosConnection;
  method: string;
  objectKey: string;
  query?: Readonly<Record<string, string>>;
  expiresInSeconds: number;
  now?: Date;
}): { authorization: string; expiresAt: Date } {
  const now = input.now ?? new Date();
  const start = Math.floor(now.getTime() / 1000) - 1;
  const end = start + input.expiresInSeconds;
  const keyTime = `${start};${end}`;
  const query = input.query ?? {};
  const queryString = sortedQuery(query);
  const queryList = Object.keys(query)
    .map((key) => key.toLowerCase())
    .sort()
    .join(';');
  const host = endpoint(input.connection);
  const httpString = `${input.method.toLowerCase()}\n${path(input.objectKey)}\n${queryString}\nhost=${host}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1(httpString)}\n`;
  const signature = hmacSha1(hmacSha1(input.connection.secretKey, keyTime), stringToSign);
  const value = [
    'q-sign-algorithm=sha1',
    `q-ak=${encode(input.connection.secretId)}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    'q-header-list=host',
    `q-url-param-list=${queryList}`,
    `q-signature=${signature}`,
  ].join('&');
  return { authorization: value, expiresAt: new Date(end * 1000) };
}

function objectUrl(connection: CosConnection, objectKey: string): string {
  return `https://${endpoint(connection)}${path(objectKey)}`;
}

async function request(input: {
  connection: CosConnection;
  method: string;
  objectKey: string;
  query?: Readonly<Record<string, string>>;
  body?: string;
  headers?: Readonly<Record<string, string>>;
  acceptedStatuses?: readonly number[];
}): Promise<Response> {
  const signed = authorization({ ...input, expiresInSeconds: 300 });
  const query = input.query ? `?${sortedQuery(input.query)}` : '';
  const response = await fetch(`${objectUrl(input.connection, input.objectKey)}${query}`, {
    method: input.method,
    headers: {
      authorization: signed.authorization,
      host: endpoint(input.connection),
      ...(input.headers ?? {}),
    },
    ...(input.body === undefined ? {} : { body: input.body }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok && !input.acceptedStatuses?.includes(response.status)) {
    throw new Error(`COS request failed with status ${response.status}.`);
  }
  return response;
}

function uploadId(xml: string): string {
  const value = /<UploadId>([^<]+)<\/UploadId>/.exec(xml)?.[1];
  if (!value) throw new Error('COS did not return an upload id.');
  return value;
}

export class TencentCosClient implements CosClientPort {
  async initializeMultipart(input: Parameters<CosClientPort['initializeMultipart']>[0]) {
    const response = await request({
      connection: input.connection,
      method: 'POST',
      objectKey: input.objectKey,
      query: { uploads: '' },
      headers: { 'content-type': input.mimeType },
    });
    return { uploadId: uploadId(await response.text()) };
  }

  async authorizePart(input: Parameters<CosClientPort['authorizePart']>[0]) {
    const query = { partNumber: String(input.partNumber), uploadId: input.uploadId };
    const signed = authorization({
      connection: input.connection,
      method: 'PUT',
      objectKey: input.objectKey,
      query,
      expiresInSeconds: input.expiresInSeconds,
    });
    return {
      url: `${objectUrl(input.connection, input.objectKey)}?${sortedQuery(query)}&${signed.authorization}`,
      expiresAt: signed.expiresAt,
    };
  }

  async completeMultipart(input: Parameters<CosClientPort['completeMultipart']>[0]) {
    const body = `<CompleteMultipartUpload>${input.parts
      .map(
        (part) =>
          `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${part.etag.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</ETag></Part>`,
      )
      .join('')}</CompleteMultipartUpload>`;
    await request({
      connection: input.connection,
      method: 'POST',
      objectKey: input.objectKey,
      query: { uploadId: input.uploadId },
      body,
      headers: { 'content-type': 'application/xml' },
    });
  }

  async abortMultipart(input: Parameters<CosClientPort['abortMultipart']>[0]) {
    await request({
      connection: input.connection,
      method: 'DELETE',
      objectKey: input.objectKey,
      acceptedStatuses: [404],
      query: { uploadId: input.uploadId },
    });
  }

  async deleteObject(input: Parameters<CosClientPort['deleteObject']>[0]) {
    await request({
      connection: input.connection,
      method: 'DELETE',
      objectKey: input.objectKey,
      acceptedStatuses: [404],
    });
  }

  async inspectObject(input: Parameters<CosClientPort['inspectObject']>[0]) {
    const response = await request({
      connection: input.connection,
      method: 'GET',
      objectKey: input.objectKey,
    });
    const declaredSize = Number(response.headers.get('content-length'));
    if (
      !Number.isSafeInteger(declaredSize) ||
      declaredSize < 1 ||
      declaredSize > input.maximumBytes
    ) {
      throw new Error('COS object size is invalid.');
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== declaredSize) throw new Error('COS object body is incomplete.');
    const checksum = response.headers.get('x-cos-meta-sha256');
    return {
      bytes,
      mimeType: response.headers.get('content-type') ?? '',
      sizeBytes: declaredSize,
      ...(checksum ? { checksum } : {}),
    };
  }

  async createReadUrl(input: Parameters<CosClientPort['createReadUrl']>[0]) {
    const signed = authorization({
      connection: input.connection,
      method: 'GET',
      objectKey: input.objectKey,
      expiresInSeconds: input.expiresInSeconds,
    });
    return {
      url: `${objectUrl(input.connection, input.objectKey)}?${signed.authorization}`,
      expiresAt: signed.expiresAt,
    };
  }
}
