import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { SubmissionReviewError } from './review-service.js';
import type {
  PendingSubmissionReviewRecord,
  SubmissionReviewOperations,
  SubmissionReviewRecord,
} from './review-types.js';

const review: SubmissionReviewRecord = {
  id: '00000000-0000-4000-8000-000000000001',
  familyId: '00000000-0000-4000-8000-000000000002',
  targetType: 'CHECK_IN',
  targetId: '00000000-0000-4000-8000-000000000003',
  attemptId: '00000000-0000-4000-8000-000000000004',
  idempotencyKey: 'review-key',
  decision: 'REJECTED',
  source: 'PARENT',
  reason: 'Add a photo',
  reviewerId: '00000000-0000-4000-8000-000000000005',
  reviewedAt: new Date('2026-07-31T12:00:00.000Z'),
};

const pendingReview: PendingSubmissionReviewRecord = {
  targetType: 'CHECK_IN',
  targetId: review.targetId,
  attemptId: review.attemptId,
  task: { id: '00000000-0000-4000-8000-000000000010', name: '晨读' },
  child: { id: '00000000-0000-4000-8000-000000000011', nickname: '小星' },
  contentText: '完成了两章',
  media: [
    {
      id: '00000000-0000-4000-8000-000000000012',
      type: 'IMAGE',
      mimeType: 'image/jpeg',
    },
  ],
  submittedAt: new Date('2026-07-31T11:00:00.000Z'),
  reviewDeadlineAt: new Date('2026-08-02T11:00:00.000Z'),
  isOverdue: false,
};

function operations(): SubmissionReviewOperations {
  return {
    listPendingReviews: vi.fn().mockResolvedValue({ reviews: [pendingReview] }),
    listReviewHistory: vi
      .fn()
      .mockResolvedValue({ reviews: [], page: { has_more: false, next_cursor: null } }),
    reviewCheckIn: vi.fn().mockResolvedValue({ review }),
    reviewCollaborationSubmission: vi.fn().mockResolvedValue({
      review: {
        ...review,
        targetType: 'COLLABORATION_SUBMISSION',
        targetId: '00000000-0000-4000-8000-000000000006',
      },
    }),
    listCheckInReviews: vi.fn().mockResolvedValue({ reviews: [review] }),
    listCollaborationSubmissionReviews: vi.fn().mockResolvedValue({ reviews: [] }),
  };
}

describe('submission review HTTP routes', () => {
  beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('lists the authenticated family pending review queue', async () => {
    const submissionReviewOperations = operations();
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      submissionReviewOperations,
    });
    const response = await app.request('/api/v1/family/submission-reviews/pending', {
      headers: { cookie: 'familystar_session=parent-session' },
    });

    expect(response.status).toBe(200);
    expect(submissionReviewOperations.listPendingReviews).toHaveBeenCalledWith({
      sessionToken: 'parent-session',
    });
    expect(await response.json()).toMatchObject({
      data: {
        reviews: [
          {
            target_type: 'CHECK_IN',
            target_id: review.targetId,
            task: { name: '晨读' },
            child: { nickname: '小星' },
            content_text: '完成了两章',
            media: [{ type: 'IMAGE', mime_type: 'image/jpeg' }],
            submitted_at: '2026-07-31T11:00:00.000Z',
            review_deadline_at: '2026-08-02T11:00:00.000Z',
            is_overdue: false,
          },
        ],
      },
    });
  });

  it('returns an empty pending review queue as a successful response', async () => {
    const submissionReviewOperations = operations();
    vi.mocked(submissionReviewOperations.listPendingReviews).mockResolvedValue({ reviews: [] });
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      submissionReviewOperations,
    });

    const response = await app.request('/api/v1/family/submission-reviews/pending', {
      headers: { cookie: 'familystar_session=parent-session' },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { reviews: [] } });
  });

  it('lists filtered family review history with stable page metadata', async () => {
    const submissionReviewOperations = operations();
    vi.mocked(submissionReviewOperations.listReviewHistory!).mockResolvedValue({
      reviews: [
        {
          ...review,
          task: { id: '00000000-0000-4000-8000-000000000010', name: '晨读' },
          child: { id: '00000000-0000-4000-8000-000000000011', nickname: '小星' },
        },
      ],
      page: { has_more: false, next_cursor: null },
    });
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', submissionReviewOperations });
    const response = await app.request(
      '/api/v1/family/submission-reviews/history?child_id=00000000-0000-4000-8000-000000000011&task_id=00000000-0000-4000-8000-000000000010&result=REJECTED&start_date=2026-07-01&end_date=2026-07-31&limit=25',
      { headers: { cookie: 'familystar_session=parent-session' } },
    );

    expect(response.status).toBe(200);
    expect(submissionReviewOperations.listReviewHistory).toHaveBeenCalledWith({
      sessionToken: 'parent-session',
      childId: '00000000-0000-4000-8000-000000000011',
      taskId: '00000000-0000-4000-8000-000000000010',
      decision: 'REJECTED',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      cursor: null,
      limit: 25,
    });
    expect(await response.json()).toMatchObject({
      data: {
        reviews: [{ task: { name: '晨读' }, child: { nickname: '小星' }, status: 'REJECTED' }],
        page: { has_more: false, next_cursor: null },
      },
    });
  });

  it('accepts a check-in review and returns snake_case history data', async () => {
    const submissionReviewOperations = operations();
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      submissionReviewOperations,
    });
    const response = await app.request(`/api/v1/check-ins/${review.targetId}/reviews`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'familystar_session=parent-session',
        'idempotency-key': 'review-key',
      },
      body: JSON.stringify({ status: 'REJECTED', reason: 'Add a photo' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('familystar_session=parent-session');
    expect(submissionReviewOperations.reviewCheckIn).toHaveBeenCalledWith({
      sessionToken: 'parent-session',
      checkInId: review.targetId,
      idempotencyKey: 'review-key',
      decision: 'REJECTED',
      reason: 'Add a photo',
    });
    expect(await response.json()).toMatchObject({
      data: {
        review: {
          target_type: 'CHECK_IN',
          target_id: review.targetId,
          attempt_id: review.attemptId,
          source: 'PARENT',
          reviewer_id: review.reviewerId,
          reviewed_at: '2026-07-31T12:00:00.000Z',
        },
      },
    });
  });

  it('requires an idempotency key before calling the service', async () => {
    const submissionReviewOperations = operations();
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      submissionReviewOperations,
    });
    const response = await app.request(`/api/v1/check-ins/${review.targetId}/reviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'APPROVED' }),
    });

    expect(response.status).toBe(400);
    expect(submissionReviewOperations.reviewCheckIn).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
  });

  it('lists collaboration review history through its dedicated route', async () => {
    const submissionReviewOperations = operations();
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      submissionReviewOperations,
    });
    const response = await app.request(
      '/api/v1/collaboration-submissions/00000000-0000-4000-8000-000000000006/reviews',
      { headers: { cookie: 'familystar_session=parent-session' } },
    );

    expect(response.status).toBe(200);
    expect(submissionReviewOperations.listCollaborationSubmissionReviews).toHaveBeenCalledWith({
      sessionToken: 'parent-session',
      submissionId: '00000000-0000-4000-8000-000000000006',
    });
  });

  it('returns timeout history with a null reviewer', async () => {
    const submissionReviewOperations = operations();
    submissionReviewOperations.listCheckInReviews = vi.fn().mockResolvedValue({
      reviews: [{ ...review, decision: 'APPROVED', source: 'TIMEOUT', reviewerId: null }],
    });
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      submissionReviewOperations,
    });

    const response = await app.request(`/api/v1/check-ins/${review.targetId}/reviews`, {
      headers: { cookie: 'familystar_session=parent-session' },
    });

    expect(await response.json()).toMatchObject({
      data: { reviews: [{ source: 'TIMEOUT', reviewer_id: null }] },
    });
  });

  it('maps child access to forbidden', async () => {
    const submissionReviewOperations = operations();
    submissionReviewOperations.listCheckInReviews = vi
      .fn()
      .mockRejectedValue(new SubmissionReviewError('FORBIDDEN', 'A parent session is required.'));
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      submissionReviewOperations,
    });
    const response = await app.request(`/api/v1/check-ins/${review.targetId}/reviews`);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });
});
