import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { CheckInQueueRecord, MediaDraftRecord } from '../lib/offline-check-in-repository';
import { OfflineCheckInStatusView } from './offline-check-in-status';

function validatesCriteria(criteria: readonly string[]): string {
  return `[validatesCriteria: ${criteria.join(', ')}]`;
}

const owner = { familyId: 'family-1', childId: 'child-1' };
const baseQueue: CheckInQueueRecord = {
  id: 'queue-1',
  intentId: 'intent-1',
  createdAt: '2026-08-07T08:00:00.000Z',
  endpoint: '/check-ins',
  taskId: 'task-1',
  taskAssignmentId: 'assignment-1',
  checkDate: '2026-08-07',
  submissionType: 'TEXT',
  text: '完成阅读',
  idempotencyKey: 'key-1',
  owner,
  status: 'pending',
  attempt: { attemptCount: 0, lastAttemptAt: null, lastErrorCode: null, nextAttemptAt: null },
  failure: null,
  leaseOwner: null,
  leaseUntil: null,
};

const draft: MediaDraftRecord = {
  id: 'draft-1',
  intentId: 'media-intent',
  createdAt: '2026-08-07T08:01:00.000Z',
  taskId: 'task-1',
  taskAssignmentId: 'assignment-1',
  checkDate: '2026-08-07',
  queueId: null,
  submissionType: 'PHOTO',
  checkInIdempotencyKey: 'media-check-in-key',
  uploadIdempotencyKey: 'upload-key',
  owner,
  name: 'proof.png',
  mimeType: 'image/png',
  size: 1,
  blob: new Blob(['x'], { type: 'image/png' }),
  status: 'awaiting-confirmation',
  uploadedMediaId: null,
  failure: null,
};

describe('OfflineCheckInStatusView', () => {
  it(`renders pending, syncing, network, conflict, business, and every media state ${validatesCriteria(['Requirement 11.3', 'Requirement 11.4', 'Requirement 11.5', 'Design Property 8'])}`, () => {
    const queue: CheckInQueueRecord[] = [
      baseQueue,
      { ...baseQueue, id: 'syncing', status: 'syncing' },
      {
        ...baseQueue,
        id: 'network',
        attempt: { ...baseQueue.attempt, lastErrorCode: 'NETWORK_ERROR' },
      },
      {
        ...baseQueue,
        id: 'conflict',
        status: 'conflict',
        failure: {
          code: 'CONFLICT',
          message: '状态已变化',
          authoritativeState: { status: 'APPROVED' },
        },
      },
      {
        ...baseQueue,
        id: 'failed',
        status: 'business-failed',
        failure: { code: 'INVALID', message: '内容无效', authoritativeState: null },
      },
    ];
    const markup = renderToStaticMarkup(
      <OfflineCheckInStatusView
        queue={queue}
        drafts={[
          draft,
          { ...draft, id: 'uploading', intentId: 'uploading', status: 'uploading' },
          {
            ...draft,
            id: 'media-conflict',
            intentId: 'media-conflict',
            status: 'conflict',
            failure: { code: 'CONFLICT', message: '媒体状态冲突', authoritativeState: {} },
          },
          {
            ...draft,
            id: 'media-failed',
            intentId: 'media-failed',
            status: 'business-failed',
            failure: { code: 'INVALID', message: '媒体业务失败', authoritativeState: null },
          },
        ]}
        busyIntentId={null}
        onRetry={vi.fn()}
        onDeleteQueue={vi.fn()}
        onConfirmMedia={vi.fn()}
        onDeleteMedia={vi.fn()}
      />,
    );

    expect(markup).toContain('待同步');
    expect(markup).toContain('同步中');
    expect(markup).toContain('网络失败');
    expect(markup).toContain('冲突');
    expect(markup).toContain('业务失败');
    expect(markup).toContain('&quot;status&quot;: &quot;APPROVED&quot;');
    expect(markup).toContain('待确认媒体');
    expect(markup).toContain('媒体上传中');
    expect(markup).toContain('媒体冲突');
    expect(markup).toContain('媒体业务失败');
    expect(markup).toContain('确认上传');
    expect(markup).toContain('删除草稿');
  });
});
