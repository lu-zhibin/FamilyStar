import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL(
    '../../prisma/migrations/20260807100000_add_notifications/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

const requiredContracts = [
  /CREATE TYPE "notification_type" AS ENUM \(\s*'review',\s*'points',\s*'level',\s*'redemption',\s*'wish',\s*'badge',\s*'invitation'\s*\)/,
  /CREATE UNIQUE INDEX "notifications_source_event_id_recipient_id_key" ON "notifications"\("source_event_id", "recipient_id"\)/,
  /CREATE INDEX "notifications_family_id_recipient_id_created_at_id_idx" ON "notifications"\("family_id", "recipient_id", "created_at", "id"\)/,
  /CREATE INDEX "notifications_family_id_recipient_id_read_at_idx" ON "notifications"\("family_id", "recipient_id", "read_at"\)/,
  /CREATE INDEX "notifications_family_id_created_at_id_idx" ON "notifications"\("family_id", "created_at", "id"\)/,
  /CONSTRAINT "notifications_source_event_name_format_check" CHECK/,
  /CONSTRAINT "notifications_read_time_check" CHECK \("read_at" IS NULL OR "read_at" >= "created_at"\)/,
  /CONSTRAINT "notification_preferences_type_settings_object_check" CHECK/,
  /CONSTRAINT "notification_preferences_quiet_hours_pair_check" CHECK/,
  /CONSTRAINT "notification_preferences_quiet_hours_enabled_check" CHECK/,
  /CREATE UNIQUE INDEX "notification_preferences_user_id_key" ON "notification_preferences"\("user_id"\)/,
  /FOREIGN KEY \("recipient_id"\) REFERENCES "users"\("id"\) ON DELETE RESTRICT/,
  /FOREIGN KEY \("user_id"\) REFERENCES "users"\("id"\) ON DELETE RESTRICT/,
] as const;

describe('notification migration contract', () => {
  it('creates recipient, source-idempotency, target, preference, and family-scope guards', () => {
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
