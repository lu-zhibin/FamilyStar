'use client';

import {
  Activity,
  ArrowLeft,
  BookOpen,
  Camera,
  Check,
  Clock3,
  Flame,
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
  Upload,
  UserRound,
  Video,
  X,
} from 'lucide-react';
import Link from 'next/link';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react';

import {
  ChildApiError,
  belongsToCurrentChild,
  childApi,
  childSectionPaths,
  createIdempotencyKey,
  effectiveRewardCost,
  formatCountdown,
  type ChildSection,
} from '../lib/child-portal';
import { ChildShell } from './child-shell';

type LoadState = 'loading' | 'live' | 'demo';
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
type ChildTask = {
  id: string;
  assignmentId: string;
  roundId?: string;
  name: string;
  category: string;
  points: number;
  mode: 'SOLO' | 'COLLAB';
  checkType: 'CHECKBOX' | 'TEXT' | 'PHOTO' | 'VIDEO' | 'MIXED';
  status: 'OPEN' | 'PENDING' | 'APPROVED' | 'REJECTED';
  instructions: string;
  participants?: string[];
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

const currentChildId = '00000000-0000-4000-8000-000000000002';
const demoLevel: LevelView = {
  user_id: currentChildId,
  points_earned_total: 480,
  current_level: 5,
  current: { level: 5, name: '闪耀', icon: 'Star', points_required: 350 },
  benefits: { discount: 0.9, effective_auto_approve_quota: 30, wish_slots: 2 },
  next: {
    level: 6,
    name: '黑铁',
    icon: 'Flame',
    points_required: 600,
    points_remaining: 120,
    progress_ratio: 0.52,
  },
};
const demoTasks: ChildTask[] = [
  {
    id: 'reading',
    assignmentId: '00000000-0000-4000-8000-000000000101',
    name: '晨读 20 分钟',
    category: '阅读',
    points: 10,
    mode: 'SOLO',
    checkType: 'CHECKBOX',
    status: 'APPROVED',
    instructions: '认真朗读今天的课文。',
  },
  {
    id: 'rope',
    assignmentId: '00000000-0000-4000-8000-000000000102',
    name: '跳绳 100 个',
    category: '运动',
    points: 15,
    mode: 'SOLO',
    checkType: 'VIDEO',
    status: 'APPROVED',
    instructions: '上传一段跳绳视频，最长 3 分钟。',
  },
  {
    id: 'desk',
    assignmentId: '00000000-0000-4000-8000-000000000103',
    name: '整理书桌',
    category: '家务',
    points: 10,
    mode: 'SOLO',
    checkType: 'PHOTO',
    status: 'PENDING',
    instructions: '上传整理完成后的照片。',
  },
  {
    id: 'math',
    assignmentId: '00000000-0000-4000-8000-000000000104',
    name: '数学口算练习',
    category: '学习',
    points: 20,
    mode: 'SOLO',
    checkType: 'TEXT',
    status: 'OPEN',
    instructions: '写下今天完成的页码和正确率。',
  },
  {
    id: 'clean',
    assignmentId: '00000000-0000-4000-8000-000000000105',
    roundId: '00000000-0000-4000-8000-000000000205',
    name: '周末大扫除',
    category: '协作',
    points: 15,
    mode: 'COLLAB',
    checkType: 'MIXED',
    status: 'OPEN',
    instructions: '完成自己的区域，拍照并说说做了什么。',
    participants: ['昊昊', '妞妞'],
  },
];
const demoRewards: Reward[] = [
  {
    id: '00000000-0000-4000-8000-000000000301',
    name: '动画时间 30 分钟',
    description: '周末自由选择一集动画',
    points_cost: 30,
    type: 'PRIVILEGE',
    stock_available: null,
    prerequisites: {},
  },
  {
    id: '00000000-0000-4000-8000-000000000302',
    name: '一本课外书',
    description: '和爸爸妈妈一起挑选',
    points_cost: 50,
    type: 'PHYSICAL',
    stock_available: 4,
    prerequisites: { min_level: 3 },
  },
  {
    id: '00000000-0000-4000-8000-000000000303',
    name: '周末游乐园',
    description: '全家出发的一日体验',
    points_cost: 200,
    type: 'EXPERIENCE',
    stock_available: 1,
    prerequisites: { min_level: 6 },
  },
  {
    id: '00000000-0000-4000-8000-000000000304',
    name: '晚睡 30 分钟',
    description: '周五晚上使用',
    points_cost: 40,
    type: 'PRIVILEGE',
    stock_available: null,
    prerequisites: {},
  },
];
const demoRedemptions: Redemption[] = [
  {
    id: 'redemption-1',
    child_id: currentChildId,
    reward_id: '00000000-0000-4000-8000-000000000301',
    points_spent: 27,
    status: 'APPROVED',
  },
];
const demoWishes: Wish[] = [
  {
    id: 'wish-1',
    child_id: currentChildId,
    title: '乐高千年隼',
    target_points: 300,
    progress: { points: 165, remaining: 135, ratio: 0.55 },
  },
];
const demoTargets: SwitchTarget[] = [
  { id: currentChildId, nickname: '昊昊', grade: '三年级', gender: 'male' },
  {
    id: '00000000-0000-4000-8000-000000000003',
    nickname: '妞妞',
    grade: '学前班',
    gender: 'female',
  },
];

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

function useApiData<T>(path: string, key: string, fallback: T) {
  const fallbackRef = useRef(fallback);
  const [data, setData] = useState(fallback);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    let active = true;
    childApi<Record<string, T>>(path)
      .then((payload) => {
        if (active) {
          setData(payload[key] ?? fallbackRef.current);
          setState('live');
        }
      })
      .catch(() => active && setState('demo'));
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
  return (
    <span className="child-status bg-sand text-brown-light" title={limited}>
      演示数据
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
          <strong className="child-big-number">165</strong>
          <span className="pb-1 font-extrabold">可用星星</span>
        </div>
        <span className="child-glass-chip mt-3">
          <Flame aria-hidden="true" size={17} /> 连续打卡 7 天
        </span>
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

function TaskCard({ task, onOpen }: Readonly<{ task: ChildTask; onOpen?: () => void }>) {
  const complete = task.status === 'APPROVED' || task.status === 'PENDING';
  const status = {
    OPEN: '去打卡',
    PENDING: '审核中',
    APPROVED: '已完成',
    REJECTED: '重新打卡',
  }[task.status];
  return (
    <article className={`child-task-card ${complete ? 'child-task-complete' : ''}`}>
      <span className="child-task-icon">
        {task.category === '运动' ? <Activity /> : <BookOpen />}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-extrabold">{task.name}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-label font-bold text-brown-light">
          <span className={task.mode === 'COLLAB' ? 'tag bg-sky/20 text-blue' : 'tag-green tag'}>
            {task.mode === 'COLLAB' ? '协作' : '个人'}
          </span>
          <span>{task.category}</span>
          <strong className="text-orange">+{task.points} 星</strong>
        </div>
        {task.participants && (
          <p className="mt-1 text-label font-extrabold text-blue">
            伙伴：{task.participants.join('、')}
          </p>
        )}
      </div>
      {task.status === 'OPEN' || task.status === 'REJECTED' ? (
        <button type="button" className="child-action-button" onClick={onOpen}>
          {status}
        </button>
      ) : (
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-leaf text-white">
          {task.status === 'PENDING' ? <Clock3 size={21} /> : <Check size={24} />}
          <span className="sr-only">{status}</span>
        </span>
      )}
    </article>
  );
}

function HomePage({
  level,
  levelState,
  onCheckIn,
}: Readonly<{
  level: LevelView;
  levelState: LoadState;
  onCheckIn: (task: ChildTask) => void;
}>) {
  const visibleTasks = demoTasks.slice(2);
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
        <div className="child-task-grid">
          {visibleTasks.map((task) => (
            <TaskCard key={task.id} task={task} onOpen={() => onCheckIn(task)} />
          ))}
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-2 child-animate-in child-delay-2">
        <div className="child-card bg-gradient-to-br from-sky/40 to-white">
          <SectionHeading title="我的愿望" />
          <strong className="text-subtitle">乐高千年隼</strong>
          <div className="mt-3">
            <ProgressBar value={0.55} label="165 / 300 星" />
          </div>
          <p className="mt-2 text-caption font-bold text-blue">再攒 135 星就实现愿望</p>
        </div>
        <div className="child-card">
          <SectionHeading title="最新鼓励" />
          <div className="flex items-start gap-3">
            <span className="grid size-11 place-items-center rounded-full bg-sand font-display">
              爸
            </span>
            <p className="font-bold text-brown-light">
              数学练习越来越认真了，今天也继续保持！
              <span className="mt-1 block text-label">昨天 20:16</span>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function CheckInsPage({ onCheckIn }: Readonly<{ onCheckIn: (task: ChildTask) => void }>) {
  const personal = demoTasks.filter((task) => task.mode === 'SOLO');
  const collaboration = demoTasks.filter((task) => task.mode === 'COLLAB');
  const done = demoTasks.filter((task) => ['PENDING', 'APPROVED'].includes(task.status)).length;
  return (
    <div className="space-y-6">
      <section className="child-hero child-hero-orange child-animate-in">
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-subtitle">今日打卡</h1>
            <span className="child-glass-chip">23:59 截止</span>
          </div>
          <strong className="child-big-number mt-3 block">
            {done}
            <small className="text-subtitle"> / {demoTasks.length} 完成</small>
          </strong>
          <div className="mt-3 rounded-card bg-white/20 p-3">
            <ProgressBar value={done / demoTasks.length} label="今日进度" />
          </div>
        </div>
      </section>
      <section className="child-animate-in child-delay-1">
        <SectionHeading title={`个人任务 ${personal.length}`} />
        <div className="child-task-grid">
          {personal.map((task) => (
            <TaskCard key={task.id} task={task} onOpen={() => onCheckIn(task)} />
          ))}
        </div>
      </section>
      <section className="child-animate-in child-delay-2">
        <SectionHeading title={`协作任务 ${collaboration.length}`} />
        <div className="child-task-grid">
          {collaboration.map((task) => (
            <TaskCard key={task.id} task={task} onOpen={() => onCheckIn(task)} />
          ))}
        </div>
      </section>
      <div className="notice" role="note">
        <ShieldAlert aria-hidden="true" className="shrink-0 text-blue" />
        <p>
          今日任务聚合接口将在核心闭环阶段接入。当前任务卡为演示数据；真实提交会显示服务端冲突、拒绝和上传失败原因。
        </p>
      </div>
    </div>
  );
}

function AchievementsPage({ level, state }: Readonly<{ level: LevelView; state: LoadState }>) {
  const badges = [
    ['Flame', '坚持 7 天', true],
    ['Book', '阅读达人', true],
    ['Team', '最佳搭档', true],
    ['First', '首次兑换', false],
    ['Target', '积分破千', false],
  ] as const;
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
        <SectionHeading
          title="徽章墙"
          action={<span className="child-status bg-sand text-brown-light">演示数据</span>}
        />
        <div className="child-badge-grid">
          {badges.map(([icon, name, earned]) => (
            <article key={name} className={`child-badge ${earned ? '' : 'child-badge-locked'}`}>
              <Trophy aria-hidden="true" size={28} />
              <strong>{name}</strong>
              <small>{earned ? `${icon} 已获得` : '继续努力'}</small>
            </article>
          ))}
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
  const balance = 165;
  return (
    <div className="space-y-6">
      <section className="child-hero child-hero-purple child-animate-in">
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div>
            <p className="font-extrabold">我的星星</p>
            <strong className="child-big-number">{balance}</strong>
            <p className="text-label font-bold">等级折扣已自动计算</p>
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
              const disabled = levelLocked || unavailable || cost > balance;
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
                        : cost > balance
                          ? '星星不足'
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
  const records = [
    { title: '完成晨读 20 分钟', date: '7 月 30 日', type: '阅读', media: 2 },
    { title: '和妞妞一起大扫除', date: '7 月 28 日', type: '协作', media: 3 },
  ];
  return (
    <div className="space-y-6">
      <section className="child-hero child-hero-blue child-animate-in">
        <Link href={childSectionPaths.profile} className="child-glass-chip mb-3 w-fit">
          <ArrowLeft aria-hidden="true" size={17} /> 返回我的信息
        </Link>
        <h1 className="font-display text-page">我的记录</h1>
        <p className="mt-2 font-bold">每一次坚持，都在这里变成闪亮回忆。</p>
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-card bg-white/20 p-3 text-center">
          <div>
            <strong className="block text-subtitle">18</strong>
            <small>本月打卡</small>
          </div>
          <div>
            <strong className="block text-subtitle">7</strong>
            <small>连续天数</small>
          </div>
          <div>
            <strong className="block text-subtitle">32</strong>
            <small>成长照片</small>
          </div>
        </div>
      </section>
      <div className="notice child-animate-in child-delay-1" role="note">
        <ShieldAlert aria-hidden="true" className="shrink-0 text-blue" />
        <p>本人打卡历史与批量媒体签名接口待接入，以下时间线用于展示页面结构和空数据边界。</p>
      </div>
      <section className="child-animate-in child-delay-2">
        <SectionHeading
          title="成长时间线"
          action={<span className="child-status bg-sand text-brown-light">演示数据</span>}
        />
        <div className="space-y-4 border-l-4 border-dashed border-wood pl-5">
          {records.map((record) => (
            <article key={record.title} className="child-card relative">
              <span className="absolute -left-[34px] top-5 size-4 rounded-full border-4 border-cream bg-sky" />
              <small className="font-extrabold text-brown-light">{record.date}</small>
              <h2 className="mt-1 font-extrabold">{record.title}</h2>
              <div className="child-photo-grid mt-3">
                {Array.from({ length: record.media }, (_, index) => (
                  <div key={index} className="child-photo-placeholder">
                    <ImageIcon aria-hidden="true" />
                    <span className="sr-only">成长照片 {index + 1}</span>
                  </div>
                ))}
              </div>
              <span className="tag-green tag mt-3">{record.type}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function ProfilePage({
  level,
  onPassword,
}: Readonly<{ level: LevelView; onPassword: () => void }>) {
  const ranking = [
    ['潼潼', 280, 6],
    ['昊昊', 165, 5],
    ['妞妞', 90, 4],
  ] as const;
  return (
    <div className="space-y-6">
      <section className="child-hero child-hero-green child-animate-in text-center">
        <div className="child-profile-avatar">昊</div>
        <h1 className="mt-3 font-display text-page">昊昊</h1>
        <p className="font-extrabold">三年级 · 密码模式</p>
        <span className="child-glass-chip mt-3">
          Lv.{level.current_level} {level.current.name}
        </span>
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-card bg-white/20 p-3">
          <div>
            <strong className="block text-subtitle">165</strong>
            <small>星星</small>
          </div>
          <div>
            <strong className="block text-subtitle">7</strong>
            <small>连续天数</small>
          </div>
          <div>
            <strong className="block text-subtitle">18</strong>
            <small>本月打卡</small>
          </div>
        </div>
      </section>
      <section className="child-card child-animate-in child-delay-1">
        <SectionHeading
          title="家庭排行"
          action={<span className="child-status bg-sand text-brown-light">演示数据</span>}
        />
        <p className="mb-3 text-caption font-bold text-brown-light">
          余额、累计积分与等级排行聚合接口待接入。
        </p>
        {ranking.map(([name, points, rank], index) => (
          <div
            key={name}
            className={`list-row ${name === '昊昊' ? 'rounded-card bg-sand px-3' : ''}`}
          >
            <strong className="w-8 font-display text-title">{index + 1}</strong>
            <span className="child-avatar !size-10 !text-body">{name.slice(0, 1)}</span>
            <div className="flex-1">
              <strong>
                {name}
                {name === '昊昊' ? '（我）' : ''}
              </strong>
              <p className="text-label font-bold text-brown-light">Lv.{rank}</p>
            </div>
            <strong className="font-display text-orange">{points} 星</strong>
          </div>
        ))}
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

function CheckInModal({ task, onClose }: Readonly<{ task: ChildTask; onClose: () => void }>) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [submitting, setSubmitting] = useState(false);

  function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    const images = selected.filter((file) => file.type.startsWith('image/'));
    const videos = selected.filter((file) => file.type.startsWith('video/'));
    if (images.length > 9 || videos.length > 1) {
      setFeedback({ tone: 'error', message: '最多选择 9 张照片和 1 个视频。' });
      return;
    }
    if (images.some((file) => file.size > 25 * 1024 * 1024)) {
      setFeedback({ tone: 'error', message: '每张照片不能超过 25MB。' });
      return;
    }
    if (videos.some((file) => file.size > 100 * 1024 * 1024)) {
      setFeedback({ tone: 'error', message: '视频不能超过 100MB。' });
      return;
    }
    setFiles(selected);
    setFeedback(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const requiresText = task.checkType === 'TEXT';
    const requiresMedia = ['PHOTO', 'VIDEO'].includes(task.checkType);
    if (requiresText && !text.trim()) {
      setFeedback({ tone: 'error', message: '请写下完成情况。' });
      return;
    }
    if (requiresMedia && files.length === 0) {
      setFeedback({ tone: 'error', message: '请先选择任务要求的媒体文件。' });
      return;
    }
    if (files.length > 0) {
      setFeedback({
        tone: 'warning',
        message: '媒体已在本地完成校验。家庭 COS 与今日任务聚合接通后即可上传并提交。',
      });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      const path = task.roundId
        ? `/collaboration-rounds/${task.roundId}/submissions`
        : '/check-ins';
      const body = task.roundId
        ? { content: { text: text.trim() || undefined, media_ids: [] } }
        : {
            task_assignment_id: task.assignmentId,
            content: { text: text.trim() || undefined, media_ids: [] },
          };
      await childApi(path, {
        method: 'POST',
        headers: { 'Idempotency-Key': createIdempotencyKey('check-in') },
        body: JSON.stringify(body),
      });
      setFeedback({ tone: 'success', message: '打卡成功！审核通过后星星会自动到账。' });
    } catch (error) {
      const message = error instanceof ChildApiError ? error.message : '提交失败，请稍后重试。';
      const prefix =
        error instanceof ChildApiError && error.status === 409 ? '任务状态刚刚变化：' : '';
      setFeedback({ tone: 'error', message: `${prefix}${message}` });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={task.name} onClose={onClose}>
      <form className="mt-4" onSubmit={submit}>
        <div className="rounded-card bg-sand p-3 text-caption font-bold text-brown-light">
          <strong className="block text-brown">任务说明</strong>
          {task.instructions}
        </div>
        {['TEXT', 'MIXED'].includes(task.checkType) && (
          <label className="field-label mt-4">
            说说完成情况
            <textarea
              className="field min-h-28 py-3"
              value={text}
              maxLength={10_000}
              onChange={(event) => setText(event.target.value)}
              placeholder="今天完成了什么？"
            />
          </label>
        )}
        {['PHOTO', 'VIDEO', 'MIXED'].includes(task.checkType) && (
          <label className="child-upload mt-4">
            <Upload aria-hidden="true" size={28} />
            <strong>选择照片或视频</strong>
            <small>照片最多 9 张；视频最长 3 分钟且不超过 100MB</small>
            <input
              className="sr-only"
              type="file"
              accept="image/*,video/*"
              multiple={task.checkType === 'MIXED' || task.checkType === 'PHOTO'}
              onChange={chooseFiles}
            />
          </label>
        )}
        {files.length > 0 && (
          <ul className="mt-3 space-y-2" aria-label="已选择媒体">
            {files.map((file) => (
              <li
                key={`${file.name}-${file.lastModified}`}
                className="flex items-center gap-2 rounded-card bg-cream p-2 text-label font-bold"
              >
                {file.type.startsWith('video/') ? <Video size={17} /> : <Camera size={17} />}
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span>{Math.ceil(file.size / 1024)}KB</span>
              </li>
            ))}
          </ul>
        )}
        <Feedback value={feedback} />
        <button type="submit" className="child-success-button mt-5" disabled={submitting}>
          {submitting ? <RefreshCw className="animate-spin" /> : <Sparkles />}
          {submitting ? '正在提交' : '完成打卡'}
        </button>
      </form>
    </Modal>
  );
}

function SwitchModal({ onClose }: Readonly<{ onClose: () => void }>) {
  const { data: targets, state } = useApiData('/auth/switch-targets', 'children', demoTargets);
  const [selected, setSelected] = useState(targets[0]?.id ?? currentChildId);
  const [credential, setCredential] = useState('');
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [remaining]);

  async function submit(event: FormEvent) {
    event.preventDefault();
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
            disabled={remaining > 0}
            onChange={(event) => setCredential(event.target.value)}
          />
        </label>
        {remaining > 0 && (
          <p className="mt-3 font-display text-title text-red" role="timer">
            账号保护倒计时 {formatCountdown(remaining)}
          </p>
        )}
        <Feedback value={feedback} />
        <button type="submit" className="child-success-button mt-5" disabled={remaining > 0}>
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
  const { data: level, state: levelState } = useApiData('/levels/me', 'level', demoLevel);
  const { data: rewards, state: rewardsState } = useApiData('/rewards', 'rewards', demoRewards);
  const { data: rawRedemptions, setData: setRedemptions } = useApiData(
    '/redemptions',
    'redemptions',
    demoRedemptions,
  );
  const { data: rawWishes, setData: setWishes } = useApiData('/wishes', 'wishes', demoWishes);
  const redemptions = belongsToCurrentChild(rawRedemptions, level.user_id);
  const wishes = belongsToCurrentChild(rawWishes, level.user_id);
  const [checkInTask, setCheckInTask] = useState<ChildTask | null>(null);
  const [reward, setReward] = useState<Reward | null>(null);
  const [switching, setSwitching] = useState(false);
  const [wishing, setWishing] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const page = {
    home: <HomePage level={level} levelState={levelState} onCheckIn={setCheckInTask} />,
    'check-ins': <CheckInsPage onCheckIn={setCheckInTask} />,
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
    profile: <ProfilePage level={level} onPassword={() => setChangingPassword(true)} />,
  }[section];

  return (
    <ChildShell section={section} onSwitch={() => setSwitching(true)}>
      {page}
      {checkInTask && <CheckInModal task={checkInTask} onClose={() => setCheckInTask(null)} />}
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
