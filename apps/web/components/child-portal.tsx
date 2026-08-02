'use client';

import {
  ArrowLeft,
  BookOpen,
  Gift,
  Image as ImageIcon,
  LockKeyhole,
  Medal,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Star,
  Target,
  Trophy,
  UserRound,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { loadedState, readApiField, type ApiLoadState } from '../lib/api-resource';
import {
  ChildApiError,
  belongsToCurrentChild,
  childApi,
  childSectionPaths,
  createIdempotencyKey,
  currentCalendarDate,
  effectiveRewardCost,
  formatCountdown,
  type ChildSection,
} from '../lib/child-portal';
import { ChildShell } from './child-shell';

type LoadState = ApiLoadState;
type FeedbackState = { tone: 'success' | 'warning' | 'error'; message: string } | null;
type LevelView = {
  user_id: string;
  points_earned_total: number;
  current_level: number;
  current: { level: number; name: string; icon: string; points_required: number };
  benefits: {
    discount: number;
    effective_auto_approve_quota: number;
    wish_slots: number;
  };
  next: null | {
    level: number;
    name: string;
    icon: string;
    points_required: number;
    points_remaining: number;
    progress_ratio: number;
  };
};
type Reward = {
  id: string;
  name: string;
  description: string | null;
  points_cost: number;
  type: string;
  stock_available: number | null;
  prerequisites: { min_level?: number };
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
  progress: { points: number; remaining: number; ratio: number };
};
type SwitchTarget = {
  id: string;
  nickname: string;
  grade: string | null;
  gender: 'male' | 'female';
};
type ChildTask = {
  task_id: string;
  task_assignment_id: string;
  name: string;
  description: string | null;
  submission_guide: string | null;
  collaboration_mode: 'SOLO' | 'COLLAB';
  frequency: { kind: string; count?: number; weekdays?: number[] };
  points: number;
  check_type: 'TICK' | 'TEXT' | 'PHOTO' | 'VIDEO' | 'MIXED';
  verify_mode: 'AUTO' | 'MANUAL';
  start_date: string;
  end_date: string | null;
};

const levelNames = [
  '新星',
  '萌芽',
  '成长',
  '进阶',
  '闪耀',
  '黑铁',
  '青铜',
  '白银',
  '黄金',
  '钻石',
  '星耀',
  '王者',
  '荣耀',
  '史诗',
  '传奇',
  '超凡',
  '至尊',
  '宗师',
  '不朽',
  '传说',
];

function useApiData<T>(path: string, key: string, initialValue: T) {
  const [data, setData] = useState(initialValue);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    let active = true;
    childApi<Record<string, unknown>>(path)
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

  return { data, setData, state };
}

function DataStatus({ state, limited }: Readonly<{ state: LoadState; limited?: string }>) {
  if (state === 'loading') {
    return (
      <span className="child-status bg-sky/20 text-blue" role="status">
        <span className="loading-dot" /> 正在同步
      </span>
    );
  }
  if (state === 'live') {
    return <span className="child-status bg-leaf-light text-leaf-dark">实时数据</span>;
  }
  if (state === 'empty') {
    return <span className="child-status bg-sand text-brown-light">暂无数据</span>;
  }
  return (
    <span className="child-status bg-red/5 text-red" role="alert" title={limited}>
      读取失败
    </span>
  );
}

function Feedback({ value }: Readonly<{ value: FeedbackState }>) {
  if (!value) return null;
  const styles = {
    success: 'border-leaf bg-leaf-light text-leaf-dark',
    warning: 'border-orange bg-sand text-brown',
    error: 'border-red bg-red/5 text-red',
  }[value.tone];
  return (
    <div
      className={`mt-4 rounded-card border p-3 text-caption font-extrabold ${styles}`}
      role="alert"
    >
      {value.message}
    </div>
  );
}

function SectionHeading({ title, action }: Readonly<{ title: string; action?: ReactNode }>) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="font-display text-title">{title}</h2>
      {action}
    </div>
  );
}

function ProgressBar({ value, label }: Readonly<{ value: number; label: string }>) {
  const percentage = Math.min(100, Math.max(0, Math.round(value * 100)));
  return (
    <div>
      <div className="mb-1 flex justify-between text-label font-extrabold">
        <span>{label}</span>
        <span>{percentage}%</span>
      </div>
      <div
        className="h-3 overflow-hidden rounded-pill bg-white/40"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
      >
        <span
          className="block h-full rounded-pill bg-gradient-to-r from-sun to-orange transition-[width]"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function LevelHero({ level, state }: Readonly<{ level: LevelView; state: LoadState }>) {
  return (
    <section className="child-hero child-hero-green child-animate-in">
      <div className="relative z-10">
        <div className="flex items-center justify-between gap-3">
          <span className="child-glass-chip">
            Lv.{level.current_level} {level.current.name}
          </span>
          <DataStatus state={state} />
        </div>
        <div className="mt-4 flex items-end gap-2">
          <strong className="child-big-number">{level.points_earned_total}</strong>
          <span className="pb-1 font-extrabold">累计星星</span>
        </div>
        <div className="mt-4 rounded-card bg-white/20 p-3">
          <ProgressBar
            value={level.next?.progress_ratio ?? 1}
            label={
              level.next
                ? `累计 ${level.points_earned_total}，距离 Lv.${level.next.level} 还差 ${level.next.points_remaining}`
                : '已达到最高等级'
            }
          />
        </div>
      </div>
    </section>
  );
}

function HomePage({
  level,
  levelState,
  wishes,
  tasks,
  tasksState,
}: Readonly<{
  level: LevelView;
  levelState: LoadState;
  wishes: Wish[];
  tasks: ChildTask[];
  tasksState: LoadState;
}>) {
  return (
    <div className="space-y-6">
      <LevelHero level={level} state={levelState} />
      <section className="child-animate-in child-delay-1">
        <SectionHeading
          title="今日任务"
          action={
            <Link href={childSectionPaths['check-ins']} className="text-button">
              查看全部
            </Link>
          }
        />
        <TaskList tasks={tasks.slice(0, 3)} state={tasksState} compact />
      </section>
      <section className="grid gap-4 md:grid-cols-2 child-animate-in child-delay-2">
        <div className="child-card bg-gradient-to-br from-sky/40 to-white">
          <SectionHeading title="我的愿望" />
          {wishes[0] ? (
            <>
              <strong className="text-subtitle">{wishes[0].title}</strong>
              <div className="mt-3">
                <ProgressBar
                  value={wishes[0].progress.ratio}
                  label={`${wishes[0].progress.points} / ${wishes[0].target_points} 星`}
                />
              </div>
            </>
          ) : (
            <p className="font-bold text-brown-light">还没有创建愿望。</p>
          )}
        </div>
        <div className="child-card">
          <SectionHeading title="最新鼓励" />
          <p className="font-bold text-brown-light">家庭鼓励记录接口待接入。</p>
        </div>
      </section>
    </div>
  );
}

function TaskList({
  tasks,
  state,
  compact = false,
}: Readonly<{ tasks: ChildTask[]; state: LoadState; compact?: boolean }>) {
  if (state === 'loading' || state === 'error' || tasks.length === 0) {
    const content = {
      loading: ['正在读取今日任务', '加载完成后会显示分配给你的任务。'],
      error: ['今日任务读取失败', '请刷新页面后重试。'],
      empty: ['今天没有待办任务', '新的家庭任务会在分配后显示在这里。'],
      live: ['', ''],
    }[state];
    return (
      <div className="empty-state">
        <BookOpen aria-hidden="true" size={34} />
        <strong>{content[0]}</strong>
        <p>{content[1]}</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <article key={task.task_assignment_id} className="child-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-subtitle">{task.name}</h3>
                <span className="tag">
                  {task.collaboration_mode === 'COLLAB' ? '协作' : '个人'}
                </span>
              </div>
              {task.description && (
                <p className="mt-1 font-bold text-brown-light">{task.description}</p>
              )}
            </div>
            <strong className="whitespace-nowrap font-display text-orange">
              +{task.points} 星
            </strong>
          </div>
          {!compact && (
            <div className="mt-3 flex flex-wrap gap-2 text-caption font-extrabold text-brown-light">
              <span className="tag">
                {task.check_type === 'TICK' ? '勾选打卡' : `${task.check_type} 打卡`}
              </span>
              <span className="tag">{task.verify_mode === 'AUTO' ? '自动验收' : '家长审核'}</span>
              <span className="tag">待打卡</span>
            </div>
          )}
          {!compact && task.submission_guide && (
            <p className="notice mt-3">提交说明：{task.submission_guide}</p>
          )}
        </article>
      ))}
    </div>
  );
}

function CheckInsPage({ tasks, state }: Readonly<{ tasks: ChildTask[]; state: LoadState }>) {
  return (
    <div className="space-y-6">
      <section className="child-hero child-hero-orange child-animate-in">
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-subtitle">今日打卡</h1>
            <span className="child-glass-chip">23:59 截止</span>
          </div>
          <p className="mt-3 font-extrabold">今天有 {tasks.length} 项分配任务。</p>
        </div>
      </section>
      <section className="child-animate-in child-delay-1">
        <SectionHeading title="个人任务与协作任务" />
        <TaskList tasks={tasks} state={state} />
      </section>
      <div className="notice" role="note">
        <ShieldAlert aria-hidden="true" className="shrink-0 text-blue" />
        <p>任务来自当前账号的真实分配。完整文字与媒体提交入口将在打卡表单接入后开放。</p>
      </div>
    </div>
  );
}

function AchievementsPage({ level, state }: Readonly<{ level: LevelView; state: LoadState }>) {
  return (
    <div className="space-y-6">
      <section className="child-hero child-hero-gold child-animate-in text-[#6d4c00]">
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <span className="child-glass-chip">Lv.{level.current_level}</span>
            <DataStatus state={state} limited="徽章与积分流水接口待接入" />
          </div>
          <h1 className="mt-3 font-display text-[32px]">{level.current.name}</h1>
          <p className="font-extrabold">累计获得 {level.points_earned_total} 星，等级只升不降</p>
          <div className="mt-4 rounded-card bg-white/30 p-3">
            <ProgressBar value={level.next?.progress_ratio ?? 1} label="下一级进度" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="child-glass-chip">
              兑换 {Math.round(level.benefits.discount * 100)} 折
            </span>
            <span className="child-glass-chip">
              {level.benefits.effective_auto_approve_quota} 星内免审批
            </span>
            <span className="child-glass-chip">{level.benefits.wish_slots} 个愿望槽</span>
          </div>
        </div>
      </section>
      <section className="child-card child-animate-in child-delay-1">
        <SectionHeading title="20 级成长阶梯" />
        <div className="child-level-grid">
          {levelNames.map((name, index) => {
            const number = index + 1;
            return (
              <div
                key={name}
                className={`child-level-tile ${number <= level.current_level ? 'child-level-reached' : ''} ${number === level.current_level ? 'ring-2 ring-orange' : ''}`}
              >
                <Medal aria-hidden="true" size={20} />
                <span>Lv.{number}</span>
                <small>{name}</small>
              </div>
            );
          })}
        </div>
      </section>
      <section className="child-animate-in child-delay-2">
        <SectionHeading title="徽章墙" />
        <div className="empty-state">
          <Trophy aria-hidden="true" size={34} />
          <strong>徽章接口待接入</strong>
          <p>徽章规则和获得记录开放后会显示在这里。</p>
        </div>
      </section>
      <section className="child-card child-animate-in child-delay-3">
        <SectionHeading title="积分明细" />
        <div className="empty-state">
          <Star aria-hidden="true" size={34} />
          <strong>积分流水接口待接入</strong>
          <p>累计积分与当前等级来自实时等级接口，逐笔明细将在后续接口开放后展示。</p>
        </div>
      </section>
    </div>
  );
}

function RewardsPage({
  level,
  rewards,
  rewardsState,
  redemptions,
  wishes,
  onRedeem,
  onWish,
}: Readonly<{
  level: LevelView;
  rewards: Reward[];
  rewardsState: LoadState;
  redemptions: Redemption[];
  wishes: Wish[];
  onRedeem: (reward: Reward) => void;
  onWish: () => void;
}>) {
  return (
    <div className="space-y-6">
      <section className="child-hero child-hero-purple child-animate-in">
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div>
            <p className="font-extrabold">我的星星</p>
            <strong className="text-subtitle">余额接口待接入</strong>
            <p className="text-label font-bold">累计星星 {level.points_earned_total}</p>
          </div>
          <div className="rounded-card bg-white/20 p-3 text-center text-label font-extrabold">
            {level.benefits.effective_auto_approve_quota} 星内
            <br />
            自动批准
          </div>
        </div>
      </section>
      {wishes[0] && (
        <section className="child-card bg-gradient-to-br from-sky/40 to-white child-animate-in child-delay-1">
          <SectionHeading
            title="我的愿望"
            action={
              <span className="tag bg-sky/20 text-blue">1 / {level.benefits.wish_slots}</span>
            }
          />
          <strong>{wishes[0].title}</strong>
          <div className="mt-3">
            <ProgressBar
              value={wishes[0].progress.ratio}
              label={`${wishes[0].progress.points} / ${wishes[0].target_points} 星`}
            />
          </div>
        </section>
      )}
      <section className="child-animate-in child-delay-2">
        <SectionHeading title="奖励商店" action={<DataStatus state={rewardsState} />} />
        {rewards.length === 0 ? (
          <div className="empty-state">
            <Gift aria-hidden="true" size={36} />
            <strong>奖励池还是空的</strong>
            <p>等家长上架奖励后再来看看。</p>
          </div>
        ) : (
          <div className="child-reward-grid">
            {rewards.map((reward) => {
              const cost = effectiveRewardCost(reward.points_cost, level.benefits.discount);
              const levelLocked = (reward.prerequisites.min_level ?? 1) > level.current_level;
              const unavailable = reward.stock_available === 0;
              const disabled = levelLocked || unavailable;
              return (
                <article
                  key={reward.id}
                  className={`child-reward-card ${disabled ? 'opacity-65' : ''}`}
                >
                  <Gift aria-hidden="true" className="text-pink-dark" size={38} />
                  <strong className="mt-2">{reward.name}</strong>
                  <p className="mt-1 text-label font-bold text-brown-light">{reward.description}</p>
                  <div className="mt-2 font-display text-subtitle text-orange">
                    {level.benefits.discount < 1 && (
                      <small className="mr-1 font-sans text-label text-brown-light line-through">
                        {reward.points_cost}
                      </small>
                    )}
                    {cost} 星
                  </div>
                  <button
                    type="button"
                    className="child-action-button mt-3 w-full"
                    disabled={disabled}
                    onClick={() => onRedeem(reward)}
                  >
                    {levelLocked
                      ? `Lv.${reward.prerequisites.min_level} 解锁`
                      : unavailable
                        ? '已兑完'
                        : '立即兑换'}
                  </button>
                </article>
              );
            })}
          </div>
        )}
        <button type="button" className="child-dashed-button mt-4" onClick={onWish}>
          <Plus aria-hidden="true" /> 我要许愿
        </button>
      </section>
      <section className="child-card child-animate-in child-delay-3">
        <SectionHeading title="我的兑换" />
        {redemptions.length === 0 ? (
          <div className="empty-state min-h-32">
            <Gift aria-hidden="true" />
            <strong>还没有兑换记录</strong>
          </div>
        ) : (
          redemptions.map((redemption) => (
            <div key={redemption.id} className="list-row">
              <span className="grid size-11 place-items-center rounded-card bg-pink/30">
                <Gift aria-hidden="true" />
              </span>
              <div className="flex-1">
                <strong>
                  {rewards.find((item) => item.id === redemption.reward_id)?.name ?? '家庭奖励'}
                </strong>
                <p className="text-label font-bold text-brown-light">
                  已预扣 {redemption.points_spent} 星
                </p>
              </div>
              <span className="tag-green tag">
                {redemption.status === 'APPROVED' ? '待兑现' : '待审批'}
              </span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function RecordsPage() {
  return (
    <div className="space-y-6">
      <section className="child-hero child-hero-blue child-animate-in">
        <Link href={childSectionPaths.profile} className="child-glass-chip mb-3 w-fit">
          <ArrowLeft aria-hidden="true" size={17} /> 返回我的信息
        </Link>
        <h1 className="font-display text-page">我的记录</h1>
        <p className="mt-2 font-bold">每一次坚持，都在这里变成闪亮回忆。</p>
      </section>
      <div className="notice child-animate-in child-delay-1" role="note">
        <ShieldAlert aria-hidden="true" className="shrink-0 text-blue" />
        <p>本人打卡历史与批量媒体签名接口待接入。</p>
      </div>
      <section className="child-animate-in child-delay-2">
        <SectionHeading title="成长时间线" />
        <div className="empty-state">
          <ImageIcon aria-hidden="true" size={34} />
          <strong>成长记录接口待接入</strong>
          <p>真实打卡与媒体记录开放后会显示在这里。</p>
        </div>
      </section>
    </div>
  );
}

function ProfilePage({
  level,
  child,
  onPassword,
}: Readonly<{
  level: LevelView;
  child: SwitchTarget | undefined;
  onPassword: () => void;
}>) {
  const nickname = child?.nickname ?? '孩子账号';
  return (
    <div className="space-y-6">
      <section className="child-hero child-hero-green child-animate-in text-center">
        <div className="child-profile-avatar">{nickname.slice(0, 1)}</div>
        <h1 className="mt-3 font-display text-page">{nickname}</h1>
        <p className="font-extrabold">{child?.grade ?? '未设置年级'}</p>
        <span className="child-glass-chip mt-3">
          Lv.{level.current_level} {level.current.name}
        </span>
        <div className="mt-4 rounded-card bg-white/20 p-3">
          <div>
            <strong className="block text-subtitle">{level.points_earned_total}</strong>
            <small>累计星星</small>
          </div>
        </div>
      </section>
      <section className="child-card child-animate-in child-delay-1">
        <SectionHeading title="家庭排行" />
        <div className="empty-state">
          <Medal aria-hidden="true" size={34} />
          <strong>排行接口待接入</strong>
          <p>家庭成员积分与等级聚合完成后会显示在这里。</p>
        </div>
      </section>
      <section className="child-card child-animate-in child-delay-2">
        <SectionHeading title="我的空间" />
        <Link href={childSectionPaths.records} className="child-menu-item">
          <BookOpen aria-hidden="true" className="text-blue" />
          <span className="flex-1">我的记录</span>
          <span aria-hidden="true">›</span>
        </Link>
        <button type="button" className="child-menu-item w-full" onClick={onPassword}>
          <LockKeyhole aria-hidden="true" className="text-orange" />
          <span className="flex-1 text-left">修改密码</span>
          <span aria-hidden="true">›</span>
        </button>
        <div className="child-menu-item opacity-70">
          <Sparkles aria-hidden="true" className="text-pink-dark" />
          <span className="flex-1">主题皮肤</span>
          <span className="tag">即将推出</span>
        </div>
      </section>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: Readonly<{ title: string; children: ReactNode; onClose: () => void }>) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal max-h-[88vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="child-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="child-modal-title" className="font-display text-title">
            {title}
          </h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭弹窗">
            <X aria-hidden="true" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function SwitchModal({ onClose }: Readonly<{ onClose: () => void }>) {
  const { data: targets, state } = useApiData<SwitchTarget[]>(
    '/auth/switch-targets',
    'children',
    [],
  );
  const [selected, setSelected] = useState('');
  const [credential, setCredential] = useState('');
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [remaining]);

  useEffect(() => {
    setSelected((current) =>
      targets.some((target) => target.id === current) ? current : (targets[0]?.id ?? ''),
    );
  }, [targets]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) {
      setFeedback({ tone: 'error', message: '当前家庭没有可切换的孩子账号。' });
      return;
    }
    if (!credential) {
      setFeedback({ tone: 'error', message: '请输入 PIN 或密码。' });
      return;
    }
    try {
      const result = await childApi<{ child: SwitchTarget }>('/auth/child/switch', {
        method: 'POST',
        body: JSON.stringify({ child_id: selected, credential }),
      });
      window.localStorage.setItem('familystar_role', 'child');
      window.localStorage.setItem('familystar_child_id', result.child.id);
      window.location.assign('/child');
    } catch (error) {
      const seconds =
        error instanceof ChildApiError
          ? Number(error.details?.remaining_seconds ?? error.details?.retry_after_seconds ?? 0)
          : 0;
      if (Number.isFinite(seconds) && seconds > 0) setRemaining(seconds);
      setFeedback({
        tone: 'error',
        message: error instanceof ChildApiError ? error.message : '切换失败，请稍后再试。',
      });
    }
  }

  return (
    <Modal title="切换家庭账号" onClose={onClose}>
      <form className="mt-4" onSubmit={submit}>
        <div className="grid grid-cols-2 gap-3">
          {targets.map((target) => (
            <button
              key={target.id}
              type="button"
              className={`rounded-card border-2 p-4 text-center ${selected === target.id ? 'border-leaf bg-leaf-light' : 'border-wood bg-cream'}`}
              onClick={() => setSelected(target.id)}
              aria-pressed={selected === target.id}
            >
              <span className="child-avatar mx-auto">{target.nickname.slice(0, 1)}</span>
              <strong className="mt-2 block">{target.nickname}</strong>
              <small>{target.grade}</small>
            </button>
          ))}
        </div>
        {targets.length === 0 && state !== 'loading' && (
          <div className="empty-state mt-3">
            <UserRound aria-hidden="true" />
            <strong>没有可切换的孩子账号</strong>
          </div>
        )}
        <div className="mt-3">
          <DataStatus state={state} />
        </div>
        <label className="field-label mt-4">
          PIN 或密码
          <input
            className="field"
            type="password"
            value={credential}
            autoComplete="current-password"
            disabled={remaining > 0 || !selected}
            onChange={(event) => setCredential(event.target.value)}
          />
        </label>
        {remaining > 0 && (
          <p className="mt-3 font-display text-title text-red" role="timer">
            账号保护倒计时 {formatCountdown(remaining)}
          </p>
        )}
        <Feedback value={feedback} />
        <button
          type="submit"
          className="child-success-button mt-5"
          disabled={remaining > 0 || !selected}
        >
          <UserRound aria-hidden="true" /> 进入个人空间
        </button>
      </form>
    </Modal>
  );
}

function PasswordModal({ onClose }: Readonly<{ onClose: () => void }>) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (nextPassword.length < 6 || !/[a-z]/i.test(nextPassword)) {
      setFeedback({ tone: 'error', message: '新密码至少 6 位，并且必须包含字母。' });
      return;
    }
    try {
      await childApi('/auth/child/password', {
        method: 'PATCH',
        body: JSON.stringify({ current_password: currentPassword, new_password: nextPassword }),
      });
      setFeedback({ tone: 'success', message: '密码已更新，请使用新密码重新进入个人空间。' });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof ChildApiError ? error.message : '密码更新失败，请稍后再试。',
      });
    }
  }

  return (
    <Modal title="修改密码" onClose={onClose}>
      <form className="mt-4" onSubmit={submit}>
        <label className="field-label">
          当前密码
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>
        <label className="field-label mt-4">
          新密码
          <input
            className="field"
            type="password"
            autoComplete="new-password"
            value={nextPassword}
            onChange={(event) => setNextPassword(event.target.value)}
          />
          <small className="mt-1 block">至少 6 位，并且包含字母。</small>
        </label>
        <Feedback value={feedback} />
        <button type="submit" className="child-success-button mt-5">
          <LockKeyhole aria-hidden="true" /> 更新密码
        </button>
      </form>
    </Modal>
  );
}

function RedemptionModal({
  reward,
  level,
  onClose,
  onCreated,
}: Readonly<{
  reward: Reward;
  level: LevelView;
  onClose: () => void;
  onCreated: (redemption: Redemption) => void;
}>) {
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [submitting, setSubmitting] = useState(false);
  const cost = effectiveRewardCost(reward.points_cost, level.benefits.discount);

  async function confirm() {
    setSubmitting(true);
    try {
      const result = await childApi<{ redemption: Redemption }>(
        `/rewards/${reward.id}/redemptions`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': createIdempotencyKey('redemption') },
          body: JSON.stringify({}),
        },
      );
      onCreated(result.redemption);
      setFeedback({ tone: 'success', message: '兑换申请成功，星星已预扣。' });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof ChildApiError ? error.message : '兑换失败，请稍后重试。',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="确认兑换" onClose={onClose}>
      <div className="mt-5 text-center">
        <Gift className="mx-auto text-pink-dark" size={56} />
        <h3 className="mt-3 font-display text-page">{reward.name}</h3>
        <p className="mt-2 font-bold text-brown-light">本次将预扣 {cost} 星</p>
        <p className="mt-1 text-caption font-bold text-blue">
          {cost <= level.benefits.effective_auto_approve_quota
            ? '额度内自动批准，兑换后等待家长兑现。'
            : '兑换后等待家长审批。'}
        </p>
      </div>
      <Feedback value={feedback} />
      <button
        type="button"
        className="child-success-button mt-5"
        onClick={confirm}
        disabled={submitting}
      >
        {submitting ? <RefreshCw className="animate-spin" /> : <Star />}
        {submitting ? '正在兑换' : `确认支付 ${cost} 星`}
      </button>
    </Modal>
  );
}

function WishModal({
  onClose,
  onCreated,
}: Readonly<{ onClose: () => void; onCreated: (wish: Wish) => void }>) {
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState(100);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await childApi<{ wish: Wish }>('/wishes', {
        method: 'POST',
        body: JSON.stringify({ title, target_points: target }),
      });
      onCreated(result.wish);
      setFeedback({ tone: 'success', message: '愿望已经放进愿望墙。' });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof ChildApiError ? error.message : '许愿失败。',
      });
    }
  }

  return (
    <Modal title="我要许愿" onClose={onClose}>
      <form className="mt-4" onSubmit={submit}>
        <label className="field-label">
          愿望名称
          <input
            className="field"
            required
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="field-label mt-4">
          目标星星
          <input
            className="field"
            type="number"
            required
            min={1}
            value={target}
            onChange={(event) => setTarget(Number(event.target.value))}
          />
        </label>
        <Feedback value={feedback} />
        <button type="submit" className="child-success-button mt-5">
          <Target /> 放进愿望墙
        </button>
      </form>
    </Modal>
  );
}

export function ChildPortal({ section }: Readonly<{ section: ChildSection }>) {
  const { data: level, state: levelState } = useApiData<LevelView | null>(
    '/levels/me',
    'level',
    null,
  );
  const { data: targets } = useApiData<SwitchTarget[]>('/auth/switch-targets', 'children', []);
  const { data: rewards, state: rewardsState } = useApiData<Reward[]>('/rewards', 'rewards', []);
  const { data: rawRedemptions, setData: setRedemptions } = useApiData<Redemption[]>(
    '/redemptions',
    'redemptions',
    [],
  );
  const { data: rawWishes, setData: setWishes } = useApiData<Wish[]>('/wishes', 'wishes', []);
  const { data: tasks, state: tasksState } = useApiData<ChildTask[]>(
    `/tasks/me?date=${currentCalendarDate()}`,
    'tasks',
    [],
  );
  const [reward, setReward] = useState<Reward | null>(null);
  const [switching, setSwitching] = useState(false);
  const [wishing, setWishing] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const currentChild = level ? targets.find((target) => target.id === level.user_id) : undefined;

  if (!level) {
    return (
      <ChildShell section={section} child={currentChild} onSwitch={() => setSwitching(true)}>
        <div className="child-card empty-state">
          <Star aria-hidden="true" size={34} />
          <strong>{levelState === 'error' ? '成长数据读取失败' : '正在读取成长数据'}</strong>
          <p>{levelState === 'error' ? '请刷新页面后重试。' : '加载完成后进入个人成长空间。'}</p>
        </div>
        {switching && <SwitchModal onClose={() => setSwitching(false)} />}
      </ChildShell>
    );
  }

  const redemptions = belongsToCurrentChild(rawRedemptions, level.user_id);
  const wishes = belongsToCurrentChild(rawWishes, level.user_id);

  const page = {
    home: (
      <HomePage
        level={level}
        levelState={levelState}
        wishes={wishes}
        tasks={tasks}
        tasksState={tasksState}
      />
    ),
    'check-ins': <CheckInsPage tasks={tasks} state={tasksState} />,
    achievements: <AchievementsPage level={level} state={levelState} />,
    rewards: (
      <RewardsPage
        level={level}
        rewards={rewards}
        rewardsState={rewardsState}
        redemptions={redemptions}
        wishes={wishes}
        onRedeem={setReward}
        onWish={() => setWishing(true)}
      />
    ),
    records: <RecordsPage />,
    profile: (
      <ProfilePage
        level={level}
        child={currentChild}
        onPassword={() => setChangingPassword(true)}
      />
    ),
  }[section];

  return (
    <ChildShell section={section} child={currentChild} onSwitch={() => setSwitching(true)}>
      {page}
      {reward && (
        <RedemptionModal
          reward={reward}
          level={level}
          onClose={() => setReward(null)}
          onCreated={(created) => setRedemptions((current) => [created, ...current])}
        />
      )}
      {switching && <SwitchModal onClose={() => setSwitching(false)} />}
      {wishing && (
        <WishModal
          onClose={() => setWishing(false)}
          onCreated={(created) => setWishes((current) => [created, ...current])}
        />
      )}
      {changingPassword && <PasswordModal onClose={() => setChangingPassword(false)} />}
    </ChildShell>
  );
}
