import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { parentSections } from '../lib/parent-portal';
import { FamilyCodeCard, ParentPortal } from './parent-portal';

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

describe('ParentPortal', () => {
  it.each(parentSections)('renders the %s route with shared navigation', (section) => {
    const markup = renderToStaticMarkup(<ParentPortal section={section} />);

    expect(markup).toContain(titles[parentSections.indexOf(section)]);
    expect(markup).toContain('<main class="page-shell">');
    expect(markup).toContain('家长端模块导航');
    expect(markup).toContain('aria-label="退出家长端"');
    expect(markup).toContain('aria-current="page"');
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
});
