'use client';

import {
  Bell,
  BookOpen,
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  CloudOff,
  Copy,
  Gift,
  Heart,
  Image as ImageIcon,
  Info,
  KeyRound,
  Mail,
  PackageCheck,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  UserPlus,
  X,
} from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { loadedState, readApiField, type ApiLoadState } from '../lib/api-resource';
import { authApi, type SessionIdentity } from '../lib/auth';
import {
  buildSoloTaskDraft,
  buildSubmissionReviewRequest,
  buildTaskPatch,
  copyTextToClipboard,
  formatFrequency,
  parentApi,
  type ParentSection,
  type ReviewTargetType,
} from '../lib/parent-portal';
import { ParentShell } from './parent-shell';

type LoadState = ApiLoadState;
type FamilyCodeLoadState = 'loading' | 'ready' | 'error';
type CopyState = 'idle' | 'copied' | 'error';
type Child = { id: string; nickname: string; grade: string | null; gender: 'male' | 'female' };
type Task = {
  id: string;
  task_type_id: string;
  name: string;
  description: string | null;
  submission_guide: string | null;
  base_points: number;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  check_type: string;
  verify_mode: string;
  collaboration_mode: string;
  frequency: { kind: string; count?: number };
  assignments: Array<{ child_id: string }>;
};
type TaskType = { id: string; name: string };
type Reward = {
  id: string;
  name: string;
  description: string | null;
  points_cost: number;
  stock_available: number | null;
  type: string;
  status: 'ACTIVE' | 'INACTIVE';
};
type Redemption = {
  id: string;
  child_id: string;
  reward_id: string;
  points_spent: number;
  status: string;
};
type Wish = {
  id: string;
  child_id: string;
  title: string;
  target_points: number;
  progress: { points: number; ratio: number };
};
type FamilySettings = {
  time_zone: string;
  check_in_deadline: string;
  makeup_days: number;
  review_timeout_hours: number;
  auto_approve_quota: number;
  streak_multipliers: Array<{ days: 3 | 7 | 14 | 30 | 60 | 100; multiplier: number }>;
};
type PendingReview = {
  target_type: ReviewTargetType;
  target_id: string;
  attempt_id: string;
  task: { id: string; name: string };
  child: { id: string; nickname: string };
  content_text: string | null;
  media: Array<{ id: string; type: 'IMAGE' | 'VIDEO' | 'AUDIO'; mime_type: string }>;
  submitted_at: string;
};

const defaultSettings: FamilySettings = {
  time_zone: 'Asia/Shanghai',
  check_in_deadline: '23:59',
  makeup_days: 3,
  review_timeout_hours: 48,
  auto_approve_quota: 30,
  streak_multipliers: [
    { days: 3, multiplier: 1.5 },
    { days: 7, multiplier: 2 },
    { days: 14, multiplier: 3 },
    { days: 30, multiplier: 5 },
    { days: 60, multiplier: 8 },
    { days: 100, multiplier: 10 },
  ],
};

function useApiData<T>(path: string, key: string, initialValue: T) {
  const [data, setData] = useState(initialValue);
  const [state, setState] = useState<LoadState>('loading');
  useEffect(() => {
    let active = true;
    parentApi<Record<string, unknown>>(path)
      .then((payload) => {
        if (active) {
          const value = readApiField<T>(payload, key);
          setData(value);
          setState(loadedState(value));
        }
      })
      .catch(() => active && setState('error'));
    return () => {
      active = false;
    };
  }, [key, path]);
  async function refresh(): Promise<void> {
    try {
      const payload = await parentApi<Record<string, unknown>>(path);
      const value = readApiField<T>(payload, key);
      setData(value);
      setState(loadedState(value));
    } catch (error) {
      setState('error');
      throw error;
    }
  }
  return { data, setData, state, refresh };
}

function PageHeader({
  title,
  eyebrow,
  description,
  state,
  action,
}: {
  title: string;
  eyebrow: string;
  description: string;
  state?: LoadState;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4 mobile:items-start mobile:flex-col">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] leading-tight text-brown">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl font-semibold text-brown-light">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        {state && <DataStatus state={state} />}
        {action}
      </div>
    </header>
  );
}
function DataStatus({ state }: { state: LoadState }) {
  if (state === 'loading')
    return (
      <span className="status-chip bg-sky/15 text-blue">
        <span className="loading-dot" />
        同步中
      </span>
    );
  if (state === 'live')
    return (
      <span className="status-chip bg-leaf-light text-leaf-dark">
        <Check size={14} />
        实时数据
      </span>
    );
  if (state === 'empty')
    return <span className="status-chip bg-sand text-brown-light">暂无数据</span>;
  return (
    <span className="status-chip bg-red/5 text-red" role="alert">
      <CloudOff size={14} />
      读取失败
    </span>
  );
}
function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>;
}
function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="font-display text-section text-brown">{children}</h2>
      {action}
    </div>
  );
}
function EmptyState({
  title,
  detail,
  icon = <Info size={28} />,
}: {
  title: string;
  detail: string;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon}
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}
function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-caption font-extrabold">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-pill bg-sand">
        <span
          className="block h-full rounded-pill bg-gradient-to-r from-leaf to-leaf-dark"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
function DashboardPage() {
  const children = useApiData<Child[]>('/family/children', 'children', []);
  return (
    <>
      <PageHeader
        eyebrow="今天也在一起成长"
        title="家庭总览"
        description="查看真实家庭成员，并了解尚待接入的总览聚合能力。"
        state={children.state}
      />
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <Panel>
          <SectionTitle>孩子今日进度</SectionTitle>
          <div className="grid gap-3 md:grid-cols-3">
            {children.data.map((child) => (
              <article key={child.id} className="soft-card">
                <div className="mb-4 flex items-center gap-3">
                  <span className="avatar">{child.nickname.slice(-1)}</span>
                  <div>
                    <h3 className="font-extrabold">{child.nickname}</h3>
                    <p className="text-caption font-bold text-brown-light">
                      {child.grade ?? '成长探索中'}
                    </p>
                  </div>
                </div>
                <p className="text-caption font-bold text-brown-light">
                  今日进度与积分将在总览聚合接口接入后展示。
                </p>
              </article>
            ))}
            {children.data.length === 0 && (
              <EmptyState title="还没有孩子档案" detail="前往家庭成员页创建第一个孩子档案。" />
            )}
          </div>
        </Panel>
        <Panel>
          <SectionTitle>今日待办</SectionTitle>
          <EmptyState
            title="总览待办接口待接入"
            detail="审核和兑换聚合完成后，这里会展示当前家庭的真实待办。"
          />
        </Panel>
      </div>
      <Panel className="mt-5">
        <SectionTitle>最近家庭动态</SectionTitle>
        <EmptyState
          title="动态时间线正在接入"
          detail="家庭动态聚合接口将在后续阶段提供。"
          icon={<Sparkles size={30} />}
        />
      </Panel>
    </>
  );
}

function TasksPage() {
  const resource = useApiData<Task[]>('/family/tasks', 'tasks', []);
  const types = useApiData<TaskType[]>('/family/task-types', 'task_types', []);
  const children = useApiData<Child[]>('/family/children', 'children', []);
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const tasks = resource.data.filter((task) => filter === 'all' || task.status === filter);

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionMessage('');
    const form = new FormData(event.currentTarget);
    const draft = buildSoloTaskDraft(form, new Date().toISOString().slice(0, 10));
    try {
      const data = await parentApi<{ task: Task }>('/family/tasks', {
        method: 'POST',
        body: JSON.stringify(draft),
      });
      resource.setData((items) => [data.task, ...items]);
      setOpen(false);
    } catch {
      setActionMessage('任务创建失败，请检查输入后重试。');
    }
  }

  async function updateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTask) return;
    setActionMessage('');
    try {
      const data = await parentApi<{ task: Task }>(`/family/tasks/${editingTask.id}`, {
        method: 'PATCH',
        body: JSON.stringify(buildTaskPatch(new FormData(event.currentTarget))),
      });
      resource.setData((items) =>
        items.map((item) => (item.id === data.task.id ? data.task : item)),
      );
      setEditingTask(null);
    } catch {
      setActionMessage('任务更新失败，请检查输入后重试。');
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="习惯从清晰的约定开始"
        title="任务管理"
        description="统一配置频率、积分、验收方式和多孩分配。"
        state={resource.state}
        action={
          <button
            className="primary-button"
            disabled={children.data.length === 0 || types.data.length === 0}
            title={children.data.length === 0 ? '请先创建孩子档案' : undefined}
            onClick={() => setOpen(true)}
          >
            <Plus size={17} />
            创建任务
          </button>
        }
      />
      {actionMessage && (
        <p className="notice mb-4 text-red" role="alert">
          {actionMessage}
        </p>
      )}
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="任务状态筛选">
        {(
          [
            ['all', '全部'],
            ['ACTIVE', '进行中'],
            ['INACTIVE', '已停用'],
            ['ARCHIVED', '已归档'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={`chip ${filter === key ? 'chip-active' : ''}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <Panel>
        <SectionTitle>家庭任务</SectionTitle>
        <div className="table-list">
          {tasks.map((task) => (
            <article
              key={task.id}
              className={`list-row ${task.status !== 'ACTIVE' ? 'opacity-60' : ''}`}
            >
              <span className="metric-icon">
                {task.check_type === 'PHOTO' ? <Camera /> : <BookOpen />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate font-extrabold">{task.name}</h3>
                  <span className="tag">
                    {task.collaboration_mode === 'COLLAB' ? '协作' : '单人'}
                  </span>
                  <span
                    className={`tag ${task.verify_mode === 'AUTO' ? 'tag-green' : 'tag-orange'}`}
                  >
                    {task.verify_mode === 'AUTO' ? '自动验收' : '人工审核'}
                  </span>
                </div>
                <p className="mt-1 text-caption font-bold text-brown-light">
                  {formatFrequency(task.frequency)} · 分配 {task.assignments.length} 个孩子
                </p>
              </div>
              <strong className="whitespace-nowrap font-display text-orange">
                +{task.base_points} 星
              </strong>
              <button
                className="icon-button"
                aria-label={`编辑${task.name}`}
                disabled={task.status === 'ARCHIVED'}
                title={task.status === 'ARCHIVED' ? '归档任务不可编辑' : undefined}
                onClick={() => {
                  setActionMessage('');
                  setEditingTask(task);
                }}
              >
                <Pencil size={17} />
              </button>
            </article>
          ))}
          {tasks.length === 0 && (
            <EmptyState title="当前筛选下没有任务" detail="调整筛选条件或创建一项新任务。" />
          )}
        </div>
      </Panel>
      {open && (
        <Modal title="创建家庭任务" onClose={() => setOpen(false)}>
          <form className="space-y-4" onSubmit={createTask}>
            <label className="field-label">
              任务名称
              <input
                className="field"
                name="name"
                required
                maxLength={80}
                placeholder="例如：每天阅读 30 分钟"
              />
            </label>
            <label className="field-label">
              任务说明
              <textarea className="field min-h-20 py-3" name="description" maxLength={1000} />
            </label>
            <div className="form-grid">
              <label className="field-label">
                任务类型
                <select className="field" name="task_type_id">
                  {types.data.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                分配孩子
                <select className="field" name="child_id">
                  {children.data.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.nickname}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                打卡方式
                <select className="field" name="check_type">
                  <option value="TICK">勾选</option>
                  <option value="TEXT">文字</option>
                  <option value="PHOTO">照片</option>
                </select>
              </label>
              <label className="field-label">
                验收方式
                <select className="field" name="verify_mode">
                  <option value="AUTO">自动验收</option>
                  <option value="MANUAL">人工审核</option>
                </select>
              </label>
              <label className="field-label">
                基础积分
                <input
                  className="field"
                  name="base_points"
                  type="number"
                  min="1"
                  max="10000"
                  defaultValue="10"
                  required
                />
              </label>
            </div>
            <button className="primary-button w-full" type="submit">
              创建并启用
            </button>
          </form>
        </Modal>
      )}
      {editingTask && (
        <Modal title="编辑家庭任务" onClose={() => setEditingTask(null)}>
          <form className="space-y-4" onSubmit={updateTask}>
            <label className="field-label">
              任务名称
              <input
                className="field"
                name="name"
                required
                maxLength={120}
                defaultValue={editingTask.name}
              />
            </label>
            <label className="field-label">
              任务说明
              <textarea
                className="field min-h-20 py-3"
                name="description"
                maxLength={10000}
                defaultValue={editingTask.description ?? ''}
              />
            </label>
            <div className="form-grid">
              <label className="field-label">
                任务类型
                <select
                  className="field"
                  name="task_type_id"
                  defaultValue={editingTask.task_type_id}
                >
                  {types.data.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                打卡方式
                <select className="field" name="check_type" defaultValue={editingTask.check_type}>
                  <option value="TICK">勾选</option>
                  <option value="TEXT">文字</option>
                  <option value="PHOTO">照片</option>
                  <option value="VIDEO">视频</option>
                  <option value="MIXED">混合</option>
                </select>
              </label>
              <label className="field-label">
                验收方式
                <select className="field" name="verify_mode" defaultValue={editingTask.verify_mode}>
                  <option value="AUTO">自动验收</option>
                  <option value="MANUAL">人工审核</option>
                </select>
              </label>
              <label className="field-label">
                基础积分
                <input
                  className="field"
                  name="base_points"
                  type="number"
                  min="1"
                  max="10000"
                  defaultValue={editingTask.base_points}
                  required
                />
              </label>
            </div>
            {actionMessage && (
              <p className="notice text-red" role="alert">
                {actionMessage}
              </p>
            )}
            <button className="primary-button w-full" type="submit">
              保存修改
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

function ReviewMedia({ media }: { media: PendingReview['media'][number] }) {
  const [url, setUrl] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

  async function loadUrl() {
    setState('loading');
    try {
      const result = await parentApi<{ url: string }>(`/media/${media.id}/access-url`);
      setUrl(result.url);
      setState('idle');
    } catch {
      setState('error');
    }
  }

  if (url) {
    return (
      <a className="secondary-button" href={url} target="_blank" rel="noreferrer">
        <ImageIcon size={15} />
        打开{media.type === 'IMAGE' ? '图片' : media.type === 'VIDEO' ? '视频' : '音频'}凭证
      </a>
    );
  }
  return (
    <button className="secondary-button" disabled={state === 'loading'} onClick={loadUrl}>
      <ImageIcon size={15} />
      {state === 'loading' ? '读取凭证中' : state === 'error' ? '重试凭证' : '查看凭证'}
    </button>
  );
}

function ReviewsPage() {
  const reviews = useApiData<PendingReview[]>('/family/submission-reviews/pending', 'reviews', []);
  const [busyTarget, setBusyTarget] = useState('');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [actionMessage, setActionMessage] = useState('');

  async function submitReview(item: PendingReview, status: 'APPROVED' | 'REJECTED') {
    const reason = reasons[item.target_id]?.trim();
    if (status === 'REJECTED' && !reason) {
      setActionMessage('打回前请填写原因。');
      return;
    }
    const request = buildSubmissionReviewRequest(item, status, reason);
    setBusyTarget(item.target_id);
    setActionMessage('');
    let submitted = false;
    try {
      await parentApi(request.path, {
        method: 'POST',
        headers: { 'Idempotency-Key': request.idempotencyKey },
        body: JSON.stringify(request.body),
      });
      submitted = true;
      await reviews.refresh();
      setActionMessage(status === 'APPROVED' ? '审核通过，积分已按规则处理。' : '已打回提交。');
    } catch {
      setActionMessage(
        submitted ? '审核已提交，队列刷新失败，请刷新页面确认。' : '审核失败，当前记录已保留。',
      );
    } finally {
      setBusyTarget('');
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="及时回应每一次认真"
        title="打卡审核"
        description="查看凭证、填写反馈，并在超时前完成审核。"
        state={reviews.state}
      />
      <div className="notice">
        <Clock3 size={20} />
        <span>待审提交按时间排列；家庭审核超时规则会继续自动处理到期记录。</span>
      </div>
      {actionMessage && (
        <p className="notice mt-4" role="alert">
          {actionMessage}
        </p>
      )}
      <Panel className="mt-5">
        <SectionTitle>待审核提交</SectionTitle>
        {reviews.state === 'loading' && (
          <EmptyState title="正在读取待审核提交" detail="正在同步当前家庭的真实审核队列。" />
        )}
        {reviews.state === 'error' && reviews.data.length === 0 && (
          <EmptyState title="审核队列读取失败" detail="请刷新页面后重试。" icon={<CloudOff />} />
        )}
        {reviews.state === 'empty' && (
          <EmptyState
            title="暂无待审核打卡"
            detail="孩子提交需要人工验收的任务后会显示在这里。"
            icon={<CheckCircle2 size={30} />}
          />
        )}
        <div className="space-y-4">
          {reviews.data.map((item) => {
            const busy = busyTarget === item.target_id;
            return (
              <article className="soft-card" key={`${item.target_type}:${item.target_id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-lg text-brown">{item.task.name}</h3>
                      <span className="tag tag-orange">
                        {item.target_type === 'CHECK_IN' ? '单人打卡' : '协作提交'}
                      </span>
                    </div>
                    <p className="mt-1 text-caption font-bold text-brown-light">
                      {item.child.nickname} · {new Date(item.submitted_at).toLocaleString('zh-CN')}
                    </p>
                  </div>
                  <span className="status-chip bg-orange/10 text-orange-dark">等待审核</span>
                </div>
                <p className="mt-4 whitespace-pre-wrap rounded-card bg-white/70 p-4 font-semibold text-brown">
                  {item.content_text ?? '本次提交没有文字说明。'}
                </p>
                {item.media.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2" aria-label="提交凭证">
                    {item.media.map((media) => (
                      <ReviewMedia key={media.id} media={media} />
                    ))}
                  </div>
                )}
                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
                  <label className="field-label">
                    打回原因
                    <input
                      className="field"
                      value={reasons[item.target_id] ?? ''}
                      maxLength={2000}
                      placeholder="打回时必填，例如：请补充清晰照片"
                      onChange={(event) =>
                        setReasons((current) => ({
                          ...current,
                          [item.target_id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => submitReview(item, 'REJECTED')}
                  >
                    <X size={17} />
                    打回
                  </button>
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() => submitReview(item, 'APPROVED')}
                  >
                    <Check size={17} />
                    {busy ? '处理中' : '通过并发分'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </Panel>
    </>
  );
}

function RewardsPage() {
  const rewards = useApiData<Reward[]>('/rewards', 'rewards', []);
  const redemptions = useApiData<Redemption[]>('/redemptions', 'redemptions', []);
  const wishes = useApiData<Wish[]>('/wishes', 'wishes', []);
  const [open, setOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState('');

  async function createReward(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionMessage('');
    const form = new FormData(event.currentTarget);
    const draft = {
      name: String(form.get('name')),
      description: String(form.get('description')),
      points_cost: Number(form.get('points_cost')),
      type: String(form.get('type')),
      stock_total: form.get('stock_total') ? Number(form.get('stock_total')) : null,
      status: 'ACTIVE' as const,
    };
    try {
      const data = await parentApi<{ reward: Reward }>('/rewards', {
        method: 'POST',
        body: JSON.stringify(draft),
      });
      rewards.setData((items) => [data.reward, ...items]);
      setOpen(false);
    } catch {
      setActionMessage('奖励创建失败，请检查输入后重试。');
    }
  }

  async function advanceRedemption(item: Redemption) {
    setActionMessage('');
    const action = item.status === 'PENDING' ? 'approve' : 'fulfill';
    try {
      const data = await parentApi<{ redemption: Redemption }>(
        `/redemptions/${item.id}/${action}`,
        { method: 'POST' },
      );
      redemptions.setData((items) =>
        items.map((current) => (current.id === item.id ? data.redemption : current)),
      );
    } catch {
      setActionMessage('兑换状态更新失败，请刷新后重试。');
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="努力有回响，期待有着落"
        title="奖励管理"
        description="集中处理兑换、奖励库存和孩子的愿望。"
        state={rewards.state}
        action={
          <button className="primary-button" onClick={() => setOpen(true)}>
            <Plus size={17} />
            新增奖励
          </button>
        }
      />
      {actionMessage && (
        <p className="notice mb-4 text-red" role="alert">
          {actionMessage}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-[1fr_1.5fr]">
        <Panel>
          <SectionTitle>兑换审批</SectionTitle>
          {redemptions.data.length === 0 ? (
            <EmptyState
              title="暂无待审批兑换"
              detail="≤ 30 星的兑换会自动进入待兑现。"
              icon={<PackageCheck size={30} />}
            />
          ) : (
            redemptions.data.map((item) => (
              <div className="list-row" key={item.id}>
                <Gift />
                <span className="flex-1 font-extrabold">兑换 {item.points_spent} 星</span>
                <span className="tag tag-orange">{item.status}</span>
                {(item.status === 'PENDING' || item.status === 'APPROVED') && (
                  <button className="secondary-button" onClick={() => advanceRedemption(item)}>
                    {item.status === 'PENDING' ? '批准' : '确认兑现'}
                  </button>
                )}
              </div>
            ))
          )}
        </Panel>
        <Panel>
          <SectionTitle>奖励池</SectionTitle>
          {rewards.data.length === 0 ? (
            <EmptyState title="奖励池还是空的" detail="创建第一个家庭奖励后会显示在这里。" />
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {rewards.data.map((reward) => (
                <article className="soft-card" key={reward.id}>
                  <span className="metric-icon mb-3">
                    <Gift />
                  </span>
                  <h3 className="font-extrabold">{reward.name}</h3>
                  <p className="mt-1 min-h-9 text-caption font-bold text-brown-light">
                    {reward.description}
                  </p>
                  <div className="mt-4 flex items-end justify-between">
                    <strong className="font-display text-title text-orange">
                      {reward.points_cost} 星
                    </strong>
                    <span className="tag">
                      {reward.stock_available === null ? '不限量' : `余 ${reward.stock_available}`}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Panel>
      </div>
      <Panel className="mt-5">
        <SectionTitle>许愿墙</SectionTitle>
        {wishes.data.length === 0 ? (
          <EmptyState
            title="还没有新的愿望"
            detail="孩子创建愿望后，家长可一键采纳为正式奖励。"
            icon={<Heart size={30} />}
          />
        ) : (
          wishes.data.map((wish) => (
            <div className="list-row" key={wish.id}>
              <Heart className="text-pink-dark" />
              <div className="flex-1">
                <strong>{wish.title}</strong>
                <Progress
                  value={Math.round(wish.progress.ratio * 100)}
                  label={`${wish.progress.points} / ${wish.target_points} 星`}
                />
              </div>
              <button className="secondary-button">采纳</button>
            </div>
          ))
        )}
      </Panel>
      {open && (
        <Modal title="新增奖励" onClose={() => setOpen(false)}>
          <form className="space-y-4" onSubmit={createReward}>
            <label className="field-label">
              奖励名称
              <input className="field" name="name" required maxLength={100} />
            </label>
            <label className="field-label">
              奖励说明
              <textarea className="field min-h-20 py-3" name="description" maxLength={1000} />
            </label>
            <div className="form-grid">
              <label className="field-label">
                所需积分
                <input className="field" name="points_cost" type="number" min="1" required />
              </label>
              <label className="field-label">
                奖励类型
                <select className="field" name="type">
                  <option value="PRIVILEGE">特权</option>
                  <option value="PHYSICAL">实物</option>
                  <option value="EXPERIENCE">体验</option>
                  <option value="CUSTOM">自定义</option>
                </select>
              </label>
              <label className="field-label">
                库存（留空不限量）
                <input className="field" name="stock_total" type="number" min="0" />
              </label>
            </div>
            <button className="primary-button w-full" type="submit">
              保存并上架
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

function LevelsPage() {
  const children = useApiData<Child[]>('/family/children', 'children', []);
  const stages = ['启程', '萌芽', '进阶', '闪耀', '黑铁', '青铜', '白银', '黄金', '铂金', '钻石'];
  return (
    <>
      <PageHeader
        eyebrow="看见长期积累的力量"
        title="等级与成就"
        description="查看孩子当前等级、20 级成长阶梯与等级权益。"
        state={children.state}
      />
      <div className="notice">
        <Info size={20} />
        <span>当前 API 支持逐个孩子读取等级视图；完整等级配置与奖励发放接口将在后续补齐。</span>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {children.data.map((child) => (
          <Panel key={child.id}>
            <div className="flex items-center gap-3">
              <span className="avatar">{child.nickname.slice(-1)}</span>
              <div>
                <strong>{child.nickname}</strong>
                <p className="text-caption font-bold text-brown-light">
                  {child.grade ?? '未设置年级'} · 等级视图待加载
                </p>
              </div>
            </div>
          </Panel>
        ))}
        {children.data.length === 0 && (
          <Panel className="md:col-span-3">
            <EmptyState title="还没有孩子档案" detail="创建孩子后即可查看等级成长。" />
          </Panel>
        )}
      </div>
      <Panel className="mt-5">
        <SectionTitle>20 级成长阶梯</SectionTitle>
        <div className="level-grid">
          {Array.from({ length: 20 }, (_, index) => (
            <article className={`level-tile ${index < 6 ? 'level-reached' : ''}`} key={index}>
              <span className="grid size-9 place-items-center rounded-full bg-white/70">
                <Trophy size={18} />
              </span>
              <div>
                <strong>Lv.{index + 1}</strong>
                <p>{stages[Math.min(Math.floor(index / 2), stages.length - 1)]}</p>
              </div>
            </article>
          ))}
        </div>
      </Panel>
      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <Panel>
          <SectionTitle>兑换折扣</SectionTitle>
          <p className="font-display text-metric text-orange">最高 20%</p>
          <p className="text-caption font-bold text-brown-light">随等级自动生效</p>
        </Panel>
        <Panel>
          <SectionTitle>免审批额度</SectionTitle>
          <p className="font-display text-metric text-leaf-dark">等级加成</p>
          <p className="text-caption font-bold text-brown-light">与家庭额度取较高值</p>
        </Panel>
        <Panel>
          <SectionTitle>许愿槽位</SectionTitle>
          <p className="font-display text-metric text-blue">逐级解锁</p>
          <p className="text-caption font-bold text-brown-light">支持更多长期目标</p>
        </Panel>
      </div>
    </>
  );
}

function StatsPage() {
  return (
    <>
      <PageHeader
        eyebrow="从趋势中找到陪伴重点"
        title="数据面板"
        description="按孩子、任务和时间观察家庭成长节奏。"
      />
      <div className="notice">
        <Info size={20} />
        <span>MVP 聚合统计接口尚待建设。</span>
      </div>
      <Panel className="mt-5">
        <EmptyState
          title="统计数据接口待接入"
          detail="真实打卡率、积分趋势和任务洞察将在聚合接口完成后展示。"
          icon={<Target size={30} />}
        />
      </Panel>
    </>
  );
}

function RecordsPage() {
  return (
    <>
      <PageHeader
        eyebrow="把成长留成可回看的故事"
        title="成长记录"
        description="未来将在这里汇集照片时间线、习惯追踪和学习笔记。"
      />
      <Panel className="overflow-hidden p-0">
        <div className="restricted-hero">
          <BookOpen size={46} />
          <span className="tag bg-white/80">Phase 1 受限页面</span>
          <h2 className="font-display text-page">记录能力正在生长</h2>
          <p>当前阶段保留完整响应式骨架。成长记录列表、媒体关联和学习笔记 API 完成后即可启用。</p>
        </div>
        <div className="grid gap-4 p-6 md:grid-cols-3 mobile:p-4">
          <article className="placeholder-card">
            <ImageIcon />
            <strong>相册时间线</strong>
            <p>自动沉淀打卡照片与家庭瞬间</p>
          </article>
          <article className="placeholder-card">
            <TrendingUp />
            <strong>习惯追踪</strong>
            <p>按周与月对比长期变化</p>
          </article>
          <article className="placeholder-card">
            <BookOpen />
            <strong>学习笔记</strong>
            <p>记录值得保存的学习片段</p>
          </article>
        </div>
      </Panel>
    </>
  );
}

function FamilyPage() {
  const children = useApiData<Child[]>('/family/children', 'children', []);
  const [open, setOpen] = useState(false);
  const [familyCode, setFamilyCode] = useState('');
  const [familyCodeState, setFamilyCodeState] = useState<FamilyCodeLoadState>('loading');
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [actionMessage, setActionMessage] = useState('');

  useEffect(() => {
    let active = true;
    authApi<SessionIdentity>('/auth/session')
      .then((session) => {
        if (!active) return;
        if (session.role !== 'parent') throw new Error('Parent session required.');
        setFamilyCode(session.family_code);
        setFamilyCodeState('ready');
      })
      .catch(() => active && setFamilyCodeState('error'));
    return () => {
      active = false;
    };
  }, []);

  async function copyFamilyCode() {
    try {
      await copyTextToClipboard(familyCode);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  }

  async function createChild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionMessage('');
    const form = new FormData(event.currentTarget);
    const draft = {
      nickname: String(form.get('nickname')),
      credential_type: 'pin',
      credential: String(form.get('credential')),
      gender: String(form.get('gender')),
      grade: String(form.get('grade')) || null,
    };
    try {
      const data = await parentApi<{ child: Child }>('/family/children', {
        method: 'POST',
        body: JSON.stringify(draft),
      });
      children.setData((items) => [...items, data.child]);
      setOpen(false);
    } catch {
      setActionMessage('孩子档案创建失败，请检查信息后重试。');
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="一个家庭，共同守护"
        title="家庭成员"
        description="管理孩子档案、双家长协作和家庭基础信息。"
        state={children.state}
        action={
          <button className="primary-button" onClick={() => setOpen(true)}>
            <UserPlus size={17} />
            添加孩子
          </button>
        }
      />
      {actionMessage && (
        <p className="notice mb-4 text-red" role="alert">
          {actionMessage}
        </p>
      )}
      <FamilyCodeCard
        code={familyCode}
        copyState={copyState}
        state={familyCodeState}
        onCopy={copyFamilyCode}
      />
      <Panel>
        <SectionTitle>孩子档案</SectionTitle>
        <div className="grid gap-4 md:grid-cols-3">
          {children.data.map((child) => (
            <article className="member-card" key={child.id}>
              <span className="avatar avatar-lg">{child.nickname.slice(-1)}</span>
              <div className="flex-1">
                <h3 className="font-display text-title">{child.nickname}</h3>
                <p className="text-caption font-bold text-brown-light">
                  {child.grade ?? '未设置年级'} · {child.gender === 'female' ? '女孩' : '男孩'}
                </p>
                <button className="mt-3 text-button">
                  <Pencil size={15} />
                  编辑档案
                </button>
              </div>
            </article>
          ))}
          {children.data.length === 0 && (
            <EmptyState title="还没有孩子档案" detail="使用右上角按钮创建第一个孩子档案。" />
          )}
        </div>
      </Panel>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Panel>
          <SectionTitle>家长与共同管理</SectionTitle>
          <EmptyState
            title="家长列表接口待接入"
            detail="共同管理者信息和邀请状态将在家庭资料读取接口完成后展示。"
            icon={<Mail size={30} />}
          />
        </Panel>
        <Panel>
          <SectionTitle>家庭资料</SectionTitle>
          <EmptyState
            title="家庭资料接口待接入"
            detail="家庭名称和时区会在真实读取接口开放后提供编辑。"
          />
        </Panel>
      </div>
      {open && (
        <Modal title="添加孩子" onClose={() => setOpen(false)}>
          <form className="space-y-4" onSubmit={createChild}>
            <label className="field-label">
              昵称
              <input className="field" name="nickname" required placeholder="孩子昵称" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="field-label">
                性别
                <select className="field" name="gender">
                  <option value="female">女孩</option>
                  <option value="male">男孩</option>
                </select>
              </label>
              <label className="field-label">
                年级
                <input className="field" name="grade" placeholder="例如：三年级" />
              </label>
            </div>
            <label className="field-label">
              登录 PIN
              <input
                className="field"
                name="credential"
                inputMode="numeric"
                pattern="[0-9]{4,6}"
                minLength={4}
                maxLength={6}
                required
                placeholder="4-6 位数字"
              />
            </label>
            <button className="primary-button w-full justify-center" type="submit">
              创建孩子档案
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function FamilyCodeCard({
  code,
  copyState,
  state,
  onCopy,
}: {
  code: string;
  copyState: CopyState;
  state: FamilyCodeLoadState;
  onCopy: () => void;
}) {
  if (state === 'loading') {
    return (
      <Panel className="mb-5" aria-live="polite">
        <div className="flex items-center gap-3 text-brown-light" role="status">
          <span className="loading-dot" />
          <strong>正在读取家庭码...</strong>
        </div>
      </Panel>
    );
  }

  if (state === 'error') {
    return (
      <Panel className="mb-5">
        <div className="flex items-start gap-3 text-brown-light" role="alert">
          <CloudOff className="mt-0.5 shrink-0" size={21} />
          <div>
            <strong className="text-brown">家庭码暂时无法读取</strong>
            <p className="mt-1 text-caption font-bold">请刷新页面后重试。</p>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel className="mb-5 overflow-hidden border-leaf/50 bg-gradient-to-r from-leaf-light/65 via-white to-sky/15">
      <div className="flex items-center gap-4 mobile:items-start">
        <span className="metric-icon mt-0.5">
          <KeyRound size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">孩子登录家庭码</p>
          <output
            aria-label="当前家庭码"
            className="block break-all font-display text-[clamp(1.6rem,5vw,2.35rem)] tracking-[0.16em] text-brown"
          >
            {code}
          </output>
          <p className="mt-2 max-w-2xl text-caption font-bold text-brown-light">
            孩子在登录页输入这 6 位数字家庭码，选择自己的头像并输入 PIN，即可进入成长空间。
          </p>
          {copyState !== 'idle' && (
            <p
              className={`mt-2 text-caption font-extrabold ${copyState === 'copied' ? 'text-leaf-dark' : 'text-red'}`}
              role={copyState === 'copied' ? 'status' : 'alert'}
            >
              {copyState === 'copied' ? '家庭码已复制' : '复制失败，请手动选择家庭码'}
            </p>
          )}
        </div>
        <button className="secondary-button shrink-0 mobile:px-3" type="button" onClick={onCopy}>
          {copyState === 'copied' ? <Check size={17} /> : <Copy size={17} />}
          {copyState === 'copied' ? '已复制' : '复制'}
        </button>
      </div>
    </Panel>
  );
}

function SettingsPage() {
  const resource = useApiData<FamilySettings | null>('/family/settings', 'settings', null);
  const [settings, setSettings] = useState(defaultSettings);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (resource.data) setSettings(resource.data);
  }, [resource.data]);
  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage('保存中…');
    try {
      const data = await parentApi<{ settings: FamilySettings }>('/family/settings', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });
      setSettings(data.settings);
      setMessage('规则已保存');
    } catch {
      setMessage('保存失败，请刷新后重试');
    }
  }
  if (!resource.data) {
    return (
      <>
        <PageHeader
          eyebrow="让规则适合自己的家庭"
          title="设置"
          description="维护打卡、审核、兑换和连续奖励规则。"
          state={resource.state}
        />
        <Panel>
          <EmptyState
            title={resource.state === 'error' ? '家庭规则读取失败' : '正在读取家庭规则'}
            detail={resource.state === 'error' ? '请刷新页面后重试。' : '规则加载完成后即可编辑。'}
          />
        </Panel>
      </>
    );
  }
  return (
    <>
      <PageHeader
        eyebrow="让规则适合自己的家庭"
        title="设置"
        description="维护打卡、审核、兑换和连续奖励规则。"
        state={resource.state}
      />
      <form onSubmit={save}>
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel>
            <SectionTitle>打卡与审核规则</SectionTitle>
            <div className="form-grid">
              <label className="field-label">
                每日截止时间
                <input
                  className="field"
                  type="time"
                  value={settings.check_in_deadline}
                  onChange={(e) => setSettings({ ...settings, check_in_deadline: e.target.value })}
                />
              </label>
              <label className="field-label">
                允许补打天数
                <input
                  className="field"
                  type="number"
                  min="0"
                  value={settings.makeup_days}
                  onChange={(e) =>
                    setSettings({ ...settings, makeup_days: Number(e.target.value) })
                  }
                />
              </label>
              <label className="field-label">
                审核超时小时
                <input
                  className="field"
                  type="number"
                  min="0"
                  value={settings.review_timeout_hours}
                  onChange={(e) =>
                    setSettings({ ...settings, review_timeout_hours: Number(e.target.value) })
                  }
                />
              </label>
              <label className="field-label">
                兑换免审批额度
                <input
                  className="field"
                  type="number"
                  min="0"
                  value={settings.auto_approve_quota}
                  onChange={(e) =>
                    setSettings({ ...settings, auto_approve_quota: Number(e.target.value) })
                  }
                />
              </label>
            </div>
          </Panel>
          <Panel>
            <SectionTitle>Streak 连续倍率</SectionTitle>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {settings.streak_multipliers.map((item, index) => (
                <label className="stepper" key={item.days}>
                  <span>{item.days} 天</span>
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    value={item.multiplier}
                    onChange={(e) => {
                      const streak = [...settings.streak_multipliers];
                      streak[index] = { ...item, multiplier: Number(e.target.value) };
                      setSettings({ ...settings, streak_multipliers: streak });
                    }}
                  />
                  <small>倍</small>
                </label>
              ))}
            </div>
          </Panel>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Panel>
            <SectionTitle>家庭集成</SectionTitle>
            <ComingSoonRow
              icon={<Mail />}
              title="家庭邮件"
              detail="凭证状态、维护与连接测试接口待注册"
            />
            <ComingSoonRow icon={<Camera />} title="腾讯云 COS" detail="凭证仅由家庭创建者维护" />
          </Panel>
          <Panel>
            <SectionTitle>更多能力</SectionTitle>
            <ComingSoonRow icon={<Bell />} title="通知偏好与免打扰" detail="即将推出" />
            <ComingSoonRow icon={<ShieldCheck />} title="PWA 与动态模块开关" detail="即将推出" />
          </Panel>
        </div>
        <div className="mt-5 flex items-center justify-end gap-3">
          <span className="text-caption font-extrabold text-leaf-dark" role="status">
            {message}
          </span>
          <button className="primary-button" type="submit">
            <Save size={17} />
            保存家庭规则
          </button>
        </div>
      </form>
    </>
  );
}

function ComingSoonRow({
  icon,
  title,
  detail,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="list-row">
      <span className="metric-icon">{icon}</span>
      <div className="flex-1">
        <strong>{title}</strong>
        <p className="text-caption font-bold text-brown-light">{detail}</p>
      </div>
      <span className="tag">即将推出</span>
    </div>
  );
}
function Modal({
  children,
  title,
  onClose,
}: {
  children: ReactNode;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id="modal-title" className="font-display text-title">
            {title}
          </h2>
          <button className="icon-button" onClick={onClose} aria-label="关闭弹窗">
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

const pages: Record<ParentSection, () => ReactNode> = {
  dashboard: DashboardPage,
  tasks: TasksPage,
  reviews: ReviewsPage,
  rewards: RewardsPage,
  levels: LevelsPage,
  stats: StatsPage,
  records: RecordsPage,
  family: FamilyPage,
  settings: SettingsPage,
};

export function ParentPortal({ section }: { section: ParentSection }) {
  const Page = pages[section];
  return (
    <ParentShell section={section}>
      <Page />
    </ParentShell>
  );
}
