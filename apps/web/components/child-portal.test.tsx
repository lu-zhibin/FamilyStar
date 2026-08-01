import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { childSections } from '../lib/child-portal';
import { ChildPortal } from './child-portal';

const pageMarkers = ['今日任务', '今日打卡', '20 级成长阶梯', '奖励商店', '我的记录', '我的空间'];

describe('ChildPortal', () => {
  it.each(childSections)('renders the %s route with shared child navigation', (section) => {
    const markup = renderToStaticMarkup(<ChildPortal section={section} />);

    expect(markup).toContain(pageMarkers[childSections.indexOf(section)]);
    expect(markup).toContain('孩子端主导航');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('child-bottom-nav');
  });

  it('renders task, redemption, limited-data, and mobile-friendly interaction states', () => {
    const checkIns = renderToStaticMarkup(<ChildPortal section="check-ins" />);
    const rewards = renderToStaticMarkup(<ChildPortal section="rewards" />);
    const records = renderToStaticMarkup(<ChildPortal section="records" />);

    expect(checkIns).toContain('个人任务');
    expect(checkIns).toContain('协作任务');
    expect(checkIns).toContain('演示数据');
    expect(rewards).toContain('等级折扣已自动计算');
    expect(rewards).toContain('立即兑换');
    expect(records).toContain('接口待接入');
  });
});
