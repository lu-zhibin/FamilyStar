export type TimelineMedia = Readonly<{
  id: string;
  type: 'IMAGE' | 'VIDEO' | 'AUDIO';
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  created_at: string;
}>;

export type GrowthRecord = Readonly<{
  id: string;
  child: Readonly<{ id: string; nickname: string }>;
  task: Readonly<{ id: string; name: string }> | null;
  type: 'CHECK_IN' | 'NOTE' | 'MILESTONE';
  title: string;
  content_text: string | null;
  occurred_on: string;
  source_type: string | null;
  source_id: string | null;
  points_earned: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  media: readonly TimelineMedia[];
}>;

export type ChildHistoryItem = Readonly<{
  id: string;
  submission_id: string;
  submission_type: 'SOLO' | 'COLLABORATION';
  attempt_number: number;
  child: Readonly<{ id: string; nickname: string }>;
  task: Readonly<{ id: string; name: string }>;
  content_text: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submitted_at: string;
  check_date: string;
  collaboration_round: Readonly<{
    id: string;
    round_number: number;
    start_date: string;
    end_date: string;
  }> | null;
  review: Readonly<{
    id: string;
    decision: 'APPROVED' | 'REJECTED';
    source: 'PARENT' | 'TIMEOUT';
    reason: string | null;
    reviewer_id: string | null;
    reviewed_at: string;
  }> | null;
  points_earned: number | null;
  media: readonly TimelineMedia[];
}>;

export type CursorPage = Readonly<{ next_cursor: string | null; has_more: boolean }>;
export type GrowthRecordsResponse = Readonly<{
  items: readonly GrowthRecord[];
  page: CursorPage;
}>;
export type ChildHistoryResponse = Readonly<{
  items: readonly ChildHistoryItem[];
  page: CursorPage;
}>;

export type GrowthRecordFilters = Readonly<{
  childId: string;
  taskId: string;
  type: '' | GrowthRecord['type'];
  startDate: string;
  endDate: string;
}>;

export const emptyGrowthRecordFilters: GrowthRecordFilters = {
  childId: '',
  taskId: '',
  type: '',
  startDate: '',
  endDate: '',
};

export function buildGrowthRecordsPath(
  filters: GrowthRecordFilters,
  cursor?: string | null,
  limit = 20,
): string {
  const query = new URLSearchParams({ limit: String(limit) });
  if (filters.childId) query.set('child_id', filters.childId);
  if (filters.taskId) query.set('task_id', filters.taskId);
  if (filters.type) query.set('type', filters.type);
  if (filters.startDate) query.set('start_date', filters.startDate);
  if (filters.endDate) query.set('end_date', filters.endDate);
  if (cursor) query.set('cursor', cursor);
  return `/family/growth-records?${query.toString()}`;
}

export function buildChildHistoryPath(cursor?: string | null, limit = 20): string {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set('cursor', cursor);
  return `/check-ins/me/history?${query.toString()}`;
}

export function mergeTimelineItems<Item extends { id: string }>(
  current: readonly Item[],
  incoming: readonly Item[],
): readonly Item[] {
  const merged: Item[] = [];
  const ids = new Set<string>();
  for (const item of [...current, ...incoming]) {
    if (ids.has(item.id)) continue;
    ids.add(item.id);
    merged.push(item);
  }
  return merged;
}

export function timelineMediaIds(
  items: readonly { media: readonly Pick<TimelineMedia, 'id'>[] }[],
): readonly string[] {
  return [...new Set(items.flatMap(({ media }) => media.map(({ id }) => id)))];
}

export function chunkMediaIds(ids: readonly string[], size = 50): readonly string[][] {
  if (!Number.isSafeInteger(size) || size <= 0) throw new Error('媒体批次大小必须是正整数。');
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size)
    chunks.push(ids.slice(index, index + size));
  return chunks;
}

type TimelineApi = <Result>(path: string, init?: RequestInit) => Promise<Result>;

export async function loadTimelineMediaUrls(
  api: TimelineApi,
  ids: readonly string[],
): Promise<Readonly<Record<string, string>>> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return {};
  const batches = await Promise.all(
    chunkMediaIds(uniqueIds).map((mediaIds) =>
      api<{ items: readonly { media_id: string; url: string; expires_at: string }[] }>(
        '/media/access-urls',
        { method: 'POST', body: JSON.stringify({ media_ids: mediaIds }) },
      ),
    ),
  );
  return Object.fromEntries(
    batches.flatMap(({ items }) => items.map(({ media_id, url }) => [media_id, url])),
  );
}

export function manualRecordPayload(input: {
  childId: string;
  taskId: string;
  type: 'NOTE' | 'MILESTONE';
  title: string;
  contentText: string;
  occurredOn: string;
  mediaIds: readonly string[];
}) {
  return {
    child_id: input.childId,
    task_id: input.taskId || null,
    type: input.type,
    title: input.title.trim(),
    content_text: input.contentText.trim() || null,
    occurred_on: input.occurredOn,
    media_ids: [...new Set(input.mediaIds)],
  };
}
