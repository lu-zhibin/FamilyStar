import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from './app.js';
import type {
  CheckInOperations,
  CheckInRecord,
  CollaborationSubmissionRecord,
} from './check-ins/types.js';
import type { MediaOperations, MediaUploadSessionRecord } from './media/types.js';

const submittedAt = new Date('2026-07-31T12:00:00.000Z');
const assignmentId = '11111111-1111-4111-8111-111111111111';
const mediaId = '22222222-2222-4222-8222-222222222222';

const upload: MediaUploadSessionRecord = {
  id: 'upload-1',
  familyId: 'family-1',
  idempotencyKey: 'upload-key',
  uploadId: 'cos-upload-1',
  status: 'UPLOADING',
  failureCode: null,
  asset: {
    id: mediaId,
    familyId: 'family-1',
    type: 'IMAGE',
    objectKey: 'family-1/random',
    mimeType: 'image/png',
    checksum: 'a'.repeat(64),
    sizeBytes: 8,
    duration: null,
    uploadStatus: 'UPLOADING',
  },
  parts: [],
};

const checkIn: CheckInRecord = {
  id: 'check-in-1',
  familyId: 'family-1',
  assignmentId,
  childId: 'child-1',
  taskId: 'task-1',
  checkDate: '2026-07-31',
  isMakeup: false,
  text: null,
  mediaIds: [],
  status: 'APPROVED',
  submittedAt,
  attempts: [],
};

const collaboration: CollaborationSubmissionRecord = {
  id: 'submission-1',
  familyId: 'family-1',
  roundId: 'round-1',
  childId: 'child-1',
  text: '完成了',
  mediaIds: [],
  status: 'PENDING',
  submittedAt,
  attempts: [],
};

function mediaOperations(): MediaOperations {
  return {
    initialize: vi.fn(async (input) => {
      expect(input).toMatchObject({
        sessionToken: 'child-session',
        idempotencyKey: 'upload-key',
        type: 'IMAGE',
        mimeType: 'image/png',
      });
      return { upload };
    }),
    async authorizePart() {
      return { url: 'https://example.test/part', expiresAt: submittedAt };
    },
    async confirmPart() {
      return { upload };
    },
    async complete() {
      return { upload: { ...upload, status: 'READY' } };
    },
    async retry() {
      return { upload };
    },
    async accessUrl() {
      return { url: 'https://example.test/read', expiresAt: submittedAt };
    },
  };
}

function checkInOperations(): CheckInOperations {
  return {
    submit: vi.fn(async (input) => {
      expect(input).toMatchObject({
        sessionToken: 'child-session',
        assignmentId,
        idempotencyKey: 'check-in-key',
        checkDate: '2026-07-31',
      });
      return { checkIn };
    }),
    async get() {
      return { checkIn };
    },
    submitCollaboration: vi.fn(async (input) => {
      expect(input).toMatchObject({
        sessionToken: 'child-session',
        roundId: 'round-1',
        idempotencyKey: 'collaboration-key',
        content: { text: '完成了', mediaIds: [] },
      });
      return { submission: collaboration };
    }),
    async listCollaboration() {
      return { submissions: [collaboration] };
    },
  };
}

describe('phase 1 check-in and media HTTP integration', () => {
  beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('maps an idempotent media upload initialization request', async () => {
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      mediaOperations: mediaOperations(),
    });
    const response = await app.request('/api/v1/media/uploads', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'familystar_session=child-session',
        'Idempotency-Key': 'upload-key',
      },
      body: JSON.stringify({
        type: 'IMAGE',
        mime_type: 'image/png',
        checksum: 'a'.repeat(64),
        size_bytes: 8,
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      data: { upload: { id: 'upload-1', media_id: mediaId, status: 'UPLOADING' } },
    });
  });

  it('keeps object verification input on the server side', async () => {
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      mediaOperations: mediaOperations(),
    });
    const response = await app.request('/api/v1/media/uploads/upload-1/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ object_bytes_base64: 'unsafe-client-input' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
  });

  it('maps solo check-in dates, content and idempotency keys', async () => {
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      checkInOperations: checkInOperations(),
    });
    const response = await app.request('/api/v1/check-ins', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'familystar_session=child-session',
        'Idempotency-Key': 'check-in-key',
      },
      body: JSON.stringify({
        task_assignment_id: assignmentId,
        check_date: '2026-07-31',
        content: { media_ids: [] },
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      data: { check_in: { id: 'check-in-1', status: 'APPROVED', is_makeup: false } },
    });
  });

  it('maps collaboration submissions and participant progress', async () => {
    const operations = checkInOperations();
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      checkInOperations: operations,
    });
    const submitted = await app.request('/api/v1/collaboration-rounds/round-1/submissions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'familystar_session=child-session',
        'Idempotency-Key': 'collaboration-key',
      },
      body: JSON.stringify({ content: { text: '完成了', media_ids: [] } }),
    });
    const listed = await app.request('/api/v1/collaboration-rounds/round-1/submissions', {
      headers: { cookie: 'familystar_session=child-session' },
    });

    expect(submitted.status).toBe(201);
    expect(await submitted.json()).toMatchObject({
      data: { submission: { child_id: 'child-1', status: 'PENDING' } },
    });
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({
      data: { submissions: [{ round_id: 'round-1', child_id: 'child-1' }] },
    });
  });
});
