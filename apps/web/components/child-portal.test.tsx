import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { childSections } from '../lib/child-portal';
import { ChildPortal } from './child-portal';

describe('ChildPortal', () => {
  it.each(childSections)(
    'renders the %s route loading boundary with shared navigation',
    (section) => {
      const markup = renderToStaticMarkup(<ChildPortal section={section} />);

      expect(markup).toContain('正在读取成长数据');
      expect(markup).toContain('孩子端主导航');
      expect(markup).toContain('aria-label="退出孩子端"');
      expect(markup).toContain('aria-current="page"');
      expect(markup).toContain('child-bottom-nav');
      expect(markup).toContain('<main class="page-shell py-7 mobile:py-5">');
    },
  );

  it('does not render seeded identities, rewards, tasks, or wishes before API responses', () => {
    const markup = childSections
      .map((section) => renderToStaticMarkup(<ChildPortal section={section} />))
      .join('');

    expect(markup).not.toMatch(/潼潼|昊昊|妞妞|乐高千年隼/);
    expect(markup).not.toMatch(/晨读 20 分钟|动画时间 30 分钟|周末大扫除/);
  });
});
