'use client';

import { CalendarDays, CheckCircle2, Clock3, RotateCcw, Sparkles, Target } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

import { type ApiLoadState } from '../lib/api-resource';
import { parentApi } from '../lib/parent-portal';
import {
  buildFamilyAnalyticsPath,
  buildFamilyDashboardPath,
  type AnalyticsFilters,
  type FamilyAnalyticsResponse,
  type FamilyDashboardResponse,
} from '../lib/read-models';

type ChildOption = { id: string; nickname: string };
type TaskOption = { id: string; name: string };

const activityLabels: Readonly<Record<string, string>> = {
  CHECK_IN_SUBMITTED: '提交了打卡',
  COLLABORATION_CHECK_IN_SUBMITTED: '提交了协作打卡',
  SUBMISSION_REVIEWED: '完成了打卡审核',
  POINTS_CHANGED: '积分发生变化',
  LEVEL_ADVANCED: '解锁了新等级',
  REDEMPTION_REQUESTED: '申请了奖励兑换',
  REDEMPTION_APPROVED: '奖励兑换已批准',
  REDEMPTION_REJECTED: '奖励兑换已处理',
  REDEMPTION_FULFILLED: '奖励已经兑现',
  WISH_CREATED: '许下了新愿望',
  WISH_ADOPTED: '愿望被家庭采纳',
  WISH_CANCELLED: '取消了愿望',
  MEMBER_JOINED: '加入了家庭',
  MEMBER_DEACTIVATED: '家庭成员已停用',
  INVITATION_CREATED: '发出了家长邀请',
  INVITATION_ACCEPTED: '家长邀请已接受',
  INVITATION_EXPIRED: '家长邀请已过期',
  BADGE_AWARDED: '获得了新徽章',
};

function calendarDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function defaultAnalyticsFilters(): AnalyticsFilters {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  return { startDate: calendarDate(start), endDate: calendarDate(end) };
}

function updateAnalyticsFilter(
  filters: AnalyticsFilters,
  key: 'childId' | 'taskId',
  value: string,
): AnalyticsFilters {
  const updated: {
    startDate: string;
    endDate: string;
    childId?: string;
    taskId?: string;
  } = { ...filters };
  if (value) updated[key] = value;
  else delete updated[key];
  return updated;
}

function StateMessage({
  state,
  loading,
  error,
  onRetry,
}: Readonly<{
  state: ApiLoadState;
  loading: string;
  error: string;
  onRetry: () => void;
}>) {
  if (state === 'loading') {
    return (
      <div className="empty-state" role="status">
        <span className="loading-dot" />
        <strong>{loading}</strong>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="empty-state" role="alert">
        <RotateCcw aria-hidden="true" size={30} />
        <strong>{error}</strong>
        <button type="button" className="secondary-button" onClick={onRetry}>
          重新加载
        </button>
      </div>
    );
  }
  return null;
}

export type ParentDashboardViewProps = Readonly<{
  dashboard: FamilyDashboardResponse | null;
  state: ApiLoadState;
  onRetry: () => void;
}>;

export function ParentDashboardView({ dashboard, state, onRetry }: ParentDashboardViewProps) {
  if (state === 'loading' || state === 'error' || !dashboard) {
    return (
      <section className="panel mt-5">
        <StateMessage
          state={state}
          loading="正在读取家庭总览"
          error="家庭总览暂时无法读取"
          onRetry={onRetry}
        />
      </section>
    );
  }

  const todos = [
    { label: '待审核打卡', ...dashboard.todos.pending_reviews },
    { label: '待审批兑换', ...dashboard.todos.pending_redemptions },
    { label: '待兑现奖励', ...dashboard.todos.pending_fulfillments },
  ];
  const todoTotal = todos.reduce((sum, todo) => sum + todo.count, 0);

  return (
    <>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <section className="panel">
          <h2 className="mb-4 font-display text-section text-brown">孩子今日进度</h2>
          {dashboard.children.length === 0 ? (
            <div className="empty-state">
              <Target aria-hidden="true" size={30} />
              <strong>还没有活动孩子</strong>
              <p>前往家庭成员页创建孩子档案。</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {dashboard.children.map((child) => {
                const progress =
                  child.task_total === 0
                    ? 0
                    : Math.round((child.completed_count / child.task_total) * 100);
                return (
                  <article key={child.child_id} className="soft-card">
                    <div className="flex items-center gap-3">
                      <span className="avatar">{child.nickname.slice(0, 1)}</span>
                      <div>
                        <h3 className="font-extrabold">{child.nickname}</h3>
                        <p className="text-caption font-bold text-brown-light">
                          {child.completed_count} / {child.task_total} 项已完成
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 h-2.5 overflow-hidden rounded-pill bg-sand">
                      <span
                        className="block h-full rounded-pill bg-gradient-to-r from-leaf to-leaf-dark"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="mt-4 flex justify-between text-caption font-extrabold">
                      <span>{child.pending_review_count} 项待审核</span>
                      <span className="text-orange">+{child.points_earned} 星</span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
        <section className="panel">
          <h2 className="mb-4 font-display text-section text-brown">今日待办</h2>
          {todoTotal === 0 ? (
            <div className="empty-state min-h-40">
              <CheckCircle2 aria-hidden="true" size={32} />
              <strong>今天的待办已处理完成</strong>
            </div>
          ) : (
            <div className="space-y-3">
              {todos.map((todo) => (
                <Link key={todo.label} href={todo.target_url} className="todo-row">
                  <span className="flex-1 font-extrabold">{todo.label}</span>
                  <strong className="text-orange">{todo.count}</strong>
                  <span aria-hidden="true">›</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
      <section className="panel mt-5">
        <h2 className="mb-4 font-display text-section text-brown">最近家庭动态</h2>
        {dashboard.recent_activity.length === 0 ? (
          <div className="empty-state">
            <Sparkles aria-hidden="true" size={30} />
            <strong>还没有近期动态</strong>
            <p>完成任务、审核或兑换后，家庭故事会出现在这里。</p>
          </div>
        ) : (
          <div className="divide-y divide-sand">
            {dashboard.recent_activity.map((activity) => (
              <Link key={activity.id} href={activity.target_url} className="list-row">
                <span className="grid size-11 shrink-0 place-items-center rounded-card bg-sky/30 text-blue">
                  <Sparkles aria-hidden="true" size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <strong>
                    {activity.child?.nickname ?? activity.actor?.nickname ?? '家庭成员'}
                  </strong>
                  <p className="text-caption font-bold text-brown-light">
                    {activityLabels[activity.type] ?? '产生了一条家庭动态'}
                  </p>
                </div>
                <time className="text-caption font-bold text-brown-light">
                  {new Date(activity.occurred_at).toLocaleString('zh-CN', {
                    timeZone: dashboard.time_zone,
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export function ParentDashboardSection() {
  const [date, setDate] = useState('');
  const [dashboard, setDashboard] = useState<FamilyDashboardResponse | null>(null);
  const [state, setState] = useState<ApiLoadState>('loading');

  async function load(selectedDate: string): Promise<void> {
    setState('loading');
    try {
      setDashboard(
        await parentApi<FamilyDashboardResponse>(buildFamilyDashboardPath(selectedDate)),
      );
      setState('live');
    } catch {
      setState('error');
    }
  }

  useEffect(() => {
    const initialDate = calendarDate();
    setDate(initialDate);
    void load(initialDate);
  }, []);

  return (
    <>
      <header className="mb-6 flex items-end justify-between gap-4 mobile:items-start mobile:flex-col">
        <div>
          <p className="eyebrow">今天也在一起成长</p>
          <h1 className="font-display text-page">家庭总览</h1>
          <p className="mt-2 font-bold text-brown-light">查看孩子今日进度、家庭待办和近期动态。</p>
        </div>
        <label className="field-label w-full max-w-52">
          总览日期
          <input
            type="date"
            className="field"
            value={date}
            onChange={(event) => {
              const value = event.target.value;
              setDate(value);
              if (value) void load(value);
            }}
          />
        </label>
      </header>
      <ParentDashboardView dashboard={dashboard} state={state} onRetry={() => void load(date)} />
    </>
  );
}

export type ParentAnalyticsViewProps = Readonly<{
  analytics: FamilyAnalyticsResponse | null;
  state: ApiLoadState;
  onRetry: () => void;
}>;

function percentage(value: number | null): string {
  return value === null ? '暂无计划' : `${Math.round(value * 100)}%`;
}

export function ParentAnalyticsView({ analytics, state, onRetry }: ParentAnalyticsViewProps) {
  if (state === 'loading' || state === 'error' || !analytics) {
    return (
      <section className="panel mt-5">
        <StateMessage
          state={state}
          loading="正在计算成长统计"
          error="成长统计暂时无法读取"
          onRetry={onRetry}
        />
      </section>
    );
  }

  const maxTrend = Math.max(1, ...analytics.points_trend.map((item) => item.points_earned));
  const maxLevelCount = Math.max(
    1,
    ...analytics.level_distribution.map((item) => item.child_count),
  );

  return (
    <>
      <div className="metric-grid mt-5">
        <article className="metric">
          <span>计划次数</span>
          <strong className="ml-auto font-display text-subtitle text-orange">
            {analytics.overview.scheduled_count}
          </strong>
        </article>
        <article className="metric">
          <span>完成次数</span>
          <strong className="ml-auto font-display text-subtitle text-leaf-dark">
            {analytics.overview.completed_count}
          </strong>
        </article>
        <article className="metric">
          <span>完成率</span>
          <strong className="ml-auto font-display text-subtitle text-blue">
            {percentage(analytics.overview.completion_rate)}
          </strong>
        </article>
        <article className="metric">
          <span>获得积分</span>
          <strong className="ml-auto font-display text-subtitle text-pink-dark">
            {analytics.overview.points_earned}
          </strong>
        </article>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="panel">
          <h2 className="mb-4 font-display text-section text-brown">积分趋势</h2>
          <div className="chart-bars min-h-52" aria-label="每日积分趋势">
            {analytics.points_trend.map((item) => (
              <div key={item.date} className="chart-column">
                <strong className="text-caption font-extrabold text-orange">
                  {item.points_earned}
                </strong>
                <span
                  className="w-full rounded-t-card bg-gradient-to-t from-orange to-yellow"
                  style={{ height: `${Math.max(4, (item.points_earned / maxTrend) * 120)}px` }}
                />
                <small>{item.date.slice(5)}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2 className="mb-4 font-display text-section text-brown">当前等级分布</h2>
          {analytics.level_distribution.length === 0 ? (
            <div className="empty-state min-h-40">
              <Target aria-hidden="true" size={30} />
              <strong>当前筛选下没有孩子</strong>
            </div>
          ) : (
            <div className="space-y-3">
              {analytics.level_distribution.map((item) => (
                <div key={item.level}>
                  <div className="mb-1 flex justify-between text-caption font-extrabold">
                    <span>Lv.{item.level}</span>
                    <span>{item.child_count} 人</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-pill bg-sand">
                    <span
                      className="block h-full rounded-pill bg-blue"
                      style={{ width: `${(item.child_count / maxLevelCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <section className="panel mt-5">
        <h2 className="mb-4 font-display text-section text-brown">任务表现</h2>
        {analytics.task_performance.length === 0 ? (
          <div className="empty-state">
            <CalendarDays aria-hidden="true" size={30} />
            <strong>当前筛选下没有计划任务</strong>
          </div>
        ) : (
          <div className="divide-y divide-sand">
            {analytics.task_performance.map((task) => (
              <article key={task.task_id} className="list-row">
                <span className="grid size-11 place-items-center rounded-card bg-leaf/20 text-leaf-dark">
                  <CheckCircle2 aria-hidden="true" size={20} />
                </span>
                <div className="flex-1">
                  <strong>{task.task_name}</strong>
                  <p className="text-caption font-bold text-brown-light">
                    {task.completed_count} / {task.scheduled_count} 次完成
                  </p>
                </div>
                <strong className="text-orange">{percentage(task.completion_rate)}</strong>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export function ParentAnalyticsSection() {
  const [draft, setDraft] = useState<AnalyticsFilters>({ startDate: '', endDate: '' });
  const [applied, setApplied] = useState<AnalyticsFilters | null>(null);
  const [analytics, setAnalytics] = useState<FamilyAnalyticsResponse | null>(null);
  const [state, setState] = useState<ApiLoadState>('loading');
  const [children, setChildren] = useState<ChildOption[]>([]);
  const [tasks, setTasks] = useState<TaskOption[]>([]);

  async function load(filters: AnalyticsFilters): Promise<void> {
    setState('loading');
    try {
      setAnalytics(await parentApi<FamilyAnalyticsResponse>(buildFamilyAnalyticsPath(filters)));
      setState('live');
    } catch {
      setState('error');
    }
  }

  useEffect(() => {
    const initial = defaultAnalyticsFilters();
    setDraft(initial);
    setApplied(initial);
    void load(initial);
    void parentApi<{ children: ChildOption[] }>('/family/children')
      .then((data) => setChildren(data.children))
      .catch(() => setChildren([]));
    void parentApi<{ tasks: TaskOption[] }>('/family/tasks')
      .then((data) => setTasks(data.tasks))
      .catch(() => setTasks([]));
  }, []);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setApplied(draft);
    void load(draft);
  }

  return (
    <>
      <header className="mb-6 flex items-end justify-between gap-4 mobile:items-start mobile:flex-col">
        <div>
          <p className="eyebrow">从趋势中找到陪伴重点</p>
          <h1 className="font-display text-page">数据面板</h1>
          <p className="mt-2 font-bold text-brown-light">按孩子、任务和日期观察家庭成长节奏。</p>
        </div>
      </header>
      <form className="panel mt-5" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="field-label">
            开始日期
            <input
              required
              type="date"
              className="field"
              value={draft.startDate}
              onChange={(event) => setDraft({ ...draft, startDate: event.target.value })}
            />
          </label>
          <label className="field-label">
            结束日期
            <input
              required
              type="date"
              className="field"
              value={draft.endDate}
              onChange={(event) => setDraft({ ...draft, endDate: event.target.value })}
            />
          </label>
          <label className="field-label">
            孩子
            <select
              className="field"
              value={draft.childId ?? ''}
              onChange={(event) =>
                setDraft(updateAnalyticsFilter(draft, 'childId', event.target.value))
              }
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
              value={draft.taskId ?? ''}
              onChange={(event) =>
                setDraft(updateAnalyticsFilter(draft, 'taskId', event.target.value))
              }
            >
              <option value="">全部任务</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="primary-button self-end"
            disabled={!draft.startDate || !draft.endDate}
          >
            <Clock3 aria-hidden="true" size={18} /> 应用筛选
          </button>
        </div>
      </form>
      <ParentAnalyticsView
        analytics={analytics}
        state={state}
        onRetry={() => applied && void load(applied)}
      />
    </>
  );
}
