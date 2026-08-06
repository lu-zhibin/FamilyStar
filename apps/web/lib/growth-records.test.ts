import { describe, expect, it, vi } from 'vitest';

import {
  buildChildHistoryPath,
  buildGrowthRecordsPath,
  chunkMediaIds,
  loadTimelineMediaUrls,
  manualRecordPayload,
  mergeTimelineItems,
  timelineMediaIds,
} from './growth-records';

describe('growth record helpers', () => {
  it('builds stable family filters and preserves an opaque cursor', () => {
    expect(
      buildGrowthRecordsPath(
        {
          childId: 'child/id',
          taskId: 'task id',
          type: 'MILESTONE',
          startDate: '2026-08-01',
          endDate: '2026-08-06',
        },
        'date/id+token',
        50,
      ),
    ).toBe(
      '/family/growth-records?limit=50&child_id=child%2Fid&task_id=task+id&type=MILESTONE&start_date=2026-08-01&end_date=2026-08-06&cursor=date%2Fid%2Btoken',
    );
    expect(buildChildHistoryPath('history/token', 25)).toBe(
      '/check-ins/me/history?limit=25&cursor=history%2Ftoken',
    );
  });

  it('merges cursor pages and media identifiers without duplicates', () => {
    expect(mergeTimelineItems([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }])).toEqual([
      { id: 'a' },
      { id: 'b' },
    ]);
    expect(
      timelineMediaIds([
        { media: [{ id: 'media-a' }, { id: 'media-b' }] },
        { media: [{ id: 'media-a' }] },
      ]),
    ).toEqual(['media-a', 'media-b']);
  });

  it('property: overlapping and repeated timeline pages preserve first-seen stable order', () => {
    for (let pageSize = 1; pageSize <= 32; pageSize += 1) {
      const ordered = Array.from({ length: pageSize * 3 }, (_, index) => ({
        id: `record-${String(index).padStart(3, '0')}`,
        version: 'first',
      }));
      const pages = [
        ordered.slice(0, pageSize),
        ordered.slice(pageSize - 1, pageSize * 2 + 1),
        [...ordered.slice(pageSize * 2), ...ordered.slice(pageSize * 2)],
      ];
      const merged = pages.reduce<readonly (typeof ordered)[number][]>(
        (items, page) => mergeTimelineItems(items, page),
        [],
      );

      expect(merged).toEqual(ordered);
      expect(new Set(merged.map(({ id }) => id)).size).toBe(ordered.length);
      expect(mergeTimelineItems(merged, pages[1]!)).toEqual(merged);
    }
  });

  it('chunks media requests at the API boundary and restores an id-to-url map', async () => {
    const ids = Array.from({ length: 101 }, (_, index) => `media-${index}`);
    expect(chunkMediaIds(ids).map((batch) => batch.length)).toEqual([50, 50, 1]);
    const api = vi.fn(async (_path: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { media_ids: string[] };
      return {
        items: body.media_ids.map((mediaId) => ({
          media_id: mediaId,
          url: `https://media.example/${mediaId}`,
          expires_at: '2026-08-06T09:00:00.000Z',
        })),
      };
    });

    const result = await loadTimelineMediaUrls(
      api as unknown as Parameters<typeof loadTimelineMediaUrls>[0],
      [...ids, ids[0]!],
    );

    expect(api).toHaveBeenCalledTimes(3);
    expect(result['media-100']).toBe('https://media.example/media-100');
  });

  it('normalizes manual record payloads and preserves explicit nulls', () => {
    expect(
      manualRecordPayload({
        childId: 'child-1',
        taskId: '',
        type: 'NOTE',
        title: '  阅读摘记  ',
        contentText: '   ',
        occurredOn: '2026-08-06',
        mediaIds: ['media-1', 'media-1'],
      }),
    ).toEqual({
      child_id: 'child-1',
      task_id: null,
      type: 'NOTE',
      title: '阅读摘记',
      content_text: null,
      occurred_on: '2026-08-06',
      media_ids: ['media-1'],
    });
  });
});
