import {
  DEFAULT_FAMILY_SETTINGS,
  DEFAULT_LEVEL_CONFIGS,
  DEFAULT_TASK_TYPES,
} from '../src/family-auth/constants.js';

const ids = {
  families: ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'],
  parents: [
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000004',
  ],
  children: [
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000004',
  ],
} as const;

export const DEVELOPMENT_SEED_CREDENTIALS = Object.freeze({
  parentPassword: 'FamilyStar2026!',
  childPins: ['1234', '5678', '2468', '1357'] as const,
});

export const DEVELOPMENT_SEED = Object.freeze({
  templates: DEFAULT_TASK_TYPES.map((template, index) => ({
    id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    ...template,
    defaultVerifyMode: index === 1 ? ('AUTO' as const) : ('MANUAL' as const),
  })),
  families: [
    {
      id: ids.families[0],
      name: '星光之家',
      creatorId: ids.parents[0],
      parents: [
        { id: ids.parents[0], nickname: '星爸', email: 'parent.one@familystar.test' },
        { id: ids.parents[1], nickname: '星妈', email: 'parent.two@familystar.test' },
      ],
      children: [
        {
          id: ids.children[0],
          nickname: '小宇',
          pin: '1234',
          gender: 'MALE' as const,
          grade: '三年级',
        },
        {
          id: ids.children[1],
          nickname: '小晴',
          pin: '5678',
          gender: 'FEMALE' as const,
          grade: '一年级',
        },
      ],
    },
    {
      id: ids.families[1],
      name: '向阳之家',
      creatorId: ids.parents[2],
      parents: [
        { id: ids.parents[2], nickname: '向阳爸爸', email: 'parent.three@familystar.test' },
        { id: ids.parents[3], nickname: '向阳妈妈', email: 'parent.four@familystar.test' },
      ],
      children: [
        {
          id: ids.children[2],
          nickname: '安安',
          pin: '2468',
          gender: 'FEMALE' as const,
          grade: '五年级',
        },
        {
          id: ids.children[3],
          nickname: '乐乐',
          pin: '1357',
          gender: 'MALE' as const,
          grade: '二年级',
        },
      ],
    },
  ],
  familySettings: DEFAULT_FAMILY_SETTINGS,
  levels: DEFAULT_LEVEL_CONFIGS,
});

export function assertDevelopmentSeedAllowed(nodeEnv: string | undefined): void {
  if (nodeEnv === 'production') {
    throw new Error('Development seed is disabled in production.');
  }
}

export function seedId(prefix: number, familyIndex: number, itemIndex: number): string {
  const suffix = familyIndex * 100 + itemIndex + 1;
  return `${prefix.toString(16).padStart(8, '0')}-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
}
