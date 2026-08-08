import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import manifest from './manifest';

function validatesCriteria(criteria: readonly string[]): string {
  return `[validatesCriteria: ${criteria.join(', ')}]`;
}

describe('PWA manifest', () => {
  it(`property: defines complete fields and a stable install identity ${validatesCriteria(['Requirement 11.1'])}`, () => {
    const expected = manifest();
    for (let run = 0; run < 64; run += 1) {
      expect(manifest()).toEqual(expected);
      expect(manifest()).toMatchObject({
        id: '/',
        name: 'FamilyStar 家庭成长助手',
        short_name: 'FamilyStar',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#fff8e7',
        theme_color: '#689f38',
        lang: 'zh-CN',
      });
    }
  });

  it(`references valid local SVG icons with matching dimensions ${validatesCriteria(['Requirement 11.1'])}`, async () => {
    const icons = manifest().icons ?? [];
    expect(icons).toHaveLength(2);

    for (const icon of icons) {
      expect(icon.src).toMatch(/^\/icons\/familystar-(192|512)\.svg$/);
      expect(icon.type).toBe('image/svg+xml');
      const size = icon.sizes?.split('x')[0];
      const iconPath = fileURLToPath(new URL(`../public${icon.src}`, import.meta.url));
      const source = await readFile(iconPath, 'utf8');
      expect(source).toContain(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}"`);
      expect(source).toContain(`viewBox="0 0 ${size} ${size}"`);
    }
  });
});
