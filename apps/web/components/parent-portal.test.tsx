import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { parentSections } from '../lib/parent-portal';
import { ParentPortal } from './parent-portal';

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
    expect(markup).toContain('家长端模块导航');
    expect(markup).toContain('aria-current="page"');
  });

  it('renders responsive forms and explicit limited states', () => {
    expect(renderToStaticMarkup(<ParentPortal section="tasks" />)).toContain('创建任务');
    expect(renderToStaticMarkup(<ParentPortal section="settings" />)).toContain('即将推出');
    expect(renderToStaticMarkup(<ParentPortal section="records" />)).toContain('Phase 1 受限页面');
  });
});
