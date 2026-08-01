export const BCRYPT_COST = 12;
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
export const CHILD_LOGIN_RATE_LIMIT = 10;
export const CHILD_LOGIN_RATE_WINDOW_SECONDS = 15 * 60;
export const CHILD_LOCK_ATTEMPTS = 5;
export const CHILD_LOCK_MILLISECONDS = 15 * 60 * 1000;
export const INVITATION_TTL_MILLISECONDS = 7 * 24 * 60 * 60 * 1000;
export const MAX_ACTIVE_PARENTS_PER_FAMILY = 2;
export const DEFAULT_FAMILY_TIME_ZONE = 'Asia/Shanghai';

export const DEFAULT_FAMILY_SETTINGS = Object.freeze({
  timeZone: DEFAULT_FAMILY_TIME_ZONE,
  checkInDeadline: '23:59',
  makeupDays: 3,
  reviewTimeoutHours: 48,
  autoApproveQuota: 0,
  streakMultipliers: Object.freeze([
    Object.freeze({ days: 3, multiplier: 1.5 }),
    Object.freeze({ days: 7, multiplier: 2 }),
    Object.freeze({ days: 14, multiplier: 3 }),
    Object.freeze({ days: 30, multiplier: 5 }),
    Object.freeze({ days: 60, multiplier: 8 }),
    Object.freeze({ days: 100, multiplier: 10 }),
  ]),
  broadcastEnabled: true,
});

export const DEFAULT_TASK_TYPES = Object.freeze([
  Object.freeze({ code: 'study', name: '学习', icon: '📚', sortOrder: 1 }),
  Object.freeze({ code: 'sport', name: '运动', icon: '🏃', sortOrder: 2 }),
  Object.freeze({ code: 'chore', name: '家务', icon: '🧹', sortOrder: 3 }),
  Object.freeze({ code: 'habit', name: '习惯', icon: '🧬', sortOrder: 4 }),
  Object.freeze({ code: 'custom', name: '自定义', icon: '🎯', sortOrder: 5 }),
]);

const LEVEL_NAMES = [
  ['新星', '⭐', 0],
  ['萌芽', '🌱', 30],
  ['成长', '🌿', 80],
  ['进阶', '🍀', 180],
  ['闪耀', '🌟', 350],
  ['黑铁', '🔥', 600],
  ['青铜', '🥉', 1_000],
  ['白银', '🥈', 1_600],
  ['黄金', '🥇', 2_500],
  ['钻石', '💎', 3_800],
  ['星耀', '⚡', 5_500],
  ['王者', '👑', 8_000],
  ['荣耀', '🏆', 11_000],
  ['至尊', '🔱', 15_000],
  ['传说', '🌙', 20_000],
  ['神话', '🌟', 28_000],
  ['永恒', '🐉', 38_000],
  ['创世', '🌌', 50_000],
  ['无尽', '♾️', 70_000],
  ['至臻', '✨', 100_000],
] as const;

const LEVEL_BONUSES = [
  [1, 0, 1],
  [1, 0, 1],
  [1, 0, 1],
  [0.9, 30, 2],
  [0.9, 30, 2],
  [0.85, 60, 3],
  [0.85, 60, 3],
  [0.8, 100, 4],
  [0.8, 100, 4],
  [0.75, 150, 4],
  [0.75, 150, 4],
  [0.7, 200, 5],
  [0.7, 200, 5],
  [0.65, 300, 5],
  [0.65, 300, 5],
  [0.6, 400, 6],
  [0.6, 400, 6],
  [0.55, 500, 6],
  [0.55, 500, 6],
  [0.5, 800, 8],
] as const;

export const DEFAULT_LEVEL_CONFIGS = Object.freeze(
  LEVEL_NAMES.map(([name, icon, pointsRequired], index) => {
    const bonus = LEVEL_BONUSES[index];
    if (!bonus) throw new Error('Missing default level bonus configuration.');
    return Object.freeze({
      level: index + 1,
      name,
      icon,
      pointsRequired,
      discount: bonus[0],
      autoApproveQuota: bonus[1],
      wishSlots: bonus[2],
    });
  }),
);

export function resolveFamilyTimeZone(candidate?: string): string {
  if (!candidate) return DEFAULT_FAMILY_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format();
    return candidate;
  } catch {
    return DEFAULT_FAMILY_TIME_ZONE;
  }
}
