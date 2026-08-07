import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { BadgeTemplate } from '../lib/badges';
import { parentSections, type ParentReward } from '../lib/parent-portal';
import {
  ActiveWishWall,
  BadgeTemplateCatalog,
  BadgeTemplateFields,
  FamilyCodeCard,
  FamilyProfileFields,
  FrequencyFields,
  Modal,
  ParentPortal,
  RewardCatalog,
  RewardEditorFields,
  RedemptionWorkflowList,
  ReviewActions,
  ReviewMediaGallery,
  TaskAssigneeFields,
  WishAdoptionFields,
} from './parent-portal';

const titles = [
  '家庭总览',
  '任务管理',
  '打卡审核',
  '奖励管理',
  '等级与成就',
  '徽章管理',
  '数据面板',
  '成长记录',
  '家庭成员',
  '设置',
];

const familyProfile = {
  id: 'family-1',
  name: '星光家庭',
  time_zone: 'Asia/Shanghai',
  parents: [],
  invitations: [],
  permissions: { can_update_name: true, can_manage_invitations: true },
} as const;

const reward: ParentReward = {
  id: 'reward-1',
  family_id: 'family-1',
  name: '周末露营',
  description: '一起去郊外',
  image_media_id: 'media-1',
  points_cost: 180,
  type: 'EXPERIENCE',
  stock_total: 8,
  stock_reserved: 2,
  stock_consumed: 3,
  stock_available: 3,
  prerequisites: {
    min_level: 3,
    redeem_limit: { per_day: 1, per_week: 2, per_month: 4 },
  },
  status: 'ACTIVE',
  created_at: '2026-08-07T00:00:00.000Z',
  updated_at: '2026-08-07T00:00:00.000Z',
};

describe('ParentPortal', () => {
  it.each(parentSections)('renders the %s route with shared navigation', (section) => {
    const markup = renderToStaticMarkup(<ParentPortal section={section} />);

    expect(markup).toContain(titles[parentSections.indexOf(section)]);
    expect(markup).toContain('<main class="page-shell py-7 mobile:py-5">');
    expect(markup).toContain('min-h-screen pb-28 pt-7 mobile:pb-24 mobile:pt-5');
    expect(markup).toContain('家长端模块导航');
    expect(markup).toContain('aria-label="退出家长端"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('mobile:grid-cols-10');
    expect(markup).toContain('mobile:overflow-x-visible');
    expect(markup.match(/class="nav-item/g)).toHaveLength(10);
  });

  it('renders responsive forms and explicit limited states', () => {
    const tasks = renderToStaticMarkup(<ParentPortal section="tasks" />);
    expect(tasks).toContain('创建任务');
    expect(tasks).toContain('当前筛选下没有任务');
    expect(renderToStaticMarkup(<ParentPortal section="settings" />)).toContain('正在读取家庭规则');
    expect(renderToStaticMarkup(<ParentPortal section="records" />)).toContain(
      '正在整理家庭成长时间线',
    );
    expect(renderToStaticMarkup(<ParentPortal section="reviews" />)).toContain(
      '正在读取待审核提交',
    );
    expect(renderToStaticMarkup(<ParentPortal section="badges" />)).toContain('正在读取徽章模板');
  });

  it('renders preset and custom badge actions with protected deletion', () => {
    const template: BadgeTemplate = {
      id: 'badge-1',
      preset_code: 'first-task',
      name: '任务新星',
      description: '完成第一个任务',
      icon: 'star',
      category: '任务',
      condition: { type: 'TASK_COMPLETION_COUNT', target: 1 },
      award_level: 1,
      is_visible: true,
      is_enabled: true,
      version: 1,
      created_at: '2026-08-07T00:00:00.000Z',
      updated_at: '2026-08-07T00:00:00.000Z',
    };
    const markup = renderToStaticMarkup(
      <BadgeTemplateCatalog
        templates={[template, { ...template, id: 'badge-2', preset_code: null, name: '阅读之星' }]}
        busyAction={null}
        onEdit={() => undefined}
        onToggle={() => undefined}
        onDelete={() => undefined}
      />,
    );

    expect(markup).toContain('系统预设');
    expect(markup).toContain('家庭自定义');
    expect(markup).toContain('累计完成任务 1');
    expect(markup).toContain('已启用');
    expect(markup.match(/删除自定义模板/g)).toHaveLength(1);
    expect(markup).toContain('aria-label="删除徽章模板 阅读之星"');
  });

  it('shows an automatic target field and locks every badge form control while busy', () => {
    const template: BadgeTemplate = {
      id: 'badge-1',
      preset_code: null,
      name: '坚持之星',
      description: null,
      icon: 'star',
      category: '习惯',
      condition: { type: 'STREAK_DAYS', target: 7 },
      award_level: 1,
      is_visible: true,
      is_enabled: false,
      version: 1,
      created_at: '2026-08-07T00:00:00.000Z',
      updated_at: '2026-08-07T00:00:00.000Z',
    };
    const markup = renderToStaticMarkup(
      <BadgeTemplateFields template={template} busy onSubmit={() => undefined} />,
    );

    expect(markup).toMatch(/name="condition_target"[^>]*value="7"/);
    expect(markup).toMatch(/name="condition_target"[^>]*max="2147483647"/);
    expect(markup).toMatch(/name="award_level"[^>]*max="2147483647"/);
    expect(markup).toMatch(/name="condition_type"[^>]*disabled=""/);
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('正在保存...');
    expect(markup.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(9);
  });

  it('keeps long modal content scrollable within the viewport', () => {
    const markup = renderToStaticMarkup(
      <Modal title="长表单" onClose={() => undefined}>
        <form>表单内容</form>
      </Modal>,
    );

    expect(markup).toContain('max-h-[calc(100dvh-2rem)]');
    expect(markup).toContain('overflow-y-auto');
    expect(markup).toContain('overscroll-contain');
    expect(markup).toContain('tabindex="-1"');
  });

  it('locks every modal closing path while a write is in progress', () => {
    const markup = renderToStaticMarkup(
      <Modal title="正在保存" onClose={() => undefined} closeDisabled>
        表单内容
      </Modal>,
    );

    expect(markup).toMatch(/aria-label="关闭弹窗"[^>]*disabled=""/);
  });

  it('defaults task date ranges to the family natural date', () => {
    const markup = renderToStaticMarkup(
      <FrequencyFields kind="date_range" onKindChange={() => undefined} naturalDate="2026-08-02" />,
    );

    expect(markup).toMatch(/name="frequency_start_date"[^>]*value="2026-08-02"/);
    expect(markup).toMatch(/name="frequency_end_date"[^>]*value="2026-08-02"/);
  });

  it('renders complete reward management details and actions', () => {
    const markup = renderToStaticMarkup(
      <RewardCatalog
        rewards={[reward, { ...reward, id: 'reward-2', status: 'INACTIVE', stock_total: null }]}
        imageUrls={{ 'media-1': 'https://example.com/reward.jpg' }}
        busyAction={null}
        onEdit={() => undefined}
        onToggleStatus={() => undefined}
        onDelete={() => undefined}
      />,
    );

    expect(markup).toContain('周末露营');
    expect(markup).toContain('180 星');
    expect(markup).toContain('Lv.3 解锁');
    expect(markup).toContain('每日 1 次 · 每周 2 次 · 每月 4 次');
    expect(markup).toContain('总量 8 · 预占 2 · 已兑 3 · 可用 3');
    expect(markup).toContain('无限库存');
    expect(markup).toContain('已上架');
    expect(markup).toContain('已下架');
    expect(markup).toContain('aria-label="编辑奖励 周末露营"');
    expect(markup).toContain('aria-label="删除奖励 周末露营"');
    expect(markup).toContain('alt="周末露营 奖励图片"');
  });

  it('prefills reward editing fields and locks controls during submission', () => {
    const markup = renderToStaticMarkup(
      <RewardEditorFields
        reward={reward}
        imageUrl="https://example.com/reward.jpg"
        imageRemoved={false}
        busy
        onRemoveImage={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toMatch(/name="name"[^>]*value="周末露营"/);
    expect(markup).toMatch(/name="points_cost"[^>]*value="180"/);
    expect(markup).toMatch(/name="stock_total"[^>]*value="8"/);
    expect(markup).toMatch(/name="min_level"[^>]*value="3"/);
    expect(markup).toMatch(/name="per_week"[^>]*value="2"/);
    expect(markup).toContain('移除图片');
    expect(markup).toContain('正在保存...');
    expect(markup.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(10);
  });

  it('renders localized redemption actions only for mutable states', () => {
    const redemptions = [
      {
        id: 'pending',
        child_id: 'child-1',
        reward_id: 'reward-1',
        points_spent: 20,
        status: 'PENDING' as const,
      },
      {
        id: 'approved',
        child_id: 'child-1',
        reward_id: 'reward-1',
        points_spent: 20,
        status: 'APPROVED' as const,
      },
      {
        id: 'rejected',
        child_id: 'child-1',
        reward_id: 'reward-1',
        points_spent: 20,
        status: 'REJECTED' as const,
      },
      {
        id: 'fulfilled',
        child_id: 'child-1',
        reward_id: 'reward-1',
        points_spent: 20,
        status: 'FULFILLED' as const,
      },
    ];
    const markup = renderToStaticMarkup(
      <RedemptionWorkflowList
        redemptions={redemptions}
        busyAction={null}
        onApprove={() => undefined}
        onReject={() => undefined}
        onFulfill={() => undefined}
      />,
    );

    expect(markup).toContain('待审批');
    expect(markup).toContain('待兑现');
    expect(markup).toContain('已拒绝，退款完成');
    expect(markup).toContain('已兑现');
    expect(markup.match(/>批准</g)).toHaveLength(1);
    expect(markup.match(/>拒绝并退款</g)).toHaveLength(1);
    expect(markup.match(/>确认兑现</g)).toHaveLength(1);
  });

  it('shows every active wish and locks adoption while another write runs', () => {
    const wish = {
      id: 'wish-1',
      child_id: 'child-1',
      title: '去露营',
      target_points: 180,
      status: 'ACTIVE' as const,
      progress: { points: 90, ratio: 0.5 },
    };
    const markup = renderToStaticMarkup(
      <ActiveWishWall
        wishes={[
          wish,
          { ...wish, id: 'wish-2', title: '看电影' },
          { ...wish, id: 'old', title: '旧愿望', status: 'ADOPTED' },
        ]}
        busyAction="wish:wish-1:adopt"
        onAdopt={() => undefined}
      />,
    );

    expect(markup).toContain('去露营');
    expect(markup).toContain('看电影');
    expect(markup).not.toContain('旧愿望');
    expect(markup.match(/disabled=""/g)).toHaveLength(2);
  });

  it('renders every strict wish adoption configuration field', () => {
    const markup = renderToStaticMarkup(
      <WishAdoptionFields
        wish={{
          id: 'wish-1',
          child_id: 'child-1',
          title: '去露营',
          target_points: 180,
          status: 'ACTIVE',
          progress: { points: 90, ratio: 0.5 },
        }}
        busy
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toMatch(/name="type"/);
    expect(markup).toMatch(/name="stock_total"/);
    expect(markup).toMatch(/name="min_level"/);
    expect(markup).toMatch(/name="per_day"/);
    expect(markup).toMatch(/name="per_week"/);
    expect(markup).toMatch(/name="per_month"/);
    expect(markup).toMatch(/name="status"/);
    expect(markup).toContain('aria-busy="true"');
  });

  it('renders multi-child choices and per-child settings for every task mode', () => {
    const children = [
      { id: 'child-1', nickname: '小星', grade: null, gender: 'female' as const },
      { id: 'child-2', nickname: '小月', grade: null, gender: 'male' as const },
    ];
    const solo = renderToStaticMarkup(<TaskAssigneeFields mode="SOLO" assignees={children} />);
    const collaboration = renderToStaticMarkup(
      <TaskAssigneeFields mode="COLLAB" assignees={children} />,
    );

    expect(solo.match(/type="checkbox"/g)).toHaveLength(2);
    expect(solo).toContain('小星');
    expect(solo).toContain('可选择多名孩子，每名孩子独立完成任务');
    expect(solo).toContain('小星的独立配置');
    expect(collaboration).toContain('至少选择两名孩子共同完成任务');
    expect(collaboration.match(/type="checkbox"/g)).toHaveLength(2);
    expect(collaboration.match(/name="child_id"/g)).toHaveLength(2);
  });

  it('does not render seeded family identities or business data before API responses', () => {
    const markup = parentSections
      .map((section) => renderToStaticMarkup(<ParentPortal section={section} />))
      .join('');

    expect(markup).not.toMatch(/潼潼|昊昊|妞妞|斌哥|小星星家庭/);
    expect(markup).not.toMatch(/晨读 30 分钟|周末动画时间|一起整理房间/);
  });

  it('renders family-code loading and failure states without a placeholder code', () => {
    const loading = renderToStaticMarkup(
      <FamilyCodeCard code="" copyState="idle" state="loading" onCopy={() => undefined} />,
    );
    const failure = renderToStaticMarkup(
      <FamilyCodeCard code="" copyState="idle" state="error" onCopy={() => undefined} />,
    );

    expect(loading).toContain('正在读取家庭码');
    expect(loading).toContain('role="status"');
    expect(failure).toContain('家庭码暂时无法读取');
    expect(failure).toContain('role="alert"');
    expect(`${loading}${failure}`).not.toContain('123456');
  });

  it('renders the real family code, usage guidance, and accessible copy feedback', () => {
    const ready = renderToStaticMarkup(
      <FamilyCodeCard code="123456" copyState="idle" state="ready" onCopy={() => undefined} />,
    );
    const copied = renderToStaticMarkup(
      <FamilyCodeCard code="123456" copyState="copied" state="ready" onCopy={() => undefined} />,
    );
    const copyFailure = renderToStaticMarkup(
      <FamilyCodeCard code="123456" copyState="error" state="ready" onCopy={() => undefined} />,
    );

    expect(ready).toContain('aria-label="当前家庭码"');
    expect(ready).toContain('123456');
    expect(ready).toContain('6 位数字家庭码');
    expect(ready).toContain('选择自己的头像并输入 PIN');
    expect(ready).toContain('>复制<');
    expect(copied).toContain('家庭码已复制');
    expect(copied).toContain('role="status"');
    expect(copyFailure).toContain('复制失败，请手动选择家庭码');
    expect(copyFailure).toContain('role="alert"');
  });

  it('renders creator-managed family profile fields', () => {
    const markup = renderToStaticMarkup(
      <FamilyProfileFields profile={familyProfile} busy={false} onSubmit={() => undefined} />,
    );

    expect(markup).toMatch(/name="name"[^>]*value="星光家庭"/);
    expect(markup).toMatch(/name="time_zone"[^>]*value="Asia\/Shanghai"/);
    expect(markup).not.toContain('readonly=""');
    expect(markup).toContain('保存家庭资料');
  });

  it('renders explicit co-parent restrictions while keeping timezone editable', () => {
    const markup = renderToStaticMarkup(
      <FamilyProfileFields
        profile={{
          ...familyProfile,
          permissions: { can_update_name: false, can_manage_invitations: false },
        }}
        busy={false}
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toMatch(/name="name"[^>]*readonly=""[^>]*value="星光家庭"/);
    expect(markup).toContain('家庭名称由家庭创建者管理');
    expect(markup).toMatch(/name="time_zone"[^>]*value="Asia\/Shanghai"/);
  });

  it('renders the evidence preview entry for a media collection', () => {
    const markup = renderToStaticMarkup(
      <ReviewMediaGallery
        media={[
          { id: 'image-1', type: 'IMAGE', mime_type: 'image/png' },
          { id: 'video-1', type: 'VIDEO', mime_type: 'video/mp4' },
        ]}
      />,
    );

    expect(markup).toContain('查看凭证 (2)');
    expect(markup).toContain('type="button"');
  });

  it('renders review actions in decision-first order', () => {
    const markup = renderToStaticMarkup(
      <ReviewActions
        busy={false}
        reason=""
        onApprove={() => undefined}
        onReject={() => undefined}
        onReasonChange={() => undefined}
      />,
    );

    expect(markup.indexOf('通过并发分')).toBeLessThan(markup.indexOf('不通过打回'));
    expect(markup.indexOf('不通过打回')).toBeLessThan(markup.indexOf('打回原因'));
    expect(markup).toContain('md:grid-cols-[auto_auto_1fr]');
  });

  it('keeps the review reason visible after an authoritative conflict result', () => {
    const markup = renderToStaticMarkup(
      <ReviewActions
        busy={false}
        locked
        reason="保留当前输入"
        onApprove={() => undefined}
        onReject={() => undefined}
        onReasonChange={() => undefined}
      />,
    );

    expect(markup).toContain('value="保留当前输入"');
    expect(markup).toContain('disabled=""');
    expect(markup).not.toContain('通过并发分');
    expect(markup).not.toContain('不通过打回');
  });
});
