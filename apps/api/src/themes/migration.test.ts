import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL(
    '../../prisma/migrations/20260808110000_add_user_selected_theme/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('user theme migration contract', () => {
  it('backfills existing users with a non-null stable default theme', () => {
    expect(sql).toMatch(/ADD COLUMN "selected_theme" VARCHAR\(40\) NOT NULL DEFAULT 'starlight'/);
  });

  it('limits persisted keys to the controlled catalog key format', () => {
    expect(sql).toMatch(/CONSTRAINT "users_selected_theme_format_check"/);
    expect(sql).toMatch(/CHECK \("selected_theme" ~ '\^\[a-z\]\[a-z0-9-\]\{0,39\}\$'\)/);
  });
});
