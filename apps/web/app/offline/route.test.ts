import { describe, expect, it } from 'vitest';

import { GET } from './route';

describe('offline page', () => {
  it('returns a responsive, self-contained HTML fallback', async () => {
    const response = GET();
    const html = await response.text();

    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(html).toContain('width=device-width, initial-scale=1');
    expect(html).toContain('暂时连接不到网络');
    expect(html).toContain('重新连接');
    expect(html).toContain('@media (max-width: 420px)');
    expect(html).not.toMatch(/<(?:link|script|img)\b/i);
    expect(html).not.toMatch(/url\(['"]?https?:/i);
  });
});
