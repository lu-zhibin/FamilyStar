import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { parentSections } from '../lib/parent-portal';
import {
  FamilyCodeCard,
  FamilyProfileFields,
  ParentPortal,
  ReviewActions,
  ReviewMediaGallery,
  TaskAssigneeFields,
} from './parent-portal';

const titles = [
  '家庭总览',
  '任务管理',
  '打卡审核',
  '奖励管理',
  '等级与成就',
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

describe('ParentPortal', () => {
  it.each(parentSections)('renders the %s route with shared navigation', (section) => {
    const markup = renderToStaticMarkup(<ParentPortal section={section} />);

    expect(markup).toContain(titles[parentSections.indexOf(section)]);
    expect(markup).toContain('<main class="page-shell py-7 mobile:py-5">');
    expect(markup).toContain('min-h-screen pb-28 pt-7 mobile:pb-24 mobile:pt-5');
    expect(markup).toContain('家长端模块导航');
    expect(markup).toContain('aria-label="退出家长端"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('mobile:grid-cols-9');
    expect(markup).toContain('mobile:overflow-x-visible');
    expect(markup.match(/class="nav-item/g)).toHaveLength(9);
  });

  it('renders responsive forms and explicit limited states', () => {
    const tasks = renderToStaticMarkup(<ParentPortal section="tasks" />);
    expect(tasks).toContain('创建任务');
    expect(tasks).toContain('当前筛选下没有任务');
    expect(renderToStaticMarkup(<ParentPortal section="settings" />)).toContain('正在读取家庭规则');
    expect(renderToStaticMarkup(<ParentPortal section="records" />)).toContain('Phase 1 受限页面');
    expect(renderToStaticMarkup(<ParentPortal section="reviews" />)).toContain(
      '正在读取待审核提交',
    );
  });

  it('renders one assignee for solo tasks and multi-child choices for collaboration tasks', () => {
    const children = [
      { id: 'child-1', nickname: '小星', grade: null, gender: 'female' as const },
      { id: 'child-2', nickname: '小月', grade: null, gender: 'male' as const },
    ];
    const solo = renderToStaticMarkup(<TaskAssigneeFields mode="SOLO" assignees={children} />);
    const collaboration = renderToStaticMarkup(
      <TaskAssigneeFields mode="COLLAB" assignees={children} />,
    );

    expect(solo).toContain('<select class="field" name="child_id" required="">');
    expect(solo).toContain('小星');
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
});
