import { readdir, readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { verifyDataModelContract } from './data-model-contract.js';

const schemaUrl = new URL('../prisma/schema.prisma', import.meta.url);
const migrationsUrl = new URL('../prisma/migrations/', import.meta.url);

async function readMigrationHistory(): Promise<string> {
  const entries = await readdir(migrationsUrl, { withFileTypes: true });
  const migrationUrls = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => new URL(`${entry.name}/migration.sql`, migrationsUrl))
    .sort((left, right) => left.pathname.localeCompare(right.pathname));

  return (await Promise.all(migrationUrls.map((url) => readFile(url, 'utf8')))).join('\n');
}

describe('verifyDataModelContract', () => {
  it('accepts the core Prisma schema and PostgreSQL migration history', async () => {
    const [schema, migration] = await Promise.all([
      readFile(schemaUrl, 'utf8'),
      readMigrationHistory(),
    ]);

    expect(() => verifyDataModelContract(schema, migration)).not.toThrow();
  });

  it('rejects a tenant model without its family boundary', async () => {
    const [schema, migration] = await Promise.all([
      readFile(schemaUrl, 'utf8'),
      readMigrationHistory(),
    ]);
    const schemaWithoutTaskFamily = schema.replace(
      '  familyId          String            @map("family_id") @db.Uuid\n',
      '',
    );

    expect(() => verifyDataModelContract(schemaWithoutTaskFamily, migration)).toThrow();
  });

  it('rejects a migration missing a required database guard', async () => {
    const [schema, migration] = await Promise.all([
      readFile(schemaUrl, 'utf8'),
      readMigrationHistory(),
    ]);
    const migrationWithoutBalanceGuard = migration.replace(
      'users_points_balance_nonnegative_check',
      'removed_balance_guard',
    );

    expect(() => verifyDataModelContract(schema, migrationWithoutBalanceGuard)).toThrow(
      'Missing migration guard: users_points_balance_nonnegative_check',
    );
  });

  it('requires the family code field, unique index, and format guard', async () => {
    const [schema, migration] = await Promise.all([
      readFile(schemaUrl, 'utf8'),
      readMigrationHistory(),
    ]);

    expect(schema).toMatch(
      /familyCode\s+String\s+@unique\s+@map\("family_code"\)\s+@db\.VarChar\(6\)/,
    );
    expect(migration).toContain('families_family_code_key');
    expect(migration).toContain('families_family_code_format_check');
    expect(migration).toContain('ALTER COLUMN "family_code" TYPE VARCHAR(6)');
    expect(migration).toContain('DROP CONSTRAINT "families_family_code_format_check"');
    expect(migration).toContain('^[0-9]{6}$');
  });

  it('rejects an Outbox migration missing its claim index', async () => {
    const [schema, migration] = await Promise.all([
      readFile(schemaUrl, 'utf8'),
      readMigrationHistory(),
    ]);
    const migrationWithoutClaimIndex = migration.replace(
      'outbox_events_published_at_available_at_created_at_idx',
      'removed_outbox_claim_index',
    );

    expect(() => verifyDataModelContract(schema, migrationWithoutClaimIndex)).toThrow(
      'Missing migration guard: outbox_events_published_at_available_at_created_at_idx',
    );
  });

  it('rejects a credential migration missing encryption length guards', async () => {
    const [schema, migration] = await Promise.all([
      readFile(schemaUrl, 'utf8'),
      readMigrationHistory(),
    ]);
    const migrationWithoutEncryptionGuard = migration.replace(
      'family_integration_settings_encryption_lengths_check',
      'removed_credential_encryption_guard',
    );

    expect(() => verifyDataModelContract(schema, migrationWithoutEncryptionGuard)).toThrow(
      'Missing migration guard: family_integration_settings_encryption_lengths_check',
    );
  });

  it('rejects a reward migration missing the redemption refund guard', async () => {
    const [schema, migration] = await Promise.all([
      readFile(schemaUrl, 'utf8'),
      readMigrationHistory(),
    ]);
    const migrationWithoutRefundGuard = migration.replace(
      'points_logs_redemption_refund_once_idx',
      'removed_redemption_refund_guard',
    );

    expect(() => verifyDataModelContract(schema, migrationWithoutRefundGuard)).toThrow(
      'Missing migration guard: points_logs_redemption_refund_once_idx',
    );
  });

  it('requires growth record source idempotency and ordered media guards', async () => {
    const [schema, migration] = await Promise.all([
      readFile(schemaUrl, 'utf8'),
      readMigrationHistory(),
    ]);

    expect(schema).toContain('model GrowthRecord {');
    expect(schema).toContain('model GrowthRecordMedia {');
    expect(migration).toContain('growth_records_source_pair_check');
    expect(migration).toContain('growth_records_family_id_source_type_source_id_key');
    expect(migration).toContain('growth_record_media_growth_record_id_sort_order_key');
    expect(migration).toContain('growth_record_media_sort_order_check');
  });
});
