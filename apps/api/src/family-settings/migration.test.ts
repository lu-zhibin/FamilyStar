import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL(
    '../../prisma/migrations/20260808100000_add_family_module_settings/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('family module settings migration contract', () => {
  it('backfills every optional module without replacing existing family settings or module choices', () => {
    expect(sql).toMatch(/ADD COLUMN "settings_version" INTEGER NOT NULL DEFAULT 0/);
    expect(sql).toMatch(/COALESCE\("settings", '\{\}'::jsonb\)/);
    expect(sql).toMatch(/jsonb_typeof\("settings"->'modules'\) = 'object'/);
    for (const moduleId of [
      'analytics',
      'growth-records',
      'levels',
      'rewards',
      'badges',
      'notifications',
    ]) {
      expect(sql).toContain(`"${moduleId}":true`);
    }
    expect(sql).toMatch(/families_settings_version_nonnegative_check/);
    expect(sql).not.toMatch(/DELETE|DROP|TRUNCATE/i);
  });
});
