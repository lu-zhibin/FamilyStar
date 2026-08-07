'use client';

import {
  Bell,
  BookOpen,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
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
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  Trophy,
  UserPlus,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import NextImage from 'next/image';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { loadedState, readApiField, type ApiLoadState } from '../lib/api-resource';
import { authApi, type SessionIdentity } from '../lib/auth';
import {
  buildChildCredentialPatch,
  buildChildProfilePatch,
  buildCosIntegrationPayload,
  buildEmailIntegrationPayload,
  buildFamilyProfilePatch,
  buildReviewHistoryPath,
  buildRewardPayload,
  buildSubmissionReviewRequest,
  buildTaskDraft,
  buildTaskPatch,
  copyTextToClipboard,
  familyNaturalDate,
  formatFrequency,
  parentApi,
  ParentApiError,
  type CosIntegrationDraft,
  type EmailIntegrationDraft,
  type FamilyProfile,
  type IntegrationResource,
  type IntegrationType,
  type ParentChild,
  type ParentReward,
  type ParentSection,
  type ParentTask,
  type ParentTaskType,
  type ReviewTargetType,
  type TaskAssignment,
  type TaskCollaborationMode,
  type TaskFrequency,
} from '../lib/parent-portal';
import { loadTimelineMediaUrls } from '../lib/growth-records';
import { uploadMediaFile } from '../lib/media-upload';
import {
  activeWishes,
  buildWishAdoptionPayload,
  redemptionStatusLabel,
  type RewardWorkflowRedemption,
  type RewardWorkflowWish,
} from '../lib/reward-workflow';
import { ParentGrowthRecordsSection } from './growth-records';
import { ParentAnalyticsSection, ParentDashboardSection } from './parent-read-models';
import { ParentShell } from './parent-shell';

type LoadState = ApiLoadState;
type FamilyCodeLoadState = 'loading' | 'ready' | 'error';
type CopyState = 'idle' | 'copied' | 'error';
type FrequencyKind = 'daily' | 'weekly_count' | 'weekdays' | 'date_range';
type Child = ParentChild;
type Task = ParentTask;
type TaskType = ParentTaskType;
type Redemption = RewardWorkflowRedemption;
type Wish = RewardWorkflowWish;
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
  review_deadline_at: string | null;
  is_overdue: boolean;
};
type ReviewHistory = {
  id: string;
  target_type: ReviewTargetType;
  target_id: string;
  attempt_id: string;
  status: 'APPROVED' | 'REJECTED';
  source: 'PARENT' | 'TIMEOUT';
  reason: string | null;
  reviewer_id: string | null;
  reviewed_at: string;
  task: { id: string; name: string };
  child: { id: string; nickname: string };
};
type RetainedConflict = Readonly<{
  item: PendingReview;
  review: ReviewHistory | null;
}>;

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
  async function refresh(): Promise<T> {
    try {
      const payload = await parentApi<Record<string, unknown>>(path);
      const value = readApiField<T>(payload, key);
      setData(value);
      setState(loadedState(value));
      return value;
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
  return <ParentDashboardSection />;
}

export function FrequencyFields({
  kind,
  onKindChange,
  naturalDate,
  value,
}: {
  kind: FrequencyKind;
  onKindChange: (kind: FrequencyKind) => void;
  naturalDate: string;
  value?: TaskFrequency;
}) {
  return (
    <>
      <label className="field-label">
        任务频率
        <select
          className="field"
          name="frequency_kind"
          value={kind}
          onChange={(event) => onKindChange(event.target.value as FrequencyKind)}
        >
          <option value="daily">每天</option>
          <option value="weekly_count">每周 N 次</option>
          <option value="weekdays">指定星期</option>
          <option value="date_range">日期范围</option>
        </select>
      </label>
      {kind === 'weekly_count' && (
        <label className="field-label">
          每周次数
          <input
            className="field"
            name="frequency_count"
            type="number"
            min="1"
            max="7"
            defaultValue={value?.kind === 'weekly_count' ? value.count : 1}
            required
          />
        </label>
      )}
      {kind === 'weekdays' && (
        <fieldset className="field-label">
          <legend>执行星期</legend>
          <div className="flex flex-wrap gap-3 pt-2">
            {['一', '二', '三', '四', '五', '六', '日'].map((label, index) => (
              <label key={label} className="flex items-center gap-1.5 text-sm">
                <input
                  name="frequency_weekdays"
                  type="checkbox"
                  value={index + 1}
                  defaultChecked={value?.kind === 'weekdays' && value.weekdays.includes(index + 1)}
                />
                周{label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {kind === 'date_range' && (
        <>
          <label className="field-label">
            开始日期
            <input
              className="field"
              name="frequency_start_date"
              type="date"
              defaultValue={value?.kind === 'date_range' ? value.start_date : naturalDate}
              required
            />
          </label>
          <label className="field-label">
            结束日期
            <input
              className="field"
              name="frequency_end_date"
              type="date"
              defaultValue={value?.kind === 'date_range' ? value.end_date : naturalDate}
              required
            />
          </label>
        </>
      )}
    </>
  );
}

export function TaskAssigneeFields({
  mode,
  assignees,
  naturalDate = new Date().toISOString().slice(0, 10),
  assignments = [],
}: {
  mode: TaskCollaborationMode;
  assignees: ReadonlyArray<Pick<Child, 'id' | 'nickname'>>;
  naturalDate?: string;
  assignments?: readonly TaskAssignment[];
}) {
  const initialIds = assignments.length
    ? assignments.map(({ child_id }) => child_id)
    : assignees[0]
      ? [assignees[0].id]
      : [];
  const [selectedIds, setSelectedIds] = useState(initialIds);
  const [frequencyKinds, setFrequencyKinds] = useState<Record<string, string>>(
    Object.fromEntries(
      assignments.map((assignment) => [
        assignment.child_id,
        assignment.custom_frequency?.kind ?? '',
      ]),
    ),
  );
  const assignmentByChild = new Map(
    assignments.map((assignment) => [assignment.child_id, assignment]),
  );

  function toggleChild(childId: string, selected: boolean) {
    setSelectedIds((current) =>
      selected ? [...new Set([...current, childId])] : current.filter((id) => id !== childId),
    );
  }

  return (
    <fieldset className="field-label md:col-span-2">
      <legend>参与孩子</legend>
      <p className="mt-1 font-semibold text-brown-light">
        {mode === 'COLLAB'
          ? '至少选择两名孩子共同完成任务'
          : '可选择多名孩子，每名孩子独立完成任务'}
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {assignees.map((child) => (
          <label
            key={child.id}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-btn border border-wood bg-cream px-3 text-body font-bold text-brown transition focus-within:border-leaf focus-within:ring-2 focus-within:ring-leaf"
          >
            <input
              name="child_id"
              type="checkbox"
              value={child.id}
              checked={selectedIds.includes(child.id)}
              onChange={(event) => toggleChild(child.id, event.target.checked)}
            />
            {child.nickname}
          </label>
        ))}
      </div>
      <div className="mt-3 space-y-3">
        {assignees
          .filter(({ id }) => selectedIds.includes(id))
          .map((child) => {
            const assignment = assignmentByChild.get(child.id);
            const suffix = `:${child.id}`;
            const customFrequency = assignment?.custom_frequency;
            const frequencyKind = frequencyKinds[child.id] ?? customFrequency?.kind ?? '';
            return (
              <section key={child.id} className="rounded-card border border-wood bg-paper p-3">
                <strong>{child.nickname}的独立配置</strong>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="field-label">
                    自定义积分
                    <input
                      className="field"
                      name={`custom_points${suffix}`}
                      type="number"
                      min="1"
                      defaultValue={assignment?.custom_points}
                      placeholder="使用基础积分"
                    />
                  </label>
                  <label className="field-label">
                    自定义频率
                    <select
                      className="field"
                      name={`custom_frequency_kind${suffix}`}
                      value={frequencyKind}
                      onChange={(event) =>
                        setFrequencyKinds((current) => ({
                          ...current,
                          [child.id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">使用任务频率</option>
                      <option value="daily">每天</option>
                      <option value="weekly_count">每周次数</option>
                      <option value="weekdays">指定星期</option>
                      <option value="date_range">日期范围</option>
                    </select>
                  </label>
                  {frequencyKind === 'weekly_count' && (
                    <label className="field-label">
                      每周次数
                      <input
                        className="field"
                        name={`custom_frequency_count${suffix}`}
                        type="number"
                        min="1"
                        max="7"
                        defaultValue={
                          customFrequency?.kind === 'weekly_count' ? customFrequency.count : 1
                        }
                      />
                    </label>
                  )}
                  {frequencyKind === 'weekdays' && (
                    <fieldset className="field-label">
                      <legend>执行星期</legend>
                      <div className="flex flex-wrap gap-2 pt-2">
                        {[1, 2, 3, 4, 5, 6, 7].map((weekday) => (
                          <label key={weekday} className="flex items-center gap-1 text-sm">
                            <input
                              name={`custom_frequency_weekdays${suffix}`}
                              type="checkbox"
                              value={weekday}
                              defaultChecked={
                                customFrequency?.kind === 'weekdays' &&
                                customFrequency.weekdays.includes(weekday)
                              }
                            />
                            {weekday}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  {frequencyKind === 'date_range' && (
                    <>
                      <label className="field-label">
                        频率开始日期
                        <input
                          className="field"
                          name={`custom_frequency_start_date${suffix}`}
                          type="date"
                          defaultValue={
                            customFrequency?.kind === 'date_range'
                              ? customFrequency.start_date
                              : naturalDate
                          }
                        />
                      </label>
                      <label className="field-label">
                        频率结束日期
                        <input
                          className="field"
                          name={`custom_frequency_end_date${suffix}`}
                          type="date"
                          defaultValue={
                            customFrequency?.kind === 'date_range'
                              ? customFrequency.end_date
                              : naturalDate
                          }
                        />
                      </label>
                    </>
                  )}
                  <label className="field-label">
                    自定义打卡方式
                    <select
                      className="field"
                      name={`custom_check_type${suffix}`}
                      defaultValue={assignment?.custom_check_type ?? ''}
                    >
                      <option value="">使用任务设置</option>
                      <option value="TICK">勾选</option>
                      <option value="TEXT">文字</option>
                      <option value="PHOTO">照片</option>
                      <option value="VIDEO">视频</option>
                      <option value="MIXED">混合</option>
                    </select>
                  </label>
                  <label className="field-label">
                    自定义验收方式
                    <select
                      className="field"
                      name={`custom_verify_mode${suffix}`}
                      defaultValue={assignment?.custom_verify_mode ?? ''}
                    >
                      <option value="">使用任务设置</option>
                      <option value="AUTO">自动验收</option>
                      <option value="MANUAL">人工审核</option>
                    </select>
                  </label>
                  <label className="field-label">
                    开始日期
                    <input
                      className="field"
                      name={`start_date${suffix}`}
                      type="date"
                      defaultValue={assignment?.start_date ?? naturalDate}
                      required
                    />
                  </label>
                  <label className="field-label">
                    结束日期
                    <input
                      className="field"
                      name={`end_date${suffix}`}
                      type="date"
                      defaultValue={assignment?.end_date ?? ''}
                    />
                  </label>
                </div>
              </section>
            );
          })}
      </div>
    </fieldset>
  );
}

function TasksPage() {
  const resource = useApiData<Task[]>('/family/tasks', 'tasks', []);
  const types = useApiData<TaskType[]>('/family/task-types', 'task_types', []);
  const children = useApiData<Child[]>('/family/children', 'children', []);
  const profile = useApiData<FamilyProfile | null>('/family/profile', 'profile', null);
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingType, setEditingType] = useState<TaskType | 'create' | null>(null);
  const [createCollaborationMode, setCreateCollaborationMode] =
    useState<TaskCollaborationMode>('SOLO');
  const [editCollaborationMode, setEditCollaborationMode] = useState<TaskCollaborationMode>('SOLO');
  const [createFrequencyKind, setCreateFrequencyKind] = useState<FrequencyKind>('daily');
  const [editFrequencyKind, setEditFrequencyKind] = useState<FrequencyKind>('daily');
  const [actionMessage, setActionMessage] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const tasks = resource.data.filter((task) => filter === 'all' || task.status === filter);
  const naturalDate = profile.data
    ? familyNaturalDate(new Date(), profile.data.time_zone)
    : familyNaturalDate(new Date(), 'Asia/Shanghai');

  async function refreshAuthority() {
    const [tasksResult] = await Promise.allSettled([resource.refresh(), types.refresh()]);
    return tasksResult.status === 'fulfilled' ? tasksResult.value : null;
  }

  function writeError(error: unknown, fallback: string) {
    setActionMessage(
      error instanceof ParentApiError && error.status === 409
        ? `操作冲突：${error.message} 已刷新服务端状态。`
        : fallback,
    );
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyAction) return;
    setActionMessage('');
    let draft: ReturnType<typeof buildTaskDraft>;
    try {
      draft = buildTaskDraft(new FormData(event.currentTarget), naturalDate);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : '任务创建失败，请检查输入后重试。');
      return;
    }

    setBusyAction('create-task');
    try {
      const data = await parentApi<{ task: Task }>('/family/tasks', {
        method: 'POST',
        body: JSON.stringify(draft),
      });
      resource.setData((items) => [data.task, ...items]);
      setOpen(false);
    } catch (error) {
      writeError(error, '任务创建失败，请检查输入后重试。');
      await refreshAuthority();
    } finally {
      setBusyAction('');
    }
  }

  async function updateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTask || busyAction) return;
    setActionMessage('');
    setBusyAction(`task:${editingTask.id}`);
    try {
      const data = await parentApi<{ task: Task }>(`/family/tasks/${editingTask.id}`, {
        method: 'PATCH',
        body: JSON.stringify(buildTaskPatch(new FormData(event.currentTarget), naturalDate)),
      });
      resource.setData((items) =>
        items.map((item) => (item.id === data.task.id ? data.task : item)),
      );
      setEditingTask(null);
    } catch (error) {
      writeError(error, '任务更新失败，请检查输入后重试，服务端状态已刷新。');
      const authoritativeTasks = await refreshAuthority();
      const authoritativeTask = authoritativeTasks?.find(({ id }) => id === editingTask.id);
      if (authoritativeTask) {
        setEditFrequencyKind(authoritativeTask.frequency.kind);
        setEditCollaborationMode(authoritativeTask.collaboration_mode);
        setEditingTask(authoritativeTask);
      }
    } finally {
      setBusyAction('');
    }
  }

  async function setTaskStatus(task: Task, action: 'activate' | 'deactivate' | 'archive') {
    if (busyAction) return;
    if (action === 'archive' && !window.confirm(`确认归档“${task.name}”？归档后只能查看。`)) return;
    setBusyAction(`${action}:${task.id}`);
    setActionMessage('');
    try {
      const data = await parentApi<{ task: Task }>(`/family/tasks/${task.id}/${action}`, {
        method: 'POST',
      });
      resource.setData((items) =>
        items.map((item) => (item.id === data.task.id ? data.task : item)),
      );
    } catch (error) {
      writeError(error, '任务状态更新失败，服务端状态已刷新。');
      await refreshAuthority();
    } finally {
      setBusyAction('');
    }
  }

  async function saveTaskType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingType || busyAction) return;
    const form = new FormData(event.currentTarget);
    const body = {
      name: String(form.get('name') ?? '').trim(),
      icon: String(form.get('icon') ?? '').trim(),
      default_verify_mode: String(form.get('default_verify_mode') ?? 'MANUAL'),
      ...(editingType === 'create'
        ? {
            sort_order: types.data.length
              ? Math.max(...types.data.map(({ sort_order }) => sort_order)) + 1
              : 0,
          }
        : {}),
    };
    setBusyAction('task-type');
    setActionMessage('');
    try {
      if (editingType === 'create') {
        const data = await parentApi<{ task_type: TaskType }>('/family/task-types', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        types.setData((items) => [...items, data.task_type]);
      } else {
        const data = await parentApi<{ task_type: TaskType }>(
          `/family/task-types/${editingType.id}`,
          { method: 'PATCH', body: JSON.stringify(body) },
        );
        types.setData((items) =>
          items.map((item) => (item.id === data.task_type.id ? data.task_type : item)),
        );
      }
      setEditingType(null);
      await types.refresh();
    } catch (error) {
      writeError(error, '任务类型保存失败，服务端状态已刷新。');
      await refreshAuthority();
    } finally {
      setBusyAction('');
    }
  }

  async function moveTaskType(index: number, offset: -1 | 1) {
    const target = types.data[index];
    const neighbor = types.data[index + offset];
    if (!target || !neighbor || busyAction) return;
    setBusyAction(`type-sort:${target.id}`);
    setActionMessage('');
    try {
      await parentApi(`/family/task-types/${target.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ sort_order: neighbor.sort_order }),
      });
      await parentApi(`/family/task-types/${neighbor.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ sort_order: target.sort_order }),
      });
      await types.refresh();
    } catch (error) {
      writeError(error, '任务类型排序失败，服务端状态已刷新。');
      await refreshAuthority();
    } finally {
      setBusyAction('');
    }
  }

  async function deleteTaskType(taskType: TaskType) {
    if (busyAction || !window.confirm(`确认删除任务类型“${taskType.name}”？`)) return;
    setBusyAction(`type-delete:${taskType.id}`);
    setActionMessage('');
    try {
      await parentApi(`/family/task-types/${taskType.id}`, { method: 'DELETE' });
      await types.refresh();
    } catch (error) {
      writeError(error, '该任务类型受保护或仍被任务使用，服务端状态已刷新。');
      await refreshAuthority();
    } finally {
      setBusyAction('');
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
            onClick={() => {
              setActionMessage('');
              setCreateCollaborationMode('SOLO');
              setOpen(true);
            }}
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
        <div className="mb-3 flex items-center justify-between gap-3">
          <SectionTitle>任务类型</SectionTitle>
          <button
            className="secondary-button"
            type="button"
            disabled={Boolean(busyAction)}
            onClick={() => setEditingType('create')}
          >
            <Plus size={16} />
            新建类型
          </button>
        </div>
        <div className="table-list">
          {types.data.map((taskType, index) => (
            <article className="list-row" key={taskType.id}>
              <span className="text-xl" aria-hidden="true">
                {taskType.icon}
              </span>
              <div className="min-w-0 flex-1">
                <strong>{taskType.name}</strong>
                <p className="text-caption font-bold text-brown-light">
                  {taskType.default_verify_mode === 'AUTO' ? '默认自动验收' : '默认人工审核'}
                  {taskType.template_code ? ' · 预设类型' : ' · 自定义类型'}
                </p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label={`上移${taskType.name}`}
                disabled={index === 0 || Boolean(busyAction)}
                onClick={() => void moveTaskType(index, -1)}
              >
                ↑
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label={`下移${taskType.name}`}
                disabled={index === types.data.length - 1 || Boolean(busyAction)}
                onClick={() => void moveTaskType(index, 1)}
              >
                ↓
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label={`编辑类型${taskType.name}`}
                disabled={Boolean(busyAction)}
                onClick={() => setEditingType(taskType)}
              >
                <Pencil size={16} />
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label={`删除类型${taskType.name}`}
                disabled={Boolean(taskType.template_code) || Boolean(busyAction)}
                title={taskType.template_code ? '预设任务类型受保护' : '删除自定义任务类型'}
                onClick={() => void deleteTaskType(taskType)}
              >
                <Trash2 size={16} />
              </button>
            </article>
          ))}
        </div>
      </Panel>
      <div className="h-5" />
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
                  setEditFrequencyKind(task.frequency.kind);
                  setEditCollaborationMode(task.collaboration_mode);
                  setEditingTask(task);
                }}
              >
                <Pencil size={17} />
              </button>
              {task.status === 'ACTIVE' && (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={() => void setTaskStatus(task, 'deactivate')}
                >
                  停用
                </button>
              )}
              {task.status === 'INACTIVE' && (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={() => void setTaskStatus(task, 'activate')}
                >
                  启用
                </button>
              )}
              {task.status !== 'ARCHIVED' && (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={() => void setTaskStatus(task, 'archive')}
                >
                  归档
                </button>
              )}
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
            <label className="field-label">
              提交指南
              <textarea
                className="field min-h-20 py-3"
                name="submission_guide"
                maxLength={10000}
                placeholder="说明提交内容、照片角度或完成标准"
              />
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
                任务模式
                <select
                  className="field"
                  name="collaboration_mode"
                  value={createCollaborationMode}
                  onChange={(event) => {
                    setActionMessage('');
                    setCreateCollaborationMode(event.target.value as TaskCollaborationMode);
                  }}
                >
                  <option value="SOLO">单人任务</option>
                  <option value="COLLAB">协作任务</option>
                </select>
              </label>
              <TaskAssigneeFields
                key={`create:${createCollaborationMode}`}
                mode={createCollaborationMode}
                assignees={children.data}
                naturalDate={naturalDate}
              />
              <FrequencyFields
                kind={createFrequencyKind}
                onKindChange={setCreateFrequencyKind}
                naturalDate={naturalDate}
              />
              <label className="field-label">
                打卡方式
                <select className="field" name="check_type">
                  <option value="TICK">勾选</option>
                  <option value="TEXT">文字</option>
                  <option value="PHOTO">照片</option>
                  <option value="VIDEO">视频</option>
                  <option value="MIXED">混合</option>
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
            {actionMessage && (
              <p className="notice text-red" role="alert">
                {actionMessage}
              </p>
            )}
            <button
              className="primary-button w-full"
              type="submit"
              disabled={busyAction === 'create-task'}
            >
              {busyAction === 'create-task' ? '正在创建...' : '创建并启用'}
            </button>
          </form>
        </Modal>
      )}
      {editingTask && (
        <Modal title="编辑家庭任务" onClose={() => setEditingTask(null)}>
          <form key={JSON.stringify(editingTask)} className="space-y-4" onSubmit={updateTask}>
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
            <label className="field-label">
              提交指南
              <textarea
                className="field min-h-20 py-3"
                name="submission_guide"
                maxLength={10000}
                defaultValue={editingTask.submission_guide ?? ''}
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
                任务模式
                <select
                  className="field"
                  name="collaboration_mode"
                  value={editCollaborationMode}
                  onChange={(event) =>
                    setEditCollaborationMode(event.target.value as TaskCollaborationMode)
                  }
                >
                  <option value="SOLO">单人独立</option>
                  <option value="COLLAB">多人协作</option>
                </select>
              </label>
              <TaskAssigneeFields
                key={`edit:${editingTask.id}:${editCollaborationMode}`}
                mode={editCollaborationMode}
                assignees={children.data}
                assignments={editingTask.assignments}
                naturalDate={naturalDate}
              />
              <FrequencyFields
                kind={editFrequencyKind}
                onKindChange={setEditFrequencyKind}
                naturalDate={naturalDate}
                value={editingTask.frequency}
              />
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
            <button
              className="primary-button w-full"
              type="submit"
              disabled={busyAction === `task:${editingTask.id}`}
            >
              {busyAction === `task:${editingTask.id}` ? '正在保存...' : '保存修改'}
            </button>
          </form>
        </Modal>
      )}
      {editingType && (
        <Modal
          title={editingType === 'create' ? '新建任务类型' : '编辑任务类型'}
          onClose={() => setEditingType(null)}
        >
          <form className="space-y-4" onSubmit={saveTaskType}>
            <label className="field-label">
              类型名称
              <input
                className="field"
                name="name"
                required
                maxLength={80}
                defaultValue={editingType === 'create' ? '' : editingType.name}
              />
            </label>
            <label className="field-label">
              图标
              <input
                className="field"
                name="icon"
                required
                maxLength={80}
                defaultValue={editingType === 'create' ? 'star' : editingType.icon}
              />
            </label>
            <label className="field-label">
              默认验收方式
              <select
                className="field"
                name="default_verify_mode"
                defaultValue={editingType === 'create' ? 'MANUAL' : editingType.default_verify_mode}
              >
                <option value="AUTO">自动验收</option>
                <option value="MANUAL">人工审核</option>
              </select>
            </label>
            {actionMessage && (
              <p className="notice text-red" role="alert">
                {actionMessage}
              </p>
            )}
            <button className="primary-button w-full" type="submit" disabled={Boolean(busyAction)}>
              {busyAction === 'task-type' ? '正在保存...' : '保存任务类型'}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function ReviewMediaGallery({ media }: { media: PendingReview['media'] }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [states, setStates] = useState<Record<string, 'loading' | 'error'>>({});
  const previewRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<{
    pointerId: number;
    mode: 'pan' | 'swipe';
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const activeMedia = media[activeIndex];

  function constrainPan(position: { x: number; y: number }, scale = zoom) {
    const bounds = previewRef.current?.getBoundingClientRect();
    if (!bounds || scale <= 1) return { x: 0, y: 0 };
    const maxX = (bounds.width * (scale - 1)) / 2;
    const maxY = (bounds.height * (scale - 1)) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, position.x)),
      y: Math.max(-maxY, Math.min(maxY, position.y)),
    };
  }

  function resetView() {
    gestureRef.current = null;
    setDragging(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function updateZoom(nextZoom: number) {
    const boundedZoom = Math.max(1, Math.min(3, nextZoom));
    setZoom(boundedZoom);
    setPan((current) => constrainPan(current, boundedZoom));
  }

  async function loadUrl(item: PendingReview['media'][number]) {
    if (urls[item.id]) return;
    setStates((current) => ({ ...current, [item.id]: 'loading' }));
    try {
      const result = await parentApi<{ url: string }>(`/media/${item.id}/access-url`);
      setUrls((current) => ({ ...current, [item.id]: result.url }));
      setStates((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    } catch {
      setStates((current) => ({ ...current, [item.id]: 'error' }));
    }
  }

  function openPreview() {
    setActiveIndex(0);
    resetView();
    setOpen(true);
    if (media[0]) void loadUrl(media[0]);
  }

  function showMedia(index: number) {
    const nextIndex = (index + media.length) % media.length;
    const nextMedia = media[nextIndex];
    if (!nextMedia) return;
    setActiveIndex(nextIndex);
    resetView();
    void loadUrl(nextMedia);
  }

  function startImageGesture(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const mode =
      zoom > 1 ? 'pan' : event.pointerType === 'touch' && media.length > 1 ? 'swipe' : null;
    if (!mode) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = {
      pointerId: event.pointerId,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
    };
    if (mode === 'pan') setDragging(true);
  }

  function moveImageGesture(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.mode === 'pan') {
      event.preventDefault();
      const deltaX = event.clientX - gesture.lastX;
      const deltaY = event.clientY - gesture.lastY;
      setPan((current) => constrainPan({ x: current.x + deltaX, y: current.y + deltaY }));
    }
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
  }

  function finishImageGesture(event: ReactPointerEvent<HTMLDivElement>, cancelled = false) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    gestureRef.current = null;
    setDragging(false);
    if (cancelled || gesture.mode !== 'swipe') return;
    const horizontalDistance = event.clientX - gesture.startX;
    const verticalDistance = event.clientY - gesture.startY;
    if (
      Math.abs(horizontalDistance) < 48 ||
      Math.abs(horizontalDistance) <= Math.abs(verticalDistance)
    ) {
      return;
    }
    showMedia(activeIndex + (horizontalDistance < 0 ? 1 : -1));
  }

  if (!activeMedia) return null;

  const activeUrl = urls[activeMedia.id];
  const activeState = states[activeMedia.id];

  return (
    <>
      <button className="secondary-button" type="button" onClick={openPreview}>
        <ImageIcon size={15} />
        查看凭证{media.length > 1 ? ` (${media.length})` : ''}
      </button>
      {open && (
        <Modal
          title="提交凭证"
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' && media.length > 1) {
              event.preventDefault();
              showMedia(activeIndex - 1);
            }
            if (event.key === 'ArrowRight' && media.length > 1) {
              event.preventDefault();
              showMedia(activeIndex + 1);
            }
          }}
          onClose={() => {
            setOpen(false);
            resetView();
          }}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 text-caption font-bold text-brown-light">
              <span>
                {activeMedia.type === 'IMAGE'
                  ? '图片'
                  : activeMedia.type === 'VIDEO'
                    ? '视频'
                    : '音频'}
              </span>
              <span aria-live="polite">
                {activeIndex + 1} / {media.length}
              </span>
            </div>
            {activeState === 'loading' && (
              <div className="media-placeholder" role="status">
                <span className="loading-dot" />
                正在读取凭证
              </div>
            )}
            {activeState === 'error' && (
              <div className="media-placeholder" role="alert">
                <CloudOff size={28} />
                <span>凭证读取失败</span>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void loadUrl(activeMedia)}
                >
                  重试
                </button>
              </div>
            )}
            {activeUrl && activeMedia.type === 'IMAGE' && (
              <div
                ref={previewRef}
                className="relative h-[min(56vh,520px)] overflow-hidden rounded-card bg-cream"
                style={{
                  cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'default',
                  touchAction: zoom > 1 ? 'none' : media.length > 1 ? 'pan-y' : 'auto',
                }}
                aria-label="图片凭证浏览区域"
                onPointerDown={startImageGesture}
                onPointerMove={moveImageGesture}
                onPointerUp={finishImageGesture}
                onPointerCancel={(event) => finishImageGesture(event, true)}
              >
                <NextImage
                  src={activeUrl}
                  alt={`提交凭证 ${activeIndex + 1}`}
                  fill
                  unoptimized
                  draggable={false}
                  sizes="(max-width: 767px) 90vw, 480px"
                  className={`select-none object-contain ${dragging ? '' : 'transition-transform duration-200'}`}
                  style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}
                  onDragStart={(event) => event.preventDefault()}
                />
              </div>
            )}
            {activeUrl && activeMedia.type === 'VIDEO' && (
              // The uploaded video is user-generated, so a caption track is not available here.
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                className="max-h-[56vh] w-full rounded-card bg-brown"
                src={activeUrl}
                controls
                preload="metadata"
                aria-label={`视频凭证 ${activeIndex + 1}`}
              />
            )}
            {activeUrl && activeMedia.type === 'AUDIO' && (
              // The uploaded audio is user-generated, so a caption track is not available here.
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <audio
                className="w-full"
                src={activeUrl}
                controls
                preload="metadata"
                aria-label={`音频凭证 ${activeIndex + 1}`}
              />
            )}
            {activeMedia.type === 'IMAGE' && activeUrl && (
              <div className="flex items-center justify-center gap-2" aria-label="图片缩放控制">
                <button
                  className="icon-button"
                  type="button"
                  disabled={zoom <= 1}
                  onClick={() => updateZoom(zoom - 0.25)}
                  aria-label="缩小图片"
                >
                  <ZoomOut size={19} />
                </button>
                <button
                  className="secondary-button min-w-24"
                  type="button"
                  disabled={zoom === 1}
                  onClick={resetView}
                  aria-label="恢复图片原始缩放"
                >
                  <RotateCcw size={16} />
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  className="icon-button"
                  type="button"
                  disabled={zoom >= 3}
                  onClick={() => updateZoom(zoom + 0.25)}
                  aria-label="放大图片"
                >
                  <ZoomIn size={19} />
                </button>
              </div>
            )}
            {activeMedia.type === 'IMAGE' && activeUrl && (
              <p className="text-center text-caption text-brown-light" aria-live="polite">
                {zoom > 1
                  ? '拖动图片浏览放大区域'
                  : media.length > 1
                    ? '移动端左右滑动可切换凭证'
                    : '使用缩放按钮查看图片细节'}
              </p>
            )}
            {media.length > 1 && (
              <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => showMedia(activeIndex - 1)}
                  aria-label="上一项凭证"
                >
                  <ChevronLeft size={18} />
                  上一项
                </button>
                <span className="text-center text-caption font-bold text-brown-light">
                  切换凭证
                </span>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => showMedia(activeIndex + 1)}
                  aria-label="下一项凭证"
                >
                  下一项
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

export function ReviewActions({
  busy,
  locked = false,
  reason,
  onApprove,
  onReject,
  onReasonChange,
}: {
  busy: boolean;
  locked?: boolean;
  reason: string;
  onApprove: () => void;
  onReject: () => void;
  onReasonChange: (reason: string) => void;
}) {
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-[auto_auto_1fr] md:items-end">
      {!locked && (
        <>
          <button className="primary-button" type="button" disabled={busy} onClick={onApprove}>
            <Check size={17} />
            {busy ? '处理中' : '通过并发分'}
          </button>
          <button className="secondary-button" type="button" disabled={busy} onClick={onReject}>
            <X size={17} />
            不通过打回
          </button>
        </>
      )}
      <label className="field-label">
        打回原因
        <input
          className="field"
          value={reason}
          disabled={locked}
          maxLength={2000}
          placeholder="打回时必填，例如：请补充清晰照片"
          onChange={(event) => onReasonChange(event.target.value)}
        />
      </label>
    </div>
  );
}

function ReviewsPage() {
  const reviews = useApiData<PendingReview[]>('/family/submission-reviews/pending', 'reviews', []);
  const children = useApiData<Child[]>('/family/children', 'children', []);
  const tasks = useApiData<Task[]>('/family/tasks', 'tasks', []);
  const [historyPath, setHistoryPath] = useState(buildReviewHistoryPath({}));
  const history = useApiData<ReviewHistory[]>(historyPath, 'reviews', []);
  const [busyTarget, setBusyTarget] = useState('');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [retainedConflicts, setRetainedConflicts] = useState<Record<string, RetainedConflict>>({});
  const [actionMessage, setActionMessage] = useState('');

  const pendingKeys = new Set(reviews.data.map((item) => `${item.target_type}:${item.target_id}`));
  const displayReviews = [
    ...reviews.data,
    ...Object.values(retainedConflicts)
      .filter(({ item }) => !pendingKeys.has(`${item.target_type}:${item.target_id}`))
      .map(({ item }) => item),
  ];

  function filterHistory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startDate = String(form.get('start_date') ?? '');
    const endDate = String(form.get('end_date') ?? '');
    if (Boolean(startDate) !== Boolean(endDate)) {
      setActionMessage('审核日期的开始和结束需要同时填写。');
      return;
    }
    const nextPath = buildReviewHistoryPath({
      ...(form.get('child_id') ? { childId: String(form.get('child_id')) } : {}),
      ...(form.get('task_id') ? { taskId: String(form.get('task_id')) } : {}),
      ...(form.get('result')
        ? { result: String(form.get('result')) as 'APPROVED' | 'REJECTED' }
        : {}),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
    });
    setActionMessage('');
    if (nextPath === historyPath) void history.refresh();
    else setHistoryPath(nextPath);
  }

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
      await history.refresh();
      setRetainedConflicts((current) => {
        const next = { ...current };
        delete next[`${item.target_type}:${item.target_id}`];
        return next;
      });
      setActionMessage(status === 'APPROVED' ? '审核通过，积分已按规则处理。' : '已打回提交。');
    } catch (error) {
      if (error instanceof ParentApiError && error.status === 409) {
        const [queueResult, targetHistoryResult] = await Promise.allSettled([
          reviews.refresh(),
          parentApi<{ reviews: ReviewHistory[] }>(request.path),
        ]);
        const targetHistory =
          targetHistoryResult.status === 'fulfilled' ? targetHistoryResult.value.reviews : [];
        const authoritativeReview = targetHistory.at(-1) ?? null;
        setRetainedConflicts((current) => ({
          ...current,
          [`${item.target_type}:${item.target_id}`]: { item, review: authoritativeReview },
        }));
        await history.refresh().catch(() => undefined);
        setActionMessage(
          authoritativeReview
            ? `审核状态已由服务端更新为${authoritativeReview.status === 'APPROVED' ? '通过' : '打回'}，当前记录已保留。`
            : queueResult.status === 'fulfilled'
              ? '审核发生冲突，已刷新服务端状态并保留当前记录。'
              : '审核发生冲突，当前记录已保留，权威状态刷新失败。',
        );
        return;
      }
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
          {displayReviews.map((item) => {
            const busy = busyTarget === item.target_id;
            const retained = retainedConflicts[`${item.target_type}:${item.target_id}`];
            const authoritativeStatus = retained?.review?.status ?? null;
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
                  <span
                    className={`status-chip ${authoritativeStatus ? 'bg-sand text-brown' : item.is_overdue ? 'bg-red/5 text-red' : 'bg-orange/10 text-orange-dark'}`}
                  >
                    {authoritativeStatus === 'APPROVED'
                      ? '服务端已通过'
                      : authoritativeStatus === 'REJECTED'
                        ? '服务端已打回'
                        : item.is_overdue
                          ? '已超时'
                          : '等待审核'}
                  </span>
                </div>
                <p className="mt-2 text-caption font-bold text-brown-light">
                  {item.review_deadline_at
                    ? `审核截止：${new Date(item.review_deadline_at).toLocaleString('zh-CN')}`
                    : '家庭规则已关闭自动超时审核，仅由家长人工处理。'}
                </p>
                <p className="mt-4 whitespace-pre-wrap rounded-card bg-white/70 p-4 font-semibold text-brown">
                  {item.content_text ?? '本次提交没有文字说明。'}
                </p>
                {item.media.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2" aria-label="提交凭证">
                    <ReviewMediaGallery media={item.media} />
                  </div>
                )}
                {authoritativeStatus && (
                  <p className="notice mt-4" role="status">
                    当前记录保留用于核对，审核历史已同步服务端权威结果。
                  </p>
                )}
                <ReviewActions
                  busy={busy}
                  locked={Boolean(authoritativeStatus)}
                  reason={reasons[item.target_id] ?? ''}
                  onApprove={() => submitReview(item, 'APPROVED')}
                  onReject={() => submitReview(item, 'REJECTED')}
                  onReasonChange={(reason) =>
                    setReasons((current) => ({ ...current, [item.target_id]: reason }))
                  }
                />
              </article>
            );
          })}
        </div>
      </Panel>
      <Panel className="mt-5">
        <SectionTitle>审核历史</SectionTitle>
        <form className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-6" onSubmit={filterHistory}>
          <label className="field-label">
            孩子
            <select className="field" name="child_id" defaultValue="">
              <option value="">全部孩子</option>
              {children.data.map((child) => (
                <option key={child.id} value={child.id}>
                  {child.nickname}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            任务
            <select className="field" name="task_id" defaultValue="">
              <option value="">全部任务</option>
              {tasks.data.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            结果
            <select className="field" name="result" defaultValue="">
              <option value="">全部结果</option>
              <option value="APPROVED">通过</option>
              <option value="REJECTED">打回</option>
            </select>
          </label>
          <label className="field-label">
            开始日期
            <input className="field" name="start_date" type="date" />
          </label>
          <label className="field-label">
            结束日期
            <input className="field" name="end_date" type="date" />
          </label>
          <button className="primary-button self-end" type="submit">
            筛选历史
          </button>
        </form>
        {history.state === 'loading' && (
          <EmptyState title="正在读取审核历史" detail="正在同步当前家庭的审核结果。" />
        )}
        {history.state === 'error' && (
          <EmptyState
            title="审核历史读取失败"
            detail="请检查筛选条件后重试。"
            icon={<CloudOff />}
          />
        )}
        {history.state === 'empty' && (
          <EmptyState
            title="暂无审核历史"
            detail="完成审核后，结果会显示在这里。"
            icon={<Clock3 />}
          />
        )}
        <div className="space-y-3">
          {history.data.map((item) => (
            <article className="list-row" key={item.id}>
              <span
                className={`metric-icon ${item.status === 'APPROVED' ? 'text-leaf-dark' : 'text-red'}`}
              >
                {item.status === 'APPROVED' ? <Check size={20} /> : <X size={20} />}
              </span>
              <div className="min-w-0 flex-1">
                <strong>
                  {item.task.name} · {item.child.nickname}
                </strong>
                <p className="text-caption font-bold text-brown-light">
                  {new Date(item.reviewed_at).toLocaleString('zh-CN')} ·{' '}
                  {item.source === 'TIMEOUT' ? '超时自动审核' : '家长审核'}
                </p>
                {item.reason && (
                  <p className="mt-1 text-sm text-brown-light">原因：{item.reason}</p>
                )}
              </div>
              <span
                className={`status-chip ${item.status === 'APPROVED' ? 'bg-leaf-light text-leaf-dark' : 'bg-red/5 text-red'}`}
              >
                {item.status === 'APPROVED' ? '通过' : '打回'}
              </span>
            </article>
          ))}
        </div>
      </Panel>
    </>
  );
}

function rewardTypeLabel(type: ParentReward['type']): string {
  return { PHYSICAL: '实物', PRIVILEGE: '特权', EXPERIENCE: '体验', CUSTOM: '自定义' }[type];
}

function rewardLimitLabel(reward: ParentReward): string {
  const limits = reward.prerequisites.redeem_limit;
  const labels = [
    limits?.per_day ? `每日 ${limits.per_day} 次` : '',
    limits?.per_week ? `每周 ${limits.per_week} 次` : '',
    limits?.per_month ? `每月 ${limits.per_month} 次` : '',
  ].filter(Boolean);
  return labels.length > 0 ? labels.join(' · ') : '兑换频次不限';
}

export function RewardCatalog({
  rewards,
  imageUrls,
  busyAction,
  onEdit,
  onToggleStatus,
  onDelete,
}: {
  rewards: readonly ParentReward[];
  imageUrls: Readonly<Record<string, string>>;
  busyAction: string | null;
  onEdit: (reward: ParentReward) => void;
  onToggleStatus: (reward: ParentReward) => void;
  onDelete: (reward: ParentReward) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {rewards.map((reward) => {
        const imageUrl = reward.image_media_id ? imageUrls[reward.image_media_id] : undefined;
        const locked = busyAction !== null;
        return (
          <article className="soft-card flex min-h-full flex-col" key={reward.id}>
            {imageUrl ? (
              <NextImage
                className="mb-4 h-36 w-full rounded-card object-cover"
                src={imageUrl}
                alt={`${reward.name} 奖励图片`}
                width={480}
                height={288}
                unoptimized
              />
            ) : (
              <span className="metric-icon mb-3">
                <Gift />
              </span>
            )}
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-extrabold">{reward.name}</h3>
              <span
                className={`tag ${reward.status === 'ACTIVE' ? 'tag-green' : 'bg-sand text-brown-light'}`}
              >
                {reward.status === 'ACTIVE' ? '已上架' : '已下架'}
              </span>
            </div>
            <p className="mt-1 min-h-9 text-caption font-bold text-brown-light">
              {reward.description || '暂未填写奖励说明'}
            </p>
            <div className="mt-3 space-y-1 text-caption font-bold text-brown-light">
              <p>
                {rewardTypeLabel(reward.type)} ·{' '}
                {reward.prerequisites.min_level
                  ? `Lv.${reward.prerequisites.min_level} 解锁`
                  : '无等级门槛'}
              </p>
              <p>{rewardLimitLabel(reward)}</p>
              <p>
                {reward.stock_total === null
                  ? '无限库存'
                  : `总量 ${reward.stock_total} · 预占 ${reward.stock_reserved} · 已兑 ${reward.stock_consumed} · 可用 ${reward.stock_available ?? 0}`}
              </p>
            </div>
            <div className="mt-auto flex items-end justify-between pt-4">
              <strong className="font-display text-title text-orange">
                {reward.points_cost} 星
              </strong>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                className="secondary-button justify-center px-2"
                type="button"
                disabled={locked}
                onClick={() => onEdit(reward)}
                aria-label={`编辑奖励 ${reward.name}`}
              >
                <Pencil size={15} />
                编辑
              </button>
              <button
                className="secondary-button justify-center px-2"
                type="button"
                disabled={locked}
                onClick={() => onToggleStatus(reward)}
              >
                {reward.status === 'ACTIVE' ? '下架' : '上架'}
              </button>
              <button
                className="secondary-button justify-center px-2 text-red"
                type="button"
                disabled={locked}
                onClick={() => onDelete(reward)}
                aria-label={`删除奖励 ${reward.name}`}
              >
                <Trash2 size={15} />
                删除
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function RewardEditorFields({
  reward,
  imageUrl,
  imageRemoved,
  busy,
  onRemoveImage,
  onSubmit,
}: {
  reward: ParentReward | null;
  imageUrl: string | undefined;
  imageRemoved: boolean;
  busy: boolean;
  onRemoveImage: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const limits = reward?.prerequisites.redeem_limit;
  return (
    <form className="space-y-4" onSubmit={onSubmit} aria-busy={busy}>
      <label className="field-label">
        奖励名称
        <input
          className="field"
          name="name"
          required
          maxLength={120}
          defaultValue={reward?.name ?? ''}
          disabled={busy}
        />
      </label>
      <label className="field-label">
        奖励说明
        <textarea
          className="field min-h-20 py-3"
          name="description"
          maxLength={10_000}
          defaultValue={reward?.description ?? ''}
          disabled={busy}
        />
      </label>
      {reward?.image_media_id && !imageRemoved && (
        <div className="soft-card flex items-center gap-3">
          {imageUrl ? (
            <NextImage
              className="size-16 rounded-card object-cover"
              src={imageUrl}
              alt={`${reward.name} 当前奖励图片`}
              width={64}
              height={64}
              unoptimized
            />
          ) : (
            <ImageIcon aria-hidden size={24} />
          )}
          <span className="flex-1 text-sm font-bold">已配置奖励图片</span>
          <button
            className="secondary-button"
            type="button"
            disabled={busy}
            onClick={onRemoveImage}
          >
            移除图片
          </button>
        </div>
      )}
      <label className="field-label">
        {reward?.image_media_id && !imageRemoved ? '替换奖励图片' : '奖励图片（可选）'}
        <input
          className="field py-2"
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
        />
      </label>
      <div className="form-grid">
        <label className="field-label">
          所需积分
          <input
            className="field"
            name="points_cost"
            type="number"
            min="1"
            max="2147483647"
            required
            defaultValue={reward?.points_cost ?? 1}
            disabled={busy}
          />
        </label>
        <label className="field-label">
          奖励类型
          <select
            className="field"
            name="type"
            defaultValue={reward?.type ?? 'PRIVILEGE'}
            disabled={busy}
          >
            <option value="PRIVILEGE">特权</option>
            <option value="PHYSICAL">实物</option>
            <option value="EXPERIENCE">体验</option>
            <option value="CUSTOM">自定义</option>
          </select>
        </label>
        <label className="field-label">
          总库存（留空不限量）
          <input
            className="field"
            name="stock_total"
            type="number"
            min="0"
            max="2147483647"
            defaultValue={reward?.stock_total ?? ''}
            disabled={busy}
          />
        </label>
        <label className="field-label">
          最低等级（留空无限制）
          <input
            className="field"
            name="min_level"
            type="number"
            min="1"
            max="20"
            defaultValue={reward?.prerequisites.min_level ?? ''}
            disabled={busy}
          />
        </label>
        <label className="field-label">
          每日兑换上限
          <input
            className="field"
            name="per_day"
            type="number"
            min="1"
            max="2147483647"
            defaultValue={limits?.per_day ?? ''}
            disabled={busy}
          />
        </label>
        <label className="field-label">
          每周兑换上限
          <input
            className="field"
            name="per_week"
            type="number"
            min="1"
            max="2147483647"
            defaultValue={limits?.per_week ?? ''}
            disabled={busy}
          />
        </label>
        <label className="field-label">
          每月兑换上限
          <input
            className="field"
            name="per_month"
            type="number"
            min="1"
            max="2147483647"
            defaultValue={limits?.per_month ?? ''}
            disabled={busy}
          />
        </label>
      </div>
      <p className="text-caption font-bold text-brown-light">
        有待审批或待兑现兑换时，库存模式切换会由服务端保护。
      </p>
      <button className="primary-button w-full justify-center" type="submit" disabled={busy}>
        <Save size={16} />
        {busy ? '正在保存...' : reward ? '保存奖励' : '保存并上架'}
      </button>
    </form>
  );
}

export function RedemptionWorkflowList({
  redemptions,
  busyAction,
  onApprove,
  onReject,
  onFulfill,
}: Readonly<{
  redemptions: readonly Redemption[];
  busyAction: string | null;
  onApprove: (redemption: Redemption) => void;
  onReject: (redemption: Redemption) => void;
  onFulfill: (redemption: Redemption) => void;
}>) {
  return redemptions.map((item) => {
    const locked = busyAction !== null;
    return (
      <div className="list-row" key={item.id}>
        <Gift aria-hidden="true" />
        <span className="flex-1 font-extrabold">兑换 {item.points_spent} 星</span>
        <span className="tag tag-orange">{redemptionStatusLabel(item.status)}</span>
        {item.status === 'PENDING' && (
          <>
            <button
              className="secondary-button"
              type="button"
              disabled={locked}
              onClick={() => onApprove(item)}
            >
              批准
            </button>
            <button
              className="secondary-button text-red"
              type="button"
              disabled={locked}
              onClick={() => onReject(item)}
            >
              拒绝并退款
            </button>
          </>
        )}
        {item.status === 'APPROVED' && (
          <button
            className="secondary-button"
            type="button"
            disabled={locked}
            onClick={() => onFulfill(item)}
          >
            确认兑现
          </button>
        )}
      </div>
    );
  });
}

export function ActiveWishWall({
  wishes,
  busyAction,
  onAdopt,
}: Readonly<{
  wishes: readonly Wish[];
  busyAction: string | null;
  onAdopt: (wish: Wish) => void;
}>) {
  return activeWishes(wishes).map((wish) => (
    <div className="list-row" key={wish.id}>
      <Heart aria-hidden="true" className="text-pink-dark" />
      <div className="flex-1">
        <strong>{wish.title}</strong>
        <Progress
          value={Math.round(wish.progress.ratio * 100)}
          label={`${wish.progress.points} / ${wish.target_points} 星`}
        />
      </div>
      <button
        className="secondary-button"
        type="button"
        disabled={busyAction !== null}
        onClick={() => onAdopt(wish)}
      >
        采纳为奖励
      </button>
    </div>
  ));
}

export function WishAdoptionFields({
  wish,
  busy,
  onSubmit,
}: Readonly<{
  wish: Wish;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}>) {
  return (
    <form className="space-y-4" aria-busy={busy} onSubmit={onSubmit}>
      <p className="notice">
        “{wish.title}”将按 {wish.target_points} 星创建为家庭奖励。
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field-label">
          奖励类型
          <select className="field" name="type" defaultValue="CUSTOM" disabled={busy}>
            <option value="PRIVILEGE">特权</option>
            <option value="PHYSICAL">实物</option>
            <option value="EXPERIENCE">体验</option>
            <option value="CUSTOM">自定义</option>
          </select>
        </label>
        <label className="field-label">
          上架状态
          <select className="field" name="status" defaultValue="ACTIVE" disabled={busy}>
            <option value="ACTIVE">立即上架</option>
            <option value="INACTIVE">暂不上架</option>
          </select>
        </label>
        <label className="field-label">
          总库存（留空不限量）
          <input className="field" name="stock_total" type="number" min="0" disabled={busy} />
        </label>
        <label className="field-label">
          最低等级
          <input
            className="field"
            name="min_level"
            type="number"
            min="1"
            max="20"
            disabled={busy}
          />
        </label>
        <label className="field-label">
          每日兑换上限
          <input className="field" name="per_day" type="number" min="1" disabled={busy} />
        </label>
        <label className="field-label">
          每周兑换上限
          <input className="field" name="per_week" type="number" min="1" disabled={busy} />
        </label>
        <label className="field-label">
          每月兑换上限
          <input className="field" name="per_month" type="number" min="1" disabled={busy} />
        </label>
      </div>
      <button className="primary-button w-full justify-center" type="submit" disabled={busy}>
        {busy ? '正在采纳...' : '确认采纳'}
      </button>
    </form>
  );
}

function RewardsPage() {
  const rewards = useApiData<ParentReward[]>('/rewards', 'rewards', []);
  const redemptions = useApiData<Redemption[]>('/redemptions', 'redemptions', []);
  const wishes = useApiData<Wish[]>('/wishes', 'wishes', []);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingReward, setEditingReward] = useState<ParentReward | null>(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [imageUrls, setImageUrls] = useState<Readonly<Record<string, string>>>({});
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const [rejectingRedemption, setRejectingRedemption] = useState<Redemption | null>(null);
  const [adoptingWish, setAdoptingWish] = useState<Wish | null>(null);

  useEffect(() => {
    let active = true;
    const ids = rewards.data.flatMap(({ image_media_id }) =>
      image_media_id ? [image_media_id] : [],
    );
    loadTimelineMediaUrls(parentApi, ids)
      .then((urls) => active && setImageUrls(urls))
      .catch(() => active && setImageUrls({}));
    return () => {
      active = false;
    };
  }, [rewards.data]);

  function closeEditor() {
    if (busyAction) return;
    setCreateOpen(false);
    setEditingReward(null);
    setImageRemoved(false);
  }

  function openEditor(reward: ParentReward | null) {
    setActionMessage('');
    setImageRemoved(false);
    setEditorRevision(0);
    setEditingReward(reward);
    setCreateOpen(reward === null);
  }

  async function refreshRewardsSafely(): Promise<ParentReward[] | null> {
    try {
      return await rewards.refresh();
    } catch {
      return null;
    }
  }

  async function saveReward(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyAction) return;
    setActionMessage('');
    const form = new FormData(event.currentTarget);
    const action = editingReward ? `edit:${editingReward.id}` : 'create';
    setBusyAction(action);
    let writeCompleted = false;
    try {
      const image = form.get('image');
      let imageMediaId = imageRemoved ? null : (editingReward?.image_media_id ?? null);
      if (image instanceof File && image.size > 0) {
        imageMediaId = await uploadMediaFile(image, {
          api: parentApi,
          idempotencyKey: `reward-image-${editingReward?.id ?? 'new'}-${crypto.randomUUID()}`,
        });
      }
      const payload = buildRewardPayload(form, imageMediaId, editingReward?.status ?? 'ACTIVE');
      await parentApi<{ reward: ParentReward }>(
        editingReward ? `/rewards/${editingReward.id}` : '/rewards',
        {
          method: editingReward ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        },
      );
      writeCompleted = true;
      setCreateOpen(false);
      setEditingReward(null);
      setImageRemoved(false);
      await rewards.refresh();
    } catch (error) {
      if (writeCompleted) {
        setActionMessage('奖励已保存，列表刷新失败，请重新加载页面确认最新状态。');
      } else {
        const authoritative = await refreshRewardsSafely();
        if (editingReward && authoritative) {
          const current = authoritative.find(({ id }) => id === editingReward.id);
          if (current) {
            setEditingReward(current);
            setEditorRevision((revision) => revision + 1);
          }
        }
        setActionMessage(
          error instanceof ParentApiError && error.status === 409
            ? `奖励状态已变化：${error.message}`
            : '奖励保存失败，请检查图片、库存和输入后重试。',
        );
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function toggleRewardStatus(reward: ParentReward) {
    if (busyAction) return;
    setActionMessage('');
    setBusyAction(`status:${reward.id}`);
    let writeCompleted = false;
    try {
      await parentApi(`/rewards/${reward.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: reward.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }),
      });
      writeCompleted = true;
      await rewards.refresh();
    } catch (error) {
      await refreshRewardsSafely();
      setActionMessage(
        writeCompleted
          ? '奖励状态已更新，列表刷新失败，请重新加载页面确认。'
          : error instanceof ParentApiError && error.status === 409
            ? `奖励状态已变化：${error.message}`
            : '奖励上下架失败，请重试。',
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteReward(reward: ParentReward) {
    if (busyAction) return;
    const confirmed = window.confirm(
      `确认删除“${reward.name}”？奖励将下架，历史兑换记录会继续保留。`,
    );
    if (!confirmed) return;
    setActionMessage('');
    setBusyAction(`delete:${reward.id}`);
    let writeCompleted = false;
    try {
      await parentApi(`/rewards/${reward.id}`, { method: 'DELETE' });
      writeCompleted = true;
      await rewards.refresh();
    } catch (error) {
      await refreshRewardsSafely();
      setActionMessage(
        writeCompleted
          ? '奖励已删除，列表刷新失败，请重新加载页面确认。'
          : error instanceof ParentApiError && error.status === 409
            ? `奖励受当前业务状态保护：${error.message}`
            : '奖励删除失败，请刷新后重试。',
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function updateRedemption(item: Redemption, action: 'approve' | 'fulfill') {
    if (busyAction) return;
    setActionMessage('');
    setBusyAction(`redemption:${item.id}:${action}`);
    try {
      await parentApi(`/redemptions/${item.id}/${action}`, { method: 'POST' });
      await redemptions.refresh();
    } catch (error) {
      if (error instanceof ParentApiError && error.status === 409) {
        await redemptions.refresh().catch(() => undefined);
      }
      setActionMessage(
        error instanceof ParentApiError && error.status === 409
          ? '兑换状态已变化，已刷新为服务端最新状态。'
          : '兑换状态更新失败，请刷新后重试。',
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function rejectRedemption(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rejectingRedemption || busyAction) return;
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim();
    if (reason.length < 1 || reason.length > 2000) {
      setActionMessage('拒绝原因需为 1 至 2000 个字符。');
      return;
    }
    const item = rejectingRedemption;
    setActionMessage('');
    setBusyAction(`redemption:${item.id}:reject`);
    try {
      await parentApi(`/redemptions/${item.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setRejectingRedemption(null);
      await redemptions.refresh();
    } catch (error) {
      if (error instanceof ParentApiError && error.status === 409) {
        setRejectingRedemption(null);
        await redemptions.refresh().catch(() => undefined);
      }
      setActionMessage(
        error instanceof ParentApiError && error.status === 409
          ? '兑换状态已变化，已刷新为服务端最新状态。'
          : '拒绝兑换失败，请重试。',
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function adoptWish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adoptingWish || busyAction) return;
    const wish = adoptingWish;
    setActionMessage('');
    setBusyAction(`wish:${wish.id}:adopt`);
    try {
      await parentApi(`/wishes/${wish.id}/adopt`, {
        method: 'POST',
        body: JSON.stringify(buildWishAdoptionPayload(new FormData(event.currentTarget))),
      });
      setAdoptingWish(null);
      const refreshed = await Promise.allSettled([wishes.refresh(), rewards.refresh()]);
      if (refreshed.some(({ status }) => status === 'rejected')) {
        setActionMessage('愿望已采纳，列表刷新失败，请重新加载页面确认。');
      }
    } catch (error) {
      if (error instanceof ParentApiError && error.status === 409) {
        setAdoptingWish(null);
        await Promise.allSettled([wishes.refresh(), rewards.refresh()]);
      }
      setActionMessage(
        error instanceof ParentApiError && error.status === 409
          ? '愿望状态已变化，已刷新愿望与奖励列表。'
          : '采纳愿望失败，请检查奖励配置后重试。',
      );
    } finally {
      setBusyAction(null);
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
          <button
            className="primary-button"
            onClick={() => openEditor(null)}
            disabled={busyAction !== null}
          >
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
            <RedemptionWorkflowList
              redemptions={redemptions.data}
              busyAction={busyAction}
              onApprove={(item) => updateRedemption(item, 'approve')}
              onReject={setRejectingRedemption}
              onFulfill={(item) => updateRedemption(item, 'fulfill')}
            />
          )}
        </Panel>
        <Panel>
          <SectionTitle>奖励池</SectionTitle>
          {rewards.data.length === 0 ? (
            <EmptyState title="奖励池还是空的" detail="创建第一个家庭奖励后会显示在这里。" />
          ) : (
            <RewardCatalog
              rewards={rewards.data}
              imageUrls={imageUrls}
              busyAction={busyAction}
              onEdit={(reward) => openEditor(reward)}
              onToggleStatus={toggleRewardStatus}
              onDelete={deleteReward}
            />
          )}
        </Panel>
      </div>
      <Panel className="mt-5">
        <SectionTitle>许愿墙</SectionTitle>
        {activeWishes(wishes.data).length === 0 ? (
          <EmptyState
            title="还没有新的愿望"
            detail="孩子创建愿望后，家长可一键采纳为正式奖励。"
            icon={<Heart size={30} />}
          />
        ) : (
          <ActiveWishWall wishes={wishes.data} busyAction={busyAction} onAdopt={setAdoptingWish} />
        )}
      </Panel>
      {(createOpen || editingReward) && (
        <Modal
          title={editingReward ? '编辑奖励' : '新增奖励'}
          onClose={closeEditor}
          closeDisabled={busyAction !== null}
        >
          <RewardEditorFields
            key={`${editingReward?.updated_at ?? 'create'}-${editorRevision}`}
            reward={editingReward}
            imageUrl={
              editingReward?.image_media_id ? imageUrls[editingReward.image_media_id] : undefined
            }
            imageRemoved={imageRemoved}
            busy={busyAction !== null}
            onRemoveImage={() => setImageRemoved(true)}
            onSubmit={saveReward}
          />
        </Modal>
      )}
      {rejectingRedemption && (
        <Modal
          title="拒绝兑换并退款"
          onClose={() => setRejectingRedemption(null)}
          closeDisabled={busyAction !== null}
        >
          <form className="space-y-4" aria-busy={busyAction !== null} onSubmit={rejectRedemption}>
            <label className="field-label">
              拒绝原因
              <textarea
                className="field min-h-32"
                name="reason"
                required
                minLength={1}
                maxLength={2000}
                disabled={busyAction !== null}
              />
            </label>
            <p className="text-caption font-bold text-brown-light">
              拒绝后将退还 {rejectingRedemption.points_spent} 星并释放预占库存。
            </p>
            <button
              className="primary-button w-full justify-center"
              type="submit"
              disabled={busyAction !== null}
            >
              {busyAction ? '正在处理...' : '确认拒绝并退款'}
            </button>
          </form>
        </Modal>
      )}
      {adoptingWish && (
        <Modal
          title="采纳愿望"
          onClose={() => setAdoptingWish(null)}
          closeDisabled={busyAction !== null}
        >
          <WishAdoptionFields wish={adoptingWish} busy={busyAction !== null} onSubmit={adoptWish} />
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
  return <ParentAnalyticsSection />;
}

function RecordsPage() {
  return <ParentGrowthRecordsSection />;
}

export function FamilyProfileFields({
  profile,
  busy,
  onSubmit,
}: {
  profile: FamilyProfile;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="space-y-4" onSubmit={onSubmit} aria-busy={busy}>
      <label className="field-label">
        家庭名称
        <input
          className="field"
          name="name"
          defaultValue={profile.name}
          maxLength={80}
          required
          readOnly={!profile.permissions.can_update_name}
          aria-describedby={
            profile.permissions.can_update_name ? undefined : 'family-name-permission-note'
          }
        />
      </label>
      {!profile.permissions.can_update_name && (
        <p className="notice" id="family-name-permission-note">
          家庭名称由家庭创建者管理，共同家长可更新家庭时区。
        </p>
      )}
      <label className="field-label">
        家庭时区
        <input
          className="field"
          name="time_zone"
          defaultValue={profile.time_zone}
          maxLength={64}
          required
          placeholder="Asia/Shanghai"
          aria-describedby="family-time-zone-note"
        />
      </label>
      <p className="text-caption font-bold text-brown-light" id="family-time-zone-note">
        使用 IANA 时区名称，例如 Asia/Shanghai。
      </p>
      <button className="primary-button w-full justify-center" type="submit" disabled={busy}>
        <Save size={16} />
        {busy ? '正在保存...' : '保存家庭资料'}
      </button>
    </form>
  );
}

function FamilyPage() {
  const children = useApiData<Child[]>('/family/children', 'children', []);
  const profile = useApiData<FamilyProfile | null>('/family/profile', 'profile', null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingChild, setEditingChild] = useState<Child | null>(null);
  const [credentialChild, setCredentialChild] = useState<Child | null>(null);
  const [deactivatingChild, setDeactivatingChild] = useState<Child | null>(null);
  const [revokingInvitation, setRevokingInvitation] = useState<
    FamilyProfile['invitations'][number] | null
  >(null);
  const [invitationLink, setInvitationLink] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [familyCode, setFamilyCode] = useState('');
  const [familyCodeState, setFamilyCodeState] = useState<FamilyCodeLoadState>('loading');
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(
    null,
  );

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

  async function refreshAfterWrite(successMessage: string): Promise<void> {
    try {
      await children.refresh();
      setFeedback({ tone: 'success', message: successMessage });
    } catch {
      setFeedback({ tone: 'error', message: '操作已提交，成员列表刷新失败，请刷新页面确认。' });
    }
  }

  async function refreshProfileAfterWrite(successMessage: string): Promise<void> {
    try {
      await profile.refresh();
      setFeedback({ tone: 'success', message: successMessage });
    } catch {
      setFeedback({ tone: 'error', message: '操作已提交，家庭资料刷新失败，请刷新页面确认。' });
    }
  }

  function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  async function createChild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyAction) return;
    const form = new FormData(event.currentTarget);
    setBusyAction('create');
    setFeedback(null);
    try {
      await parentApi<{ child: Child }>('/family/children', {
        method: 'POST',
        body: JSON.stringify({
          nickname: String(form.get('nickname') ?? '').trim(),
          gender: form.get('gender'),
          birthday: form.get('birthday') || undefined,
          grade: String(form.get('grade') ?? '').trim() || undefined,
          ...buildChildCredentialPatch(form),
        }),
      });
      setCreateOpen(false);
      await refreshAfterWrite('孩子档案已创建。');
    } catch (error) {
      setFeedback({ tone: 'error', message: errorMessage(error, '创建孩子档案失败。') });
    } finally {
      setBusyAction(null);
    }
  }

  async function updateChild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingChild || busyAction) return;
    const form = new FormData(event.currentTarget);
    setBusyAction(`profile:${editingChild.id}`);
    setFeedback(null);
    try {
      const avatar = form.get('avatar');
      let avatarMediaId: string | null | undefined;
      if (avatar instanceof File && avatar.size > 0) {
        avatarMediaId = await uploadMediaFile(avatar, {
          idempotencyKey: `child-avatar-${editingChild.id}-${crypto.randomUUID()}`,
        });
      } else if (form.get('clear_avatar') === 'true') {
        avatarMediaId = null;
      }
      await parentApi<{ child: Child }>(`/family/children/${editingChild.id}`, {
        method: 'PATCH',
        body: JSON.stringify(buildChildProfilePatch(form, avatarMediaId)),
      });
      setEditingChild(null);
      await refreshAfterWrite('孩子档案已更新。');
    } catch (error) {
      setFeedback({ tone: 'error', message: errorMessage(error, '更新孩子档案失败。') });
    } finally {
      setBusyAction(null);
    }
  }

  async function resetCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!credentialChild || busyAction) return;
    const form = new FormData(event.currentTarget);
    setBusyAction(`credential:${credentialChild.id}`);
    setFeedback(null);
    try {
      await parentApi<{ child: Child }>(`/family/children/${credentialChild.id}`, {
        method: 'PATCH',
        body: JSON.stringify(buildChildCredentialPatch(form)),
      });
      setCredentialChild(null);
      await refreshAfterWrite('登录凭据已重置，孩子的旧会话已撤销。');
    } catch (error) {
      setFeedback({ tone: 'error', message: errorMessage(error, '重置登录凭据失败。') });
    } finally {
      setBusyAction(null);
    }
  }

  async function deactivateChild() {
    if (!deactivatingChild || busyAction) return;
    const child = deactivatingChild;
    setBusyAction(`deactivate:${child.id}`);
    setFeedback(null);
    try {
      await parentApi<{ childId: string }>(`/family/children/${child.id}`, { method: 'DELETE' });
      setDeactivatingChild(null);
      await refreshAfterWrite(`${child.nickname}的档案已停用，历史记录继续保留。`);
    } catch (error) {
      setFeedback({ tone: 'error', message: errorMessage(error, '停用孩子档案失败。') });
    } finally {
      setBusyAction(null);
    }
  }

  async function updateFamilyProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile.data || busyAction) return;
    const form = new FormData(event.currentTarget);
    setBusyAction('family-profile');
    setFeedback(null);
    try {
      const result = await parentApi<{ profile: FamilyProfile }>('/family/profile', {
        method: 'PATCH',
        body: JSON.stringify(
          buildFamilyProfilePatch(form, profile.data.permissions.can_update_name),
        ),
      });
      profile.setData(result.profile);
      setFeedback({ tone: 'success', message: '家庭资料已更新。' });
    } catch (error) {
      setFeedback({ tone: 'error', message: errorMessage(error, '家庭资料更新失败。') });
    } finally {
      setBusyAction(null);
    }
  }

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile.data?.permissions.can_manage_invitations || busyAction) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusyAction('invitation-create');
    setInvitationLink('');
    setFeedback(null);
    try {
      const result = await parentApi<{
        invitation: { id: string; email: string; expiresAt: string };
        delivery: 'email' | 'copy-link';
        invitationLink?: string;
      }>('/auth/parent/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: String(form.get('email') ?? '').trim() }),
      });
      setInvitationLink(result.invitationLink ?? '');
      formElement.reset();
      await refreshProfileAfterWrite(
        result.delivery === 'email' ? '邀请邮件已发送。' : '邀请已创建，请复制邀请链接。',
      );
    } catch (error) {
      setFeedback({ tone: 'error', message: errorMessage(error, '共同家长邀请创建失败。') });
    } finally {
      setBusyAction(null);
    }
  }

  async function resendInvitation(invitationId: string) {
    if (busyAction) return;
    setBusyAction(`invitation-resend:${invitationId}`);
    setInvitationLink('');
    setFeedback(null);
    try {
      const result = await parentApi<{ delivery: 'email' | 'copy-link'; invitationLink?: string }>(
        `/family/invitations/${invitationId}/resend`,
        { method: 'POST' },
      );
      setInvitationLink(result.invitationLink ?? '');
      await refreshProfileAfterWrite(
        result.delivery === 'email' ? '邀请邮件已重新发送。' : '邀请令牌已更新，请复制新链接。',
      );
    } catch (error) {
      setFeedback({ tone: 'error', message: errorMessage(error, '邀请重发失败。') });
    } finally {
      setBusyAction(null);
    }
  }

  async function revokeInvitation() {
    if (!revokingInvitation || busyAction) return;
    const invitation = revokingInvitation;
    setBusyAction(`invitation-revoke:${invitation.id}`);
    setFeedback(null);
    try {
      await parentApi(`/family/invitations/${invitation.id}`, { method: 'DELETE' });
      setRevokingInvitation(null);
      setInvitationLink('');
      await refreshProfileAfterWrite(`${invitation.email}的邀请已撤销。`);
    } catch (error) {
      setFeedback({ tone: 'error', message: errorMessage(error, '邀请撤销失败。') });
    } finally {
      setBusyAction(null);
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
          <button
            className="primary-button"
            disabled={Boolean(busyAction)}
            onClick={() => {
              setFeedback(null);
              setCreateOpen(true);
            }}
          >
            <UserPlus size={17} />
            添加孩子
          </button>
        }
      />
      {feedback && (
        <p
          className={`notice mb-4 ${feedback.tone === 'error' ? 'text-red' : 'text-leaf-dark'}`}
          role={feedback.tone === 'error' ? 'alert' : 'status'}
        >
          {feedback.message}
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
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    className="text-button"
                    type="button"
                    disabled={Boolean(busyAction)}
                    onClick={() => {
                      setFeedback(null);
                      setEditingChild(child);
                    }}
                  >
                    <Pencil size={15} />
                    编辑档案
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    title="重置登录凭据"
                    aria-label={`重置${child.nickname}的登录凭据`}
                    disabled={Boolean(busyAction)}
                    onClick={() => {
                      setFeedback(null);
                      setCredentialChild(child);
                    }}
                  >
                    <KeyRound size={17} />
                  </button>
                  <button
                    className="icon-button text-red"
                    type="button"
                    title="停用档案"
                    aria-label={`停用${child.nickname}的档案`}
                    disabled={Boolean(busyAction)}
                    onClick={() => {
                      setFeedback(null);
                      setDeactivatingChild(child);
                    }}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
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
          {profile.state === 'loading' && <EmptyState title="正在读取家长列表" detail="请稍候。" />}
          {profile.state === 'error' && (
            <EmptyState title="家长列表读取失败" detail="请刷新页面后重试。" />
          )}
          {profile.data && (
            <div className="space-y-4">
              <div className="space-y-3">
                {profile.data.parents.map((parent) => (
                  <article className="list-row" key={parent.id}>
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="avatar">{parent.nickname.slice(-1)}</span>
                      <div className="min-w-0">
                        <strong className="block truncate">{parent.nickname}</strong>
                        <span className="text-caption font-bold text-brown-light">
                          {parent.email ?? '未设置邮箱'}
                        </span>
                      </div>
                    </div>
                    <span className="status-chip bg-sand text-brown-light">
                      {parent.is_creator ? '家庭创建者' : '共同家长'}
                    </span>
                  </article>
                ))}
              </div>
              {profile.data.invitations.length > 0 && (
                <div className="space-y-2 border-t border-sand pt-4">
                  <h3 className="font-display text-title">待处理邀请</h3>
                  {profile.data.invitations.map((invitation) => (
                    <article className="list-row" key={invitation.id}>
                      <div className="min-w-0">
                        <strong className="block truncate">{invitation.email}</strong>
                        <span className="text-caption font-bold text-brown-light">
                          {invitation.status === 'pending' ? '有效期至' : '已于'}{' '}
                          {new Date(invitation.expires_at).toLocaleString('zh-CN')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="status-chip bg-sand text-brown-light">
                          {invitation.status === 'pending' ? '待接受' : '已过期'}
                        </span>
                        {profile.data?.permissions.can_manage_invitations &&
                          invitation.status === 'pending' && (
                            <>
                              <button
                                className="icon-button"
                                type="button"
                                aria-label={`重发${invitation.email}的邀请`}
                                disabled={Boolean(busyAction)}
                                onClick={() => resendInvitation(invitation.id)}
                              >
                                <RotateCcw size={16} />
                              </button>
                              <button
                                className="icon-button text-red"
                                type="button"
                                aria-label={`撤销${invitation.email}的邀请`}
                                disabled={Boolean(busyAction)}
                                onClick={() => setRevokingInvitation(invitation)}
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {profile.data.permissions.can_manage_invitations ? (
                <form className="space-y-3 border-t border-sand pt-4" onSubmit={createInvitation}>
                  <label className="field-label">
                    邀请共同家长
                    <input
                      className="field"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      placeholder="parent@example.com"
                    />
                  </label>
                  <button
                    className="secondary-button w-full justify-center"
                    type="submit"
                    disabled={Boolean(busyAction)}
                  >
                    <Mail size={16} />
                    {busyAction === 'invitation-create' ? '正在创建...' : '发送邀请'}
                  </button>
                </form>
              ) : (
                <p className="notice">共同家长可查看成员和邀请状态，邀请管理由家庭创建者处理。</p>
              )}
              {invitationLink && (
                <div className="notice space-y-2" role="status">
                  <strong className="block">最新邀请链接</strong>
                  <input
                    className="field"
                    value={invitationLink}
                    readOnly
                    aria-label="最新邀请链接"
                  />
                  <button
                    className="text-button"
                    type="button"
                    onClick={() =>
                      copyTextToClipboard(invitationLink)
                        .then(() => setFeedback({ tone: 'success', message: '邀请链接已复制。' }))
                        .catch(() =>
                          setFeedback({ tone: 'error', message: '复制失败，请手动复制。' }),
                        )
                    }
                  >
                    <Copy size={15} />
                    复制邀请链接
                  </button>
                </div>
              )}
            </div>
          )}
        </Panel>
        <Panel>
          <SectionTitle>家庭资料</SectionTitle>
          {profile.state === 'loading' && <EmptyState title="正在读取家庭资料" detail="请稍候。" />}
          {profile.state === 'error' && (
            <EmptyState title="家庭资料读取失败" detail="请刷新页面后重试。" />
          )}
          {profile.data && (
            <FamilyProfileFields
              key={`${profile.data.id}:${profile.data.name}:${profile.data.time_zone}`}
              profile={profile.data}
              busy={busyAction === 'family-profile'}
              onSubmit={updateFamilyProfile}
            />
          )}
        </Panel>
      </div>
      {revokingInvitation && (
        <Modal
          title="确认撤销共同家长邀请"
          onClose={() => !busyAction && setRevokingInvitation(null)}
        >
          <p className="font-semibold text-brown-light">
            撤销后，发送给 {revokingInvitation.email} 的现有邀请链接将立即失效。
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <button
              className="secondary-button"
              type="button"
              disabled={Boolean(busyAction)}
              onClick={() => setRevokingInvitation(null)}
            >
              取消
            </button>
            <button
              className="primary-button bg-red"
              type="button"
              disabled={Boolean(busyAction)}
              onClick={revokeInvitation}
            >
              {busyAction === `invitation-revoke:${revokingInvitation.id}`
                ? '正在撤销...'
                : '确认撤销'}
            </button>
          </div>
        </Modal>
      )}
      {createOpen && (
        <Modal title="添加孩子" onClose={() => !busyAction && setCreateOpen(false)}>
          {feedback?.tone === 'error' && (
            <p className="notice mb-4 text-red" role="alert">
              {feedback.message}
            </p>
          )}
          <form className="space-y-4" onSubmit={createChild} aria-busy={busyAction === 'create'}>
            <label className="field-label">
              昵称
              <input
                className="field"
                name="nickname"
                maxLength={80}
                required
                placeholder="孩子昵称"
              />
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
              生日（可选）
              <input className="field" name="birthday" type="date" />
            </label>
            <label className="field-label">
              登录凭据模式
              <select className="field" name="credential_type" defaultValue="pin">
                <option value="pin">PIN（4 至 6 位数字）</option>
                <option value="password">密码（至少 6 位并包含字母）</option>
              </select>
            </label>
            <label className="field-label">
              初始登录凭据
              <input className="field" name="credential" autoComplete="new-password" required />
            </label>
            <label className="field-label">
              再次输入
              <input
                className="field"
                name="credential_confirmation"
                autoComplete="new-password"
                required
              />
            </label>
            <button
              className="primary-button w-full justify-center"
              type="submit"
              disabled={Boolean(busyAction)}
            >
              {busyAction === 'create' ? '正在创建...' : '创建孩子档案'}
            </button>
          </form>
        </Modal>
      )}
      {editingChild && (
        <Modal
          title={`编辑${editingChild.nickname}的档案`}
          onClose={() => !busyAction && setEditingChild(null)}
        >
          {feedback?.tone === 'error' && (
            <p className="notice mb-4 text-red" role="alert">
              {feedback.message}
            </p>
          )}
          <form
            key={editingChild.id}
            className="space-y-4"
            onSubmit={updateChild}
            aria-busy={busyAction === `profile:${editingChild.id}`}
          >
            <label className="field-label">
              昵称
              <input
                className="field"
                name="nickname"
                defaultValue={editingChild.nickname}
                maxLength={80}
                required
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="field-label">
                性别
                <select className="field" name="gender" defaultValue={editingChild.gender}>
                  <option value="female">女孩</option>
                  <option value="male">男孩</option>
                </select>
              </label>
              <label className="field-label">
                年级
                <input
                  className="field"
                  name="grade"
                  maxLength={80}
                  defaultValue={editingChild.grade ?? ''}
                />
              </label>
            </div>
            <label className="field-label">
              生日（可选）
              <input
                className="field"
                name="birthday"
                type="date"
                defaultValue={editingChild.birthday ?? ''}
              />
            </label>
            <label className="field-label">
              更换头像（可选）
              <input
                className="field"
                name="avatar"
                type="file"
                accept="image/jpeg,image/png,image/webp"
              />
            </label>
            {editingChild.avatarMediaId && (
              <label className="flex items-center gap-2 font-bold text-brown-light">
                <input type="checkbox" name="clear_avatar" value="true" />
                移除当前头像
              </label>
            )}
            <button
              className="primary-button w-full justify-center"
              type="submit"
              disabled={Boolean(busyAction)}
            >
              {busyAction === `profile:${editingChild.id}` ? '正在保存...' : '保存档案'}
            </button>
          </form>
        </Modal>
      )}
      {credentialChild && (
        <Modal
          title={`重置${credentialChild.nickname}的登录凭据`}
          onClose={() => !busyAction && setCredentialChild(null)}
        >
          <p className="notice mb-4">保存后将撤销该孩子在所有设备上的现有登录会话。</p>
          {feedback?.tone === 'error' && (
            <p className="notice mb-4 text-red" role="alert">
              {feedback.message}
            </p>
          )}
          <form
            key={credentialChild.id}
            className="space-y-4"
            onSubmit={resetCredential}
            aria-busy={busyAction === `credential:${credentialChild.id}`}
          >
            <label className="field-label">
              凭据模式
              <select
                className="field"
                name="credential_type"
                defaultValue={credentialChild.credentialType}
              >
                <option value="pin">PIN（4 至 6 位数字）</option>
                <option value="password">密码（至少 6 位并包含字母）</option>
              </select>
            </label>
            <label className="field-label">
              新登录凭据
              <input className="field" name="credential" autoComplete="new-password" required />
            </label>
            <label className="field-label">
              再次输入
              <input
                className="field"
                name="credential_confirmation"
                autoComplete="new-password"
                required
              />
            </label>
            <button
              className="primary-button w-full justify-center"
              type="submit"
              disabled={Boolean(busyAction)}
            >
              {busyAction === `credential:${credentialChild.id}` ? '正在重置...' : '确认重置'}
            </button>
          </form>
        </Modal>
      )}
      {deactivatingChild && (
        <Modal title="确认停用孩子档案" onClose={() => !busyAction && setDeactivatingChild(null)}>
          <p className="font-semibold text-brown-light">
            停用后，{deactivatingChild.nickname}
            将立即退出所有设备。任务、打卡、积分和成长记录会继续保留。
          </p>
          {feedback?.tone === 'error' && (
            <p className="notice mt-4 text-red" role="alert">
              {feedback.message}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-3">
            <button
              className="secondary-button"
              type="button"
              disabled={Boolean(busyAction)}
              onClick={() => setDeactivatingChild(null)}
            >
              取消
            </button>
            <button
              className="primary-button bg-red"
              type="button"
              disabled={Boolean(busyAction)}
              onClick={deactivateChild}
            >
              {busyAction === `deactivate:${deactivatingChild.id}` ? '正在停用...' : '确认停用'}
            </button>
          </div>
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

const emptyEmailDraft: EmailIntegrationDraft = {
  host: '',
  port: '465',
  tlsMode: 'tls',
  fromName: 'FamilyStar',
  fromAddress: '',
  username: '',
  password: '',
};

const emptyCosDraft: CosIntegrationDraft = {
  bucket: '',
  region: '',
  domain: '',
  secretId: '',
  secretKey: '',
};

function configurationString(configuration: Record<string, unknown> | null, key: string): string {
  const value = configuration?.[key];
  return typeof value === 'string' ? value : '';
}

function configurationNumber(configuration: Record<string, unknown> | null, key: string): string {
  const value = configuration?.[key];
  return typeof value === 'number' ? String(value) : '';
}

function integrationStatus(resource: IntegrationResource | null): string {
  if (!resource?.configured) return '未配置';
  if (resource.status === 'verified') return '验证通过';
  if (resource.status === 'invalid') return '验证失败';
  return '待验证';
}

function verificationCode(resource: IntegrationResource): string {
  const code = resource.last_verification_result?.code;
  const labels: Record<string, string> = {
    email_test_sent: '测试邮件已发送',
    cos_probe_ok: '对象存储探测通过',
    cos_content_mismatch: '探测对象内容不一致',
    cos_cors_invalid: 'Bucket CORS 需要允许当前站点、PUT 方法并暴露 ETag',
    cos_cleanup_failed: '探测对象清理失败',
    cos_probe_failed: '对象存储连接失败',
    smtp_host_blocked: 'SMTP 地址不允许访问',
    smtp_timeout: 'SMTP 连接超时',
    email_configuration_invalid: '邮件配置无效',
  };
  return code ? (labels[code] ?? '连接验证失败') : '';
}

function IntegrationSettingsCard({ type }: { type: IntegrationType }) {
  const isEmail = type === 'email';
  const path = `/family/integrations/${type}`;
  const [resource, setResource] = useState<IntegrationResource | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [emailDraft, setEmailDraft] = useState(emptyEmailDraft);
  const [cosDraft, setCosDraft] = useState(emptyCosDraft);
  const [busy, setBusy] = useState<'save' | 'test' | 'delete' | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let active = true;
    parentApi<IntegrationResource>(path)
      .then((value) => {
        if (!active) return;
        setResource(value);
        setLoadState('live');
        if (isEmail) {
          setEmailDraft({
            ...emptyEmailDraft,
            host: configurationString(value.configuration, 'host'),
            port: configurationNumber(value.configuration, 'port') || emptyEmailDraft.port,
            tlsMode:
              value.configuration?.tls_mode === 'none' ||
              value.configuration?.tls_mode === 'starttls' ||
              value.configuration?.tls_mode === 'tls'
                ? value.configuration.tls_mode
                : emptyEmailDraft.tlsMode,
            fromName: configurationString(value.configuration, 'from_name') || 'FamilyStar',
            fromAddress: configurationString(value.configuration, 'from_address'),
          });
        } else {
          setCosDraft({
            ...emptyCosDraft,
            bucket: configurationString(value.configuration, 'bucket'),
            region: configurationString(value.configuration, 'region'),
            domain: configurationString(value.configuration, 'domain'),
          });
        }
      })
      .catch(() => active && setLoadState('error'));
    return () => {
      active = false;
    };
  }, [isEmail, path]);

  async function saveIntegration(event: FormEvent) {
    event.preventDefault();
    setBusy('save');
    setMessage(null);
    try {
      const payload = isEmail
        ? buildEmailIntegrationPayload(emailDraft, resource?.configured ?? false)
        : buildCosIntegrationPayload(cosDraft, resource?.configured ?? false);
      const updated = await parentApi<IntegrationResource>(path, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setResource(updated);
      setEmailDraft((current) => ({ ...current, username: '', password: '' }));
      setCosDraft((current) => ({ ...current, secretId: '', secretKey: '' }));
      setMessage({ kind: 'success', text: '配置已保存，请执行连接测试' });
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : '配置保存失败',
      });
    } finally {
      setBusy(null);
    }
  }

  async function testIntegration() {
    setBusy('test');
    setMessage(null);
    try {
      const updated = await parentApi<IntegrationResource>(`${path}/test`, { method: 'POST' });
      setResource(updated);
      setMessage({
        kind: updated.status === 'verified' ? 'success' : 'error',
        text: verificationCode(updated) || integrationStatus(updated),
      });
    } catch {
      setMessage({ kind: 'error', text: '连接测试失败，请检查配置后重试' });
    } finally {
      setBusy(null);
    }
  }

  async function deleteIntegration() {
    setBusy('delete');
    setMessage(null);
    try {
      await parentApi<void>(path, { method: 'DELETE' });
      setResource({
        configured: false,
        status: null,
        configuration: null,
        credentials_configured: false,
        last_verified_at: null,
        last_verification_result: null,
        can_manage: true,
      });
      setEmailDraft(emptyEmailDraft);
      setCosDraft(emptyCosDraft);
      setConfirmDelete(false);
      setMessage({ kind: 'success', text: '配置已删除' });
    } catch {
      setMessage({ kind: 'error', text: '删除失败，请刷新后重试' });
    } finally {
      setBusy(null);
    }
  }

  const status = integrationStatus(resource);
  return (
    <Panel>
      <SectionTitle
        action={
          <span
            className={`status-chip ${resource?.status === 'verified' ? 'bg-leaf-light text-leaf-dark' : 'bg-sand text-brown-light'}`}
          >
            {status}
          </span>
        }
      >
        <span className="inline-flex items-center gap-2">
          {isEmail ? <Mail size={20} /> : <Camera size={20} />}
          {isEmail ? '家庭邮件' : '腾讯云 COS'}
        </span>
      </SectionTitle>
      {loadState === 'loading' && <EmptyState title="正在读取配置" detail="请稍候。" />}
      {loadState === 'error' && <EmptyState title="配置读取失败" detail="请刷新页面后重试。" />}
      {resource && !resource.can_manage && (
        <div className="space-y-3">
          <p className="notice">仅家庭创建者可维护集成配置。</p>
          {Object.entries(resource.configuration ?? {}).map(([key, value]) => (
            <div className="list-row" key={key}>
              <span className="font-extrabold text-brown-light">{key}</span>
              <strong className="break-all text-right">{String(value)}</strong>
            </div>
          ))}
          {resource.last_verified_at && (
            <p className="text-caption font-bold text-brown-light">
              最近验证：{new Date(resource.last_verified_at).toLocaleString('zh-CN')}
            </p>
          )}
        </div>
      )}
      {resource?.can_manage && (
        <form className="space-y-4" onSubmit={saveIntegration}>
          {isEmail ? (
            <div className="form-grid">
              <label className="field-label">
                SMTP Host
                <input
                  className="field"
                  required
                  value={emailDraft.host}
                  onChange={(event) => setEmailDraft({ ...emailDraft, host: event.target.value })}
                />
              </label>
              <label className="field-label">
                SMTP Port
                <input
                  className="field"
                  type="number"
                  min="1"
                  max="65535"
                  required
                  value={emailDraft.port}
                  onChange={(event) => setEmailDraft({ ...emailDraft, port: event.target.value })}
                />
              </label>
              <label className="field-label">
                TLS 模式
                <select
                  className="field"
                  value={emailDraft.tlsMode}
                  onChange={(event) =>
                    setEmailDraft({
                      ...emailDraft,
                      tlsMode: event.target.value as EmailIntegrationDraft['tlsMode'],
                    })
                  }
                >
                  <option value="tls">TLS</option>
                  <option value="starttls">STARTTLS</option>
                  <option value="none">无加密</option>
                </select>
              </label>
              <label className="field-label">
                发件人名称
                <input
                  className="field"
                  required
                  value={emailDraft.fromName}
                  onChange={(event) =>
                    setEmailDraft({ ...emailDraft, fromName: event.target.value })
                  }
                />
              </label>
              <label className="field-label">
                发件邮箱
                <input
                  className="field"
                  type="email"
                  required
                  value={emailDraft.fromAddress}
                  onChange={(event) =>
                    setEmailDraft({ ...emailDraft, fromAddress: event.target.value })
                  }
                />
              </label>
              <label className="field-label">
                SMTP 用户名
                <input
                  className="field"
                  autoComplete="off"
                  required={!resource.configured}
                  value={emailDraft.username}
                  onChange={(event) =>
                    setEmailDraft({ ...emailDraft, username: event.target.value })
                  }
                />
              </label>
              <label className="field-label">
                密码或授权码
                <input
                  className="field"
                  type="password"
                  autoComplete="new-password"
                  required={!resource.configured}
                  value={emailDraft.password}
                  onChange={(event) =>
                    setEmailDraft({ ...emailDraft, password: event.target.value })
                  }
                />
              </label>
            </div>
          ) : (
            <div className="form-grid">
              <label className="field-label">
                Bucket
                <input
                  className="field"
                  required
                  value={cosDraft.bucket}
                  onChange={(event) => setCosDraft({ ...cosDraft, bucket: event.target.value })}
                />
              </label>
              <label className="field-label">
                Region
                <input
                  className="field"
                  required
                  value={cosDraft.region}
                  onChange={(event) => setCosDraft({ ...cosDraft, region: event.target.value })}
                />
              </label>
              <label className="field-label md:col-span-2">
                访问域名
                <input
                  className="field"
                  type="url"
                  required
                  value={cosDraft.domain}
                  onChange={(event) => setCosDraft({ ...cosDraft, domain: event.target.value })}
                />
              </label>
              <label className="field-label">
                SecretId
                <input
                  className="field"
                  type="password"
                  autoComplete="off"
                  required={!resource.configured}
                  value={cosDraft.secretId}
                  onChange={(event) => setCosDraft({ ...cosDraft, secretId: event.target.value })}
                />
              </label>
              <label className="field-label">
                SecretKey
                <input
                  className="field"
                  type="password"
                  autoComplete="new-password"
                  required={!resource.configured}
                  value={cosDraft.secretKey}
                  onChange={(event) => setCosDraft({ ...cosDraft, secretKey: event.target.value })}
                />
              </label>
            </div>
          )}
          {resource.last_verified_at && (
            <p className="text-caption font-bold text-brown-light">
              最近验证：{new Date(resource.last_verified_at).toLocaleString('zh-CN')}
            </p>
          )}
          {message && (
            <p
              className={`notice ${message.kind === 'error' ? 'text-red' : 'text-leaf-dark'}`}
              role={message.kind === 'error' ? 'alert' : 'status'}
            >
              {message.text}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {resource.configured && (
              <button
                className="text-button text-red"
                type="button"
                disabled={busy !== null}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={16} />
                删除
              </button>
            )}
            <button
              className="secondary-button"
              type="button"
              disabled={!resource.configured || busy !== null}
              aria-busy={busy === 'test'}
              onClick={testIntegration}
            >
              <CheckCircle2 size={16} />
              {busy === 'test' ? '测试中' : '测试连接'}
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={busy !== null}
              aria-busy={busy === 'save'}
            >
              <Save size={16} />
              {busy === 'save' ? '保存中' : '保存配置'}
            </button>
          </div>
        </form>
      )}
      {confirmDelete && (
        <Modal
          title={`删除${isEmail ? '家庭邮件' : '腾讯云 COS'}配置`}
          onClose={() => setConfirmDelete(false)}
        >
          <p className="font-bold text-brown-light">配置与加密凭证将一并删除。</p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setConfirmDelete(false)}
            >
              取消
            </button>
            <button
              className="primary-button bg-red"
              type="button"
              disabled={busy !== null}
              onClick={deleteIntegration}
            >
              {busy === 'delete' ? '删除中' : '确认删除'}
            </button>
          </div>
        </Modal>
      )}
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
  return (
    <>
      <PageHeader
        eyebrow="让规则适合自己的家庭"
        title="设置"
        description="维护打卡、审核、兑换和连续奖励规则。"
        state={resource.state}
      />
      {resource.data ? (
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
                    onChange={(e) =>
                      setSettings({ ...settings, check_in_deadline: e.target.value })
                    }
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
          <div className="mt-5 flex items-center justify-end gap-3">
            <span
              className={`text-caption font-extrabold ${message.startsWith('保存失败') ? 'text-red' : 'text-leaf-dark'}`}
              role={message.startsWith('保存失败') ? 'alert' : 'status'}
            >
              {message}
            </span>
            <button className="primary-button" type="submit">
              <Save size={17} />
              保存家庭规则
            </button>
          </div>
        </form>
      ) : (
        <Panel>
          <EmptyState
            title={resource.state === 'error' ? '家庭规则读取失败' : '正在读取家庭规则'}
            detail={resource.state === 'error' ? '请刷新页面后重试。' : '规则加载完成后即可编辑。'}
          />
        </Panel>
      )}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <IntegrationSettingsCard type="email" />
        <IntegrationSettingsCard type="cos" />
      </div>
      <div className="mt-5">
        <Panel>
          <SectionTitle>更多能力</SectionTitle>
          <ComingSoonRow icon={<Bell />} title="通知偏好与免打扰" detail="即将推出" />
          <ComingSoonRow icon={<ShieldCheck />} title="PWA 与动态模块开关" detail="即将推出" />
        </Panel>
      </div>
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
export function Modal({
  children,
  title,
  onClose,
  onKeyDown,
  closeDisabled = false,
}: {
  children: ReactNode;
  title: string;
  onClose: () => void;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void;
  closeDisabled?: boolean;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    firstFocusable?.focus();
    return () => previousFocus?.focus();
  }, []);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!closeDisabled) onCloseRef.current();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  const content = (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={() => !closeDisabled && onClose()}
    >
      <section
        ref={dialogRef}
        className="modal max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id="modal-title" className="font-display text-title">
            {title}
          </h2>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="关闭弹窗"
            disabled={closeDisabled}
          >
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
  return typeof document === 'undefined' ? content : createPortal(content, document.body);
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
