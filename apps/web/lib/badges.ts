export const badgeConditionTypes = [
  'MANUAL',
  'TASK_COMPLETION_COUNT',
  'STREAK_DAYS',
  'TOTAL_POINTS',
  'LEVEL_REACHED',
  'COLLABORATION_COUNT',
] as const;

export type BadgeConditionType = (typeof badgeConditionTypes)[number];
export type BadgeCondition =
  | Readonly<{ type: 'MANUAL' }>
  | Readonly<{ type: Exclude<BadgeConditionType, 'MANUAL'>; target: number }>;

export type BadgeTemplate = Readonly<{
  id: string;
  preset_code: string | null;
  name: string;
  description: string | null;
  icon: string;
  category: string;
  condition: BadgeCondition;
  award_level: number;
  is_visible: boolean;
  is_enabled: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}>;

export type BadgeAward = Readonly<{
  id: string;
  template_id: string;
  child_id: string;
  level: number;
  name: string;
  description: string | null;
  icon: string;
  category: string;
  condition: BadgeCondition;
  template_version: number;
  reason: string | null;
  awarded_by: string | null;
  awarded_at: string;
}>;

export type BadgeProgress = Readonly<{
  current_value: number;
  target_value: number;
  evaluated_at: string;
}>;

export type BadgeWallItem = Readonly<{
  template: BadgeTemplate;
  award: BadgeAward | null;
  progress: BadgeProgress | null;
}>;

export const badgeConditionLabels: Readonly<Record<BadgeConditionType, string>> = {
  MANUAL: '手动颁发',
  TASK_COMPLETION_COUNT: '累计完成任务',
  STREAK_DAYS: '连续打卡天数',
  TOTAL_POINTS: '累计获得星星',
  LEVEL_REACHED: '达到等级',
  COLLABORATION_COUNT: '累计完成协作',
};

type BadgeFormData = Pick<FormData, 'get' | 'has'>;

function positiveInteger(value: FormDataEntryValue | null, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${field}必须为正整数`);
  return parsed;
}

export function buildBadgeTemplatePayload(form: BadgeFormData) {
  const conditionType = String(form.get('condition_type')) as BadgeConditionType;
  if (!badgeConditionTypes.includes(conditionType)) throw new Error('徽章条件无效');
  const condition: BadgeCondition =
    conditionType === 'MANUAL'
      ? { type: 'MANUAL' }
      : {
          type: conditionType,
          target: positiveInteger(form.get('condition_target'), '条件目标'),
        };
  const description = String(form.get('description') ?? '').trim();

  return {
    name: String(form.get('name') ?? '').trim(),
    description: description || null,
    icon: String(form.get('icon') ?? '').trim(),
    category: String(form.get('category') ?? '').trim(),
    condition,
    award_level: positiveInteger(form.get('award_level'), '颁发级别'),
    is_visible: form.has('is_visible'),
    is_enabled: form.has('is_enabled'),
  };
}

export function badgeConditionLabel(condition: BadgeCondition): string {
  const label = badgeConditionLabels[condition.type];
  return condition.type === 'MANUAL' ? label : `${label} ${condition.target}`;
}

export function badgeProgressPercent(current: number, target: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((current / target) * 100)));
}
