import assert from 'node:assert/strict';

const CORE_MODELS = [
  'Family',
  'User',
  'Invitation',
  'TaskTypeTemplate',
  'TaskType',
  'Task',
  'TaskAssignment',
  'CollaborationRound',
  'CollaborationRoundParticipant',
  'CollaborationSubmission',
  'CollaborationSubmissionAttempt',
  'CheckIn',
  'CheckInSubmissionAttempt',
  'SubmissionReview',
  'MediaAsset',
  'MediaUploadSession',
  'MediaUploadPart',
  'CheckInMedia',
  'CollaborationSubmissionMedia',
  'PointsLog',
  'LevelConfig',
  'LevelReward',
  'Reward',
  'Redemption',
  'Wish',
  'AuditLog',
  'OutboxEvent',
  'FamilyIntegrationSetting',
  'WorkerJobRun',
  'GrowthRecord',
  'GrowthRecordMedia',
] as const;

const TENANT_MODELS = CORE_MODELS.filter(
  (model) => model !== 'Family' && model !== 'TaskTypeTemplate' && model !== 'WorkerJobRun',
);

const SOFT_DELETE_MODELS = [
  'Family',
  'User',
  'TaskType',
  'Task',
  'TaskAssignment',
  'CheckIn',
  'MediaAsset',
  'Reward',
  'Wish',
  'GrowthRecord',
] as const;

const MIGRATION_GUARDS = [
  'users_points_balance_nonnegative_check',
  'points_logs_balance_conservation_check',
  'points_logs_delta_direction_check',
  'rewards_stock_capacity_check',
  'level_configs_level_range_check',
  'users_email_active_key',
  'check_ins_assignment_date_active_key',
  'outbox_events_attempts_nonnegative_check',
  'outbox_events_publish_time_check',
  'outbox_events_lease_pair_check',
  'outbox_events_event_name_format_check',
  'outbox_events_published_at_available_at_created_at_idx',
  'family_integration_settings_encryption_lengths_check',
  'family_integration_settings_key_version_check',
  'family_integration_settings_family_id_integration_type_key',
  'invitations_family_email_pending_key',
  'invitations_status_consistency_check',
  'users_role_credentials_consistency_check',
  'users_child_credential_bcrypt_check',
  'check_in_submission_attempts_number_check',
  'collaboration_submission_attempts_number_check',
  'media_upload_parts_number_check',
  'media_upload_sessions_state_check',
  'submission_reviews_target_check',
  'submission_reviews_rejection_reason_check',
  'submission_reviews_source_reviewer_check',
  'submission_reviews_family_id_idempotency_key_key',
  'submission_reviews_check_in_attempt_id_key',
  'submission_reviews_collaboration_attempt_id_key',
  'collaboration_round_participants_award_snapshot_check',
  'redemptions_status_consistency_check',
  'redemptions_points_spent_positive_check',
  'wishes_status_adoption_consistency_check',
  'redemptions_frequency_lookup_idx',
  'points_logs_redemption_refund_once_idx',
  'worker_job_runs_attempts_check',
  'worker_job_runs_state_check',
  'worker_job_runs_job_name_run_key_key',
  'families_family_code_key',
  'families_family_code_format_check',
  'growth_records_source_pair_check',
  'growth_records_points_earned_check',
  'growth_records_family_id_source_type_source_id_key',
  'growth_records_family_id_deleted_at_occurred_on_id_idx',
  'growth_record_media_sort_order_check',
] as const;

function modelBlock(schema: string, model: string): string {
  const match = schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `Missing Prisma model: ${model}`);
  return match[1] ?? '';
}

export function verifyDataModelContract(schema: string, migration: string): void {
  assert.match(schema, /provider\s+=\s+"postgresql"/, 'Prisma must use PostgreSQL');

  for (const model of CORE_MODELS) {
    modelBlock(schema, model);
  }

  for (const model of TENANT_MODELS) {
    assert.match(modelBlock(schema, model), /familyId\s+String\s+@map\("family_id"\)\s+@db\.Uuid/);
  }

  for (const model of SOFT_DELETE_MODELS) {
    assert.match(modelBlock(schema, model), /deletedAt\s+DateTime\?\s+@map\("deleted_at"\)/);
  }

  assert.match(
    modelBlock(schema, 'Family'),
    /familyCode\s+String\s+@unique\s+@map\("family_code"\)\s+@db\.VarChar\(6\)/,
  );

  assert.match(schema, /@@unique\(\[type, businessType, businessId, userId\]\)/);
  assert.match(schema, /@@unique\(\[familyId, idempotencyKey\]\)/);
  assert.match(schema, /@@unique\(\[taskId, roundNumber\]\)/);
  assert.match(schema, /@@unique\(\[roundId, childId\]\)/);
  assert.match(
    modelBlock(schema, 'CollaborationRoundParticipant'),
    /pointsEarned\s+Int\?\s+@map\("points_earned"\)/,
  );
  assert.match(
    modelBlock(schema, 'CollaborationRoundParticipant'),
    /streakMultiplier\s+Decimal\?\s+@map\("streak_multiplier"\)/,
  );
  assert.match(modelBlock(schema, 'CheckIn'), /@@unique\(\[familyId, idempotencyKey\]\)/);
  assert.match(
    modelBlock(schema, 'CollaborationSubmission'),
    /@@unique\(\[familyId, idempotencyKey\]\)/,
  );
  assert.match(
    modelBlock(schema, 'MediaUploadSession'),
    /@@unique\(\[familyId, idempotencyKey\]\)/,
  );
  assert.match(modelBlock(schema, 'MediaUploadPart'), /@@unique\(\[sessionId, partNumber\]\)/);
  assert.match(modelBlock(schema, 'SubmissionReview'), /@@unique\(\[familyId, idempotencyKey\]\)/);
  assert.match(modelBlock(schema, 'SubmissionReview'), /checkInAttemptId\s+String\?\s+@unique/);
  assert.match(modelBlock(schema, 'SubmissionReview'), /source\s+ReviewSource/);
  assert.match(modelBlock(schema, 'SubmissionReview'), /reviewerId\s+String\?/);
  assert.match(modelBlock(schema, 'Redemption'), /requestFingerprint\s+String/);
  assert.match(
    modelBlock(schema, 'Redemption'),
    /@@index\(\[familyId, rewardId, childId, status, createdAt\]\)/,
  );
  assert.match(modelBlock(schema, 'Wish'), /cancelledAt\s+DateTime\?/);
  assert.match(modelBlock(schema, 'Wish'), /adoptedAt\s+DateTime\?/);
  assert.match(
    modelBlock(schema, 'SubmissionReview'),
    /collaborationAttemptId\s+String\?\s+@unique/,
  );
  assert.match(
    modelBlock(schema, 'OutboxEvent'),
    /@@index\(\[publishedAt, availableAt, createdAt\]\)/,
  );
  assert.match(modelBlock(schema, 'OutboxEvent'), /payload\s+Json\s+@db\.JsonB/);
  assert.match(modelBlock(schema, 'WorkerJobRun'), /@@unique\(\[jobName, runKey\]\)/);
  assert.match(
    modelBlock(schema, 'FamilyIntegrationSetting'),
    /@@unique\(\[familyId, integrationType\]\)/,
  );
  assert.match(
    modelBlock(schema, 'GrowthRecord'),
    /@@unique\(\[familyId, sourceType, sourceId\]\)/,
  );
  assert.match(
    modelBlock(schema, 'GrowthRecord'),
    /@@index\(\[familyId, deletedAt, occurredOn, id\]\)/,
  );
  assert.match(
    modelBlock(schema, 'GrowthRecordMedia'),
    /@@unique\(\[growthRecordId, mediaAssetId\]\)/,
  );
  assert.match(
    modelBlock(schema, 'GrowthRecordMedia'),
    /@@unique\(\[growthRecordId, sortOrder\]\)/,
  );

  for (const guard of MIGRATION_GUARDS) {
    assert.ok(migration.includes(guard), `Missing migration guard: ${guard}`);
  }
}
