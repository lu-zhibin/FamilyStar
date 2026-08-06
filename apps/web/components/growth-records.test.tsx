import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { ChildHistoryItem, GrowthRecord } from '../lib/growth-records';
import { ChildGrowthRecordsView, ParentGrowthRecordsView } from './growth-records';

const media = {
  id: '70000000-0000-4000-8000-000000000001',
  type: 'IMAGE' as const,
  mime_type: 'image/jpeg',
  size_bytes: 1024,
  width: 640,
  height: 480,
  duration: null,
  created_at: '2026-08-06T08:00:00.000Z',
};

const checkIn: GrowthRecord = {
  id: 'record-check-in',
  child: { id: 'child-1', nickname: '小星' },
  task: { id: 'task-1', name: '每日阅读' },
  type: 'CHECK_IN',
  title: '每日阅读',
  content_text: '完成第三章',
  occurred_on: '2026-08-06',
  source_type: 'CHECK_IN',
  source_id: 'check-in-1',
  points_earned: 15,
  created_by: null,
  created_at: '2026-08-06T08:00:00.000Z',
  updated_at: '2026-08-06T08:00:00.000Z',
  media: [media],
};

const note: GrowthRecord = {
  ...checkIn,
  id: 'record-note',
  task: null,
  type: 'NOTE',
  title: '阅读摘记',
  source_type: null,
  source_id: null,
  points_earned: null,
  created_by: 'parent-1',
  media: [],
};

const viewCallbacks = {
  onRetry: vi.fn(),
  onRetryMedia: vi.fn(),
  onLoadMore: vi.fn(),
};

describe('ParentGrowthRecordsView', () => {
  it('renders immutable check-ins and editable manual records with signed media', () => {
    const markup = renderToStaticMarkup(
      <ParentGrowthRecordsView
        records={[checkIn, note]}
        page={{ next_cursor: 'next-page', has_more: true }}
        state="live"
        urls={{ [media.id]: 'https://media.example/photo.jpg' }}
        mediaError={false}
        loadingMore={false}
        pageError={false}
        {...viewCallbacks}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(markup).toContain('每日阅读');
    expect(markup).toContain('阅读摘记');
    expect(markup).toContain('+15 星');
    expect(markup).toContain('https://media.example/photo.jpg');
    expect(markup).toContain('aria-label="编辑阅读摘记"');
    expect(markup).not.toContain('aria-label="编辑每日阅读"');
    expect(markup).toContain('加载更多记录');
  });

  it('renders recoverable empty and failure boundaries', () => {
    const empty = renderToStaticMarkup(
      <ParentGrowthRecordsView
        records={[]}
        page={{ next_cursor: null, has_more: false }}
        state="empty"
        urls={{}}
        mediaError={false}
        loadingMore={false}
        pageError={false}
        {...viewCallbacks}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const failure = renderToStaticMarkup(
      <ParentGrowthRecordsView
        records={[]}
        page={{ next_cursor: null, has_more: false }}
        state="error"
        urls={{}}
        mediaError={false}
        loadingMore={false}
        pageError={false}
        {...viewCallbacks}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(empty).toContain('当前筛选下还没有成长记录');
    expect(failure).toContain('成长记录暂时无法读取');
    expect(failure).toContain('重新读取');
  });
});

describe('ChildGrowthRecordsView', () => {
  const history: ChildHistoryItem = {
    id: 'attempt-1',
    submission_id: 'submission-1',
    submission_type: 'COLLABORATION',
    attempt_number: 2,
    child: { id: 'child-1', nickname: '小星' },
    task: { id: 'task-1', name: '协作整理' },
    content_text: '一起整理完成',
    status: 'APPROVED',
    submitted_at: '2026-08-06T08:00:00.000Z',
    check_date: '2026-08-06',
    collaboration_round: {
      id: 'round-1',
      round_number: 1,
      start_date: '2026-08-06',
      end_date: '2026-08-06',
    },
    review: {
      id: 'review-1',
      decision: 'APPROVED',
      source: 'PARENT',
      reason: null,
      reviewer_id: 'parent-1',
      reviewed_at: '2026-08-06T08:10:00.000Z',
    },
    points_earned: 20,
    media: [],
  };

  it('renders a read-only personal and collaboration history timeline', () => {
    const markup = renderToStaticMarkup(
      <ChildGrowthRecordsView
        items={[history]}
        page={{ next_cursor: null, has_more: false }}
        state="live"
        urls={{}}
        mediaError={false}
        loadingMore={false}
        pageError={false}
        {...viewCallbacks}
      />,
    );

    expect(markup).toContain('协作整理');
    expect(markup).toContain('协作打卡');
    expect(markup).toContain('已通过');
    expect(markup).toContain('+20 星');
    expect(markup).not.toMatch(/编辑|删除/);
  });
});
