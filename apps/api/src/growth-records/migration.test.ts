import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL(
    '../../prisma/migrations/20260806100000_add_growth_records/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

const requiredContracts = [
  /CREATE TYPE "growth_record_type" AS ENUM \(\s*'check_in',\s*'note',\s*'milestone'\s*\)/,
  /CONSTRAINT "growth_records_source_pair_check" CHECK \([\s\S]*?"source_type" IS NULL[\s\S]*?"source_id" IS NULL[\s\S]*?"source_id" IS NOT NULL[\s\S]*?\)/,
  /CONSTRAINT "growth_records_points_earned_check" CHECK \("points_earned" IS NULL OR "points_earned" >= 0\)/,
  /CREATE UNIQUE INDEX "growth_records_family_id_source_type_source_id_key" ON "growth_records"\("family_id", "source_type", "source_id"\)/,
  /CREATE UNIQUE INDEX "growth_record_media_growth_record_id_media_asset_id_key" ON "growth_record_media"\("growth_record_id", "media_asset_id"\)/,
  /FOREIGN KEY \("growth_record_id"\) REFERENCES "growth_records"\("id"\) ON DELETE CASCADE/,
] as const;

describe('growth record migration contract', () => {
  it('creates the snapshot, source-idempotency, media, and ownership constraints', () => {
    for (const contract of requiredContracts) expect(sql).toMatch(contract);
  });

  it('property: removing any required contract makes the migration contract incomplete', () => {
    const fragments = requiredContracts.map((contract) => sql.match(contract)?.[0]);
    expect(fragments.every(Boolean)).toBe(true);

    for (const fragment of fragments) {
      const mutated = sql.replace(fragment!, '');
      expect(requiredContracts.every((contract) => contract.test(mutated))).toBe(false);
    }
  });
});
