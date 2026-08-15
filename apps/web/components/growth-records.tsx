'use client';

import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Image as ImageIcon,
  Milestone,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import NextImage from 'next/image';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';

import type { ApiLoadState } from '../lib/api-resource';
import { childApi, childSectionPaths } from '../lib/child-portal';
import {
  buildChildHistoryPath,
  buildGrowthRecordsPath,
  emptyGrowthRecordFilters,
  loadTimelineMediaUrls,
  manualRecordPayload,
  mergeTimelineItems,
  timelineMediaIds,
  type ChildHistoryItem,
  type ChildHistoryResponse,
  type CursorPage,
  type GrowthRecord,
  type GrowthRecordFilters,
  type GrowthRecordsResponse,
  type TimelineMedia,
} from '../lib/growth-records';
import { uploadMediaFile, type UploadApi } from '../lib/media-upload';
import { parentApi } from '../lib/parent-portal';

type ParentOption = Readonly<{ id: string; nickname?: string; name?: string }>;
type TimelineApi = <Result>(path: string, init?: RequestInit) => Promise<Result>;
type MediaUrlMap = Readonly<Record<string, string>>;

const emptyPage: CursorPage = { next_cursor: null, has_more: false };

function recordTypeLabel(type: GrowthRecord['type']): string {
  return { CHECK_IN: '打卡', NOTE: '学习笔记', MILESTONE: '成长里程碑' }[type];
}

function historyStatusLabel(status: ChildHistoryItem['status']): string {
  return { PENDING: '等待审核', APPROVED: '已通过', REJECTED: '需再试一次' }[status];
}

function TimelineMediaGallery({
  media,
  urls,
}: {
  media: readonly TimelineMedia[];
  urls: MediaUrlMap;
}) {
  if (media.length === 0) return null;
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {media.map((item) => {
        const url = urls[item.id];
        if (!url) {
          return (
            <div
              key={item.id}
              className="grid min-h-32 place-items-center rounded-card bg-sand/70 text-center text-caption font-bold text-brown-light"
            >
              <ImageIcon aria-hidden="true" />
              媒体地址加载中
            </div>
          );
        }
        if (item.type === 'VIDEO') {
          return (
            <video key={item.id} className="w-full rounded-card bg-brown" controls src={url} />
          );
        }
        if (item.type === 'AUDIO') {
          return <audio key={item.id} className="w-full self-center" controls src={url} />;
        }
        return (
          <NextImage
            key={item.id}
            className="aspect-[4/3] w-full rounded-card object-cover"
            src={url}
            alt="成长记录照片"
            width={640}
            height={480}
            unoptimized
          />
        );
      })}
    </div>
  );
}

function StateCard({
  state,
  loading,
  empty,
  error,
  onRetry,
}: {
  state: ApiLoadState;
  loading: string;
  empty: string;
  error: string;
  onRetry: () => void;
}) {
  const detail = state === 'loading' ? loading : state === 'error' ? error : empty;
  return (
    <section className="panel">
      <div className="empty-state min-h-52" role={state === 'error' ? 'alert' : undefined}>
        {state === 'error' ? <AlertCircle aria-hidden="true" /> : <BookOpen aria-hidden="true" />}
        <strong>{detail}</strong>
        {state === 'error' && (
          <button type="button" className="button-secondary" onClick={onRetry}>
            <RefreshCw aria-hidden="true" size={17} /> 重新读取
          </button>
        )}
      </div>
    </section>
  );
}

function ParentRecordCard({
  record,
  urls,
  onEdit,
  onDelete,
}: {
  record: GrowthRecord;
  urls: MediaUrlMap;
  onEdit: (record: GrowthRecord) => void;
  onDelete: (record: GrowthRecord) => void;
}) {
  const manual = record.type !== 'CHECK_IN';
  const Icon =
    record.type === 'MILESTONE' ? Milestone : record.type === 'NOTE' ? FileText : CheckCircle2;
  return (
    <article className="panel relative overflow-hidden">
      <span className="absolute bottom-0 left-7 top-0 w-px bg-sand" aria-hidden="true" />
      <div className="relative flex gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-cream text-orange ring-4 ring-white">
          <Icon aria-hidden="true" size={21} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="tag bg-orange/10 text-orange">{recordTypeLabel(record.type)}</span>
                <span className="text-caption font-extrabold text-brown-light">
                  {record.occurred_on}
                </span>
              </div>
              <h2 className="mt-2 font-display text-section text-brown">{record.title}</h2>
              <p className="mt-1 text-caption font-bold text-brown-light">
                {record.child.nickname}
                {record.task ? ` · ${record.task.name}` : ''}
                {record.points_earned === null ? '' : ` · +${record.points_earned} 星`}
              </p>
            </div>
            {manual && (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`编辑${record.title}`}
                  onClick={() => onEdit(record)}
                >
                  <Pencil size={17} />
                </button>
                <button
                  type="button"
                  className="icon-button text-red"
                  aria-label={`删除${record.title}`}
                  onClick={() => onDelete(record)}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            )}
          </div>
          {record.content_text && (
            <p className="mt-3 whitespace-pre-wrap font-semibold">{record.content_text}</p>
          )}
          <TimelineMediaGallery media={record.media} urls={urls} />
        </div>
      </div>
    </article>
  );
}

export function ParentGrowthRecordsView({
  records,
  page,
  state,
  urls,
  mediaError,
  loadingMore,
  pageError,
  onRetry,
  onRetryMedia,
  onLoadMore,
  onEdit,
  onDelete,
}: {
  records: readonly GrowthRecord[];
  page: CursorPage;
  state: ApiLoadState;
  urls: MediaUrlMap;
  mediaError: boolean;
  loadingMore: boolean;
  pageError: boolean;
  onRetry: () => void;
  onRetryMedia: () => void;
  onLoadMore: () => void;
  onEdit: (record: GrowthRecord) => void;
  onDelete: (record: GrowthRecord) => void;
}) {
  if (state !== 'live') {
    return (
      <StateCard
        state={state}
        loading="正在整理家庭成长时间线"
        empty="当前筛选下还没有成长记录"
        error="成长记录暂时无法读取"
        onRetry={onRetry}
      />
    );
  }
  return (
    <div className="space-y-4">
      {mediaError && (
        <div className="notice" role="alert">
          <AlertCircle aria-hidden="true" className="shrink-0 text-orange" />
          <span className="flex-1">部分媒体地址读取失败，文字记录已完整保留。</span>
          <button type="button" className="font-extrabold text-blue" onClick={onRetryMedia}>
            重试媒体
          </button>
        </div>
      )}
      {records.map((record) => (
        <ParentRecordCard
          key={record.id}
          record={record}
          urls={urls}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
      {pageError && (
        <div className="notice" role="alert">
          <span className="flex-1">后续记录加载失败，当前时间线已保留。</span>
          <button type="button" className="font-extrabold text-blue" onClick={onLoadMore}>
            重试加载更多
          </button>
        </div>
      )}
      {page.has_more && page.next_cursor && !pageError && (
        <button
          type="button"
          className="button-secondary mx-auto"
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          <RefreshCw aria-hidden="true" size={17} />
          {loadingMore ? '正在加载' : '加载更多记录'}
        </button>
      )}
    </div>
  );
}

function GrowthRecordEditor({
  record,
  childOptions,
  tasks,
  api,
  onClose,
  onSaved,
}: {
  record: GrowthRecord | null;
  childOptions: readonly ParentOption[];
  tasks: readonly ParentOption[];
  api: TimelineApi;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [childId, setChildId] = useState(record?.child.id ?? childOptions[0]?.id ?? '');
  const [taskId, setTaskId] = useState(record?.task?.id ?? '');
  const [type, setType] = useState<'NOTE' | 'MILESTONE'>(
    record?.type === 'MILESTONE' ? 'MILESTONE' : 'NOTE',
  );
  const [title, setTitle] = useState(record?.title ?? '');
  const [contentText, setContentText] = useState(record?.content_text ?? '');
  const [occurredOn, setOccurredOn] = useState(
    record?.occurred_on ?? new Date().toISOString().slice(0, 10),
  );
  const [keptMediaIds, setKeptMediaIds] = useState(record?.media.map(({ id }) => id) ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [busy, onClose]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!childId) throw new Error('请先选择孩子。');
      if (keptMediaIds.length + files.length > 10) throw new Error('每条记录最多关联 10 个媒体。');
      const uploaded: string[] = [];
      for (const file of files)
        uploaded.push(await uploadMediaFile(file, { api: api as UploadApi }));
      const payload = manualRecordPayload({
        childId,
        taskId,
        type,
        title,
        contentText,
        occurredOn,
        mediaIds: [...keptMediaIds, ...uploaded],
      });
      await api(record ? `/family/growth-records/${record.id}` : '/family/growth-records', {
        method: record ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      await onSaved();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '成长记录保存失败。');
    } finally {
      setBusy(false);
    }
  }

  const content = (
    <div className="modal-backdrop" onMouseDown={() => !busy && onClose()}>
      <section
        className="modal max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="growth-record-editor-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 id="growth-record-editor-title" className="font-display text-title">
            {record ? '编辑成长记录' : '写一条成长记录'}
          </h2>
          <button type="button" className="icon-button" aria-label="关闭弹窗" onClick={onClose}>
            <X />
          </button>
        </div>
        <form className="space-y-4" onSubmit={(event) => void submit(event)} aria-busy={busy}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field-label">
              孩子
              <select
                className="field"
                value={childId}
                onChange={(event) => setChildId(event.target.value)}
                required
              >
                <option value="">请选择</option>
                {childOptions.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.nickname}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              类型
              <select
                className="field"
                value={type}
                onChange={(event) => setType(event.target.value as 'NOTE' | 'MILESTONE')}
              >
                <option value="NOTE">学习笔记</option>
                <option value="MILESTONE">成长里程碑</option>
              </select>
            </label>
          </div>
          <label className="field-label">
            关联任务
            <select
              className="field"
              value={taskId}
              onChange={(event) => setTaskId(event.target.value)}
            >
              <option value="">不关联任务</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            标题
            <input
              className="field"
              required
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="field-label">
            记录日期
            <input
              className="field"
              type="date"
              required
              value={occurredOn}
              onChange={(event) => setOccurredOn(event.target.value)}
            />
          </label>
          <label className="field-label">
            正文
            <textarea
              className="field min-h-32"
              maxLength={10000}
              value={contentText}
              onChange={(event) => setContentText(event.target.value)}
            />
          </label>
          {keptMediaIds.length > 0 && (
            <div className="rounded-card bg-sand/60 p-3 text-caption font-bold">
              已保留 {keptMediaIds.length} 个附件
              <button type="button" className="ml-3 text-red" onClick={() => setKeptMediaIds([])}>
                移除现有附件
              </button>
            </div>
          )}
          <label className="field-label">
            添加图片或视频
            <span className="flex min-h-12 items-center gap-2 rounded-btn border border-dashed border-wood bg-cream px-4">
              <Upload aria-hidden="true" size={18} />
              <span>{files.length > 0 ? `已选择 ${files.length} 个文件` : '最多 10 个附件'}</span>
              <input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/x-m4v"
                multiple
                onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              />
            </span>
          </label>
          {error && (
            <p className="notice text-red" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="button-primary w-full" disabled={busy}>
            <Sparkles aria-hidden="true" size={18} /> {busy ? '正在保存' : '保存记录'}
          </button>
        </form>
      </section>
    </div>
  );
  return typeof document === 'undefined' ? content : createPortal(content, document.body);
}

export function ParentGrowthRecordsSection({ api = parentApi }: { api?: TimelineApi }) {
  const [records, setRecords] = useState<readonly GrowthRecord[]>([]);
  const [page, setPage] = useState<CursorPage>(emptyPage);
  const [state, setState] = useState<ApiLoadState>('loading');
  const [children, setChildren] = useState<readonly ParentOption[]>([]);
  const [tasks, setTasks] = useState<readonly ParentOption[]>([]);
  const [draft, setDraft] = useState<GrowthRecordFilters>(emptyGrowthRecordFilters);
  const [applied, setApplied] = useState<GrowthRecordFilters>(emptyGrowthRecordFilters);
  const [urls, setUrls] = useState<MediaUrlMap>({});
  const [mediaError, setMediaError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState(false);
  const [editing, setEditing] = useState<GrowthRecord | 'new' | null>(null);
  const [optionsError, setOptionsError] = useState(false);
  const [actionError, setActionError] = useState('');

  async function loadMedia(items: readonly GrowthRecord[]): Promise<void> {
    try {
      setUrls(await loadTimelineMediaUrls(api, timelineMediaIds(items)));
      setMediaError(false);
    } catch {
      setMediaError(true);
    }
  }

  async function load(filters: GrowthRecordFilters, cursor?: string | null): Promise<void> {
    const appending = Boolean(cursor);
    if (appending) setLoadingMore(true);
    else setState('loading');
    setPageError(false);
    try {
      const result = await api<GrowthRecordsResponse>(buildGrowthRecordsPath(filters, cursor));
      const nextItems = appending ? mergeTimelineItems(records, result.items) : result.items;
      setRecords(nextItems);
      setPage(result.page);
      setApplied(filters);
      setState(nextItems.length === 0 ? 'empty' : 'live');
      await loadMedia(nextItems);
    } catch {
      if (appending) setPageError(true);
      else setState('error');
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadOptions(): Promise<void> {
    setOptionsError(false);
    try {
      const [childData, taskData] = await Promise.all([
        api<{ children: readonly ParentOption[] }>('/family/children'),
        api<{ tasks: readonly ParentOption[] }>('/family/tasks'),
      ]);
      setChildren(childData.children);
      setTasks(taskData.tasks);
    } catch {
      setOptionsError(true);
    }
  }

  useEffect(() => {
    void load(emptyGrowthRecordFilters);
    void loadOptions();
    // The initial request is intentionally bound to the injected API client.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  async function remove(record: GrowthRecord): Promise<void> {
    if (!globalThis.confirm(`确认删除“${record.title}”吗？`)) return;
    setActionError('');
    try {
      await api(`/family/growth-records/${record.id}`, { method: 'DELETE' });
      await load(applied);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '成长记录删除失败。');
    }
  }

  return (
    <>
      <header className="mb-6 flex items-end justify-between gap-4 mobile:items-start mobile:flex-col">
        <div>
          <p className="eyebrow">把成长留成可回看的故事</p>
          <h1 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] leading-tight text-brown">
            成长记录
          </h1>
          <p className="mt-2 max-w-2xl font-semibold text-brown-light">
            打卡自动沉淀，学习片段和重要时刻由家长补充记录。
          </p>
        </div>
        <button
          type="button"
          className="button-primary"
          onClick={() => setEditing('new')}
          disabled={children.length === 0}
        >
          <Plus aria-hidden="true" size={18} /> 写记录
        </button>
      </header>
      {optionsError && (
        <div className="notice mb-5" role="alert">
          <AlertCircle aria-hidden="true" className="shrink-0 text-orange" />
          <span className="flex-1">孩子与任务筛选项读取失败，时间线仍可浏览。</span>
          <button
            type="button"
            className="font-extrabold text-blue"
            onClick={() => void loadOptions()}
          >
            重试选项
          </button>
        </div>
      )}
      {actionError && (
        <div className="notice mb-5 text-red" role="alert">
          <AlertCircle aria-hidden="true" className="shrink-0" />
          <span>{actionError}</span>
        </div>
      )}
      <form
        className="panel mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-6"
        onSubmit={(event) => {
          event.preventDefault();
          void load(draft);
        }}
      >
        <label className="field-label">
          孩子
          <select
            className="field"
            value={draft.childId}
            onChange={(event) => setDraft({ ...draft, childId: event.target.value })}
          >
            <option value="">全部孩子</option>
            {children.map((child) => (
              <option key={child.id} value={child.id}>
                {child.nickname}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          任务
          <select
            className="field"
            value={draft.taskId}
            onChange={(event) => setDraft({ ...draft, taskId: event.target.value })}
          >
            <option value="">全部任务</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          类型
          <select
            className="field"
            value={draft.type}
            onChange={(event) =>
              setDraft({ ...draft, type: event.target.value as GrowthRecordFilters['type'] })
            }
          >
            <option value="">全部类型</option>
            <option value="CHECK_IN">打卡</option>
            <option value="NOTE">学习笔记</option>
            <option value="MILESTONE">成长里程碑</option>
          </select>
        </label>
        <label className="field-label">
          开始日期
          <input
            className="field"
            type="date"
            value={draft.startDate}
            onChange={(event) => setDraft({ ...draft, startDate: event.target.value })}
          />
        </label>
        <label className="field-label">
          结束日期
          <input
            className="field"
            type="date"
            value={draft.endDate}
            onChange={(event) => setDraft({ ...draft, endDate: event.target.value })}
          />
        </label>
        <button type="submit" className="button-secondary self-end">
          <CalendarDays aria-hidden="true" size={17} /> 应用筛选
        </button>
      </form>
      <ParentGrowthRecordsView
        records={records}
        page={page}
        state={state}
        urls={urls}
        mediaError={mediaError}
        loadingMore={loadingMore}
        pageError={pageError}
        onRetry={() => void load(applied)}
        onRetryMedia={() => void loadMedia(records)}
        onLoadMore={() => void load(applied, page.next_cursor)}
        onEdit={setEditing}
        onDelete={(record) => void remove(record)}
      />
      {editing && (
        <GrowthRecordEditor
          record={editing === 'new' ? null : editing}
          childOptions={children}
          tasks={tasks}
          api={api}
          onClose={() => setEditing(null)}
          onSaved={() => load(applied)}
        />
      )}
    </>
  );
}

function ChildHistoryCard({ item, urls }: { item: ChildHistoryItem; urls: MediaUrlMap }) {
  const statusClass =
    item.status === 'APPROVED'
      ? 'bg-leaf/20 text-leaf-dark'
      : item.status === 'REJECTED'
        ? 'bg-pink/30 text-pink-dark'
        : 'bg-yellow/20 text-orange';
  return (
    <article className="child-card child-animate-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className={`tag ${statusClass}`}>{historyStatusLabel(item.status)}</span>
          <h2 className="mt-2 font-display text-subtitle">{item.task.name}</h2>
          <p className="text-label font-bold text-brown-light">
            {item.check_date} · {item.submission_type === 'COLLABORATION' ? '协作打卡' : '个人打卡'}{' '}
            · 第 {item.attempt_number} 次提交
          </p>
        </div>
        {item.points_earned !== null && (
          <strong className="rounded-pill bg-yellow/20 px-3 py-2 text-orange">
            +{item.points_earned} 星
          </strong>
        )}
      </div>
      {item.content_text && (
        <p className="mt-3 whitespace-pre-wrap font-semibold">{item.content_text}</p>
      )}
      {item.review?.reason && (
        <div className="notice mt-3">
          <Clock3 aria-hidden="true" size={18} />
          <span>{item.review.reason}</span>
        </div>
      )}
      <TimelineMediaGallery media={item.media} urls={urls} />
    </article>
  );
}

export function ChildGrowthRecordsView({
  items,
  page,
  state,
  urls,
  mediaError,
  loadingMore,
  pageError,
  onRetry,
  onRetryMedia,
  onLoadMore,
}: {
  items: readonly ChildHistoryItem[];
  page: CursorPage;
  state: ApiLoadState;
  urls: MediaUrlMap;
  mediaError: boolean;
  loadingMore: boolean;
  pageError: boolean;
  onRetry: () => void;
  onRetryMedia: () => void;
  onLoadMore: () => void;
}) {
  if (state !== 'live') {
    return (
      <StateCard
        state={state}
        loading="正在收集你的坚持"
        empty="完成第一次打卡后，记录会出现在这里"
        error="我的记录暂时无法读取"
        onRetry={onRetry}
      />
    );
  }
  return (
    <div className="space-y-4">
      {mediaError && (
        <div className="notice" role="alert">
          <AlertCircle aria-hidden="true" />
          <span className="flex-1">媒体暂时未加载，打卡文字和结果已保留。</span>
          <button type="button" className="font-extrabold text-blue" onClick={onRetryMedia}>
            重试媒体
          </button>
        </div>
      )}
      {items.map((item) => (
        <ChildHistoryCard key={item.id} item={item} urls={urls} />
      ))}
      {pageError && (
        <div className="notice" role="alert">
          <span className="flex-1">后续记录加载失败。</span>
          <button type="button" className="font-extrabold text-blue" onClick={onLoadMore}>
            重试
          </button>
        </div>
      )}
      {page.has_more && page.next_cursor && !pageError && (
        <button
          type="button"
          className="child-dashed-button"
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          <RefreshCw aria-hidden="true" size={18} />
          {loadingMore ? '正在加载' : '加载更多回忆'}
        </button>
      )}
    </div>
  );
}

export function ChildGrowthRecordsSection({ api = childApi }: { api?: TimelineApi }) {
  const [items, setItems] = useState<readonly ChildHistoryItem[]>([]);
  const [page, setPage] = useState<CursorPage>(emptyPage);
  const [state, setState] = useState<ApiLoadState>('loading');
  const [urls, setUrls] = useState<MediaUrlMap>({});
  const [mediaError, setMediaError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState(false);

  async function loadMedia(current: readonly ChildHistoryItem[]): Promise<void> {
    try {
      setUrls(await loadTimelineMediaUrls(api, timelineMediaIds(current)));
      setMediaError(false);
    } catch {
      setMediaError(true);
    }
  }

  async function load(cursor?: string | null): Promise<void> {
    const appending = Boolean(cursor);
    if (appending) setLoadingMore(true);
    else setState('loading');
    setPageError(false);
    try {
      const result = await api<ChildHistoryResponse>(buildChildHistoryPath(cursor));
      const nextItems = appending ? mergeTimelineItems(items, result.items) : result.items;
      setItems(nextItems);
      setPage(result.page);
      setState(nextItems.length === 0 ? 'empty' : 'live');
      await loadMedia(nextItems);
    } catch {
      if (appending) setPageError(true);
      else setState('error');
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void load();
    // The initial request is intentionally bound to the injected API client.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  return (
    <div className="space-y-6">
      <section className="child-hero child-hero-blue child-animate-in">
        <Link href={childSectionPaths.profile} className="child-glass-chip mb-3 w-fit">
          <ArrowLeft aria-hidden="true" size={17} /> 返回我的信息
        </Link>
        <h1 className="font-display text-page">我的记录</h1>
        <p className="mt-2 font-bold">每一次提交、协作和成长，都在这里留下真实足迹。</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="child-glass-chip">
            <Users aria-hidden="true" size={16} /> 个人与协作
          </span>
          <span className="child-glass-chip">
            <ImageIcon aria-hidden="true" size={16} /> 照片与视频
          </span>
        </div>
      </section>
      <ChildGrowthRecordsView
        items={items}
        page={page}
        state={state}
        urls={urls}
        mediaError={mediaError}
        loadingMore={loadingMore}
        pageError={pageError}
        onRetry={() => void load()}
        onRetryMedia={() => void loadMedia(items)}
        onLoadMore={() => void load(page.next_cursor)}
      />
    </div>
  );
}
