-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('parent', 'child');

-- CreateEnum
CREATE TYPE "gender" AS ENUM ('male', 'female');

-- CreateEnum
CREATE TYPE "credential_type" AS ENUM ('pin', 'password');

-- CreateEnum
CREATE TYPE "invitation_status" AS ENUM ('pending', 'accepted', 'expired');

-- CreateEnum
CREATE TYPE "verify_mode" AS ENUM ('auto', 'manual');

-- CreateEnum
CREATE TYPE "task_check_type" AS ENUM ('tick', 'text', 'photo', 'video', 'mixed');

-- CreateEnum
CREATE TYPE "collaboration_mode" AS ENUM ('solo', 'collab');

-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('active', 'inactive', 'archived');

-- CreateEnum
CREATE TYPE "collaboration_round_status" AS ENUM ('pending', 'active', 'completed');

-- CreateEnum
CREATE TYPE "collaboration_participant_status" AS ENUM ('active', 'removed');

-- CreateEnum
CREATE TYPE "submission_status" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "media_type" AS ENUM ('image', 'video', 'audio');

-- CreateEnum
CREATE TYPE "media_upload_status" AS ENUM ('pending', 'uploading', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "points_log_type" AS ENUM ('earn', 'redeem', 'refund', 'manual');

-- CreateEnum
CREATE TYPE "level_reward_type" AS ENUM ('appearance', 'privilege', 'honor', 'functional', 'physical');

-- CreateEnum
CREATE TYPE "reward_type" AS ENUM ('physical', 'privilege', 'experience', 'custom');

-- CreateEnum
CREATE TYPE "reward_status" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "redemption_status" AS ENUM ('pending', 'approved', 'fulfilled', 'rejected');

-- CreateEnum
CREATE TYPE "wish_status" AS ENUM ('active', 'adopted', 'cancelled');

-- CreateEnum
CREATE TYPE "audit_outcome" AS ENUM ('success', 'failure');

-- CreateTable
CREATE TABLE "families" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(120) NOT NULL,
    "avatar_url" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "role" "user_role" NOT NULL,
    "nickname" VARCHAR(80) NOT NULL,
    "email" VARCHAR(320),
    "password_hash" TEXT,
    "child_credential_hash" TEXT,
    "credential_type" "credential_type",
    "gender" "gender",
    "birthday" DATE,
    "grade" VARCHAR(40),
    "avatar_media_id" UUID,
    "points_balance" INTEGER NOT NULL DEFAULT 0,
    "points_earned_total" INTEGER NOT NULL DEFAULT 0,
    "current_level" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 0,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "invited_by" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "status" "invitation_status" NOT NULL DEFAULT 'pending',
    "invited_user_id" UUID,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_type_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "icon" VARCHAR(80) NOT NULL,
    "default_verify_mode" "verify_mode" NOT NULL DEFAULT 'manual',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "task_type_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "template_code" VARCHAR(40),
    "name" VARCHAR(80) NOT NULL,
    "icon" VARCHAR(80) NOT NULL,
    "default_verify_mode" "verify_mode" NOT NULL DEFAULT 'manual',
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "task_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "task_type_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "submission_guide" TEXT,
    "check_type" "task_check_type" NOT NULL,
    "verify_mode" "verify_mode" NOT NULL,
    "collaboration_mode" "collaboration_mode" NOT NULL DEFAULT 'solo',
    "frequency" JSONB NOT NULL,
    "base_points" INTEGER NOT NULL,
    "streak_bonus" JSONB,
    "auto_log_to_growth" BOOLEAN NOT NULL DEFAULT false,
    "allow_skip_card" BOOLEAN NOT NULL DEFAULT true,
    "status" "task_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "custom_points" INTEGER,
    "custom_frequency" JSONB,
    "custom_check_type" "task_check_type",
    "custom_verify_mode" "verify_mode",
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "task_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration_rounds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "round_number" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "collaboration_round_status" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "collaboration_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration_round_participants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "reward_points_snapshot" INTEGER NOT NULL,
    "status" "collaboration_participant_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collaboration_round_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "content_text" TEXT,
    "status" "submission_status" NOT NULL DEFAULT 'pending',
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "review_comment" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "collaboration_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_ins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "task_assignment_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "content_text" TEXT,
    "is_makeup" BOOLEAN NOT NULL DEFAULT false,
    "status" "submission_status" NOT NULL DEFAULT 'pending',
    "reviewer_id" UUID,
    "review_comment" TEXT,
    "reviewed_at" TIMESTAMPTZ(3),
    "points_earned" INTEGER,
    "streak_multiplier" DECIMAL(8,4),
    "check_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "type" "media_type" NOT NULL,
    "object_key" VARCHAR(1024) NOT NULL,
    "mime_type" VARCHAR(255) NOT NULL,
    "checksum" VARCHAR(128) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration" INTEGER,
    "upload_status" "media_upload_status" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_in_media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "check_in_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_in_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration_submission_media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collaboration_submission_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "points_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "points_log_type" NOT NULL,
    "business_type" VARCHAR(40) NOT NULL,
    "business_id" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "balance_before" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "earned_total_after" INTEGER NOT NULL,
    "remark" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "points_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "level_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "level" INTEGER NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "icon" VARCHAR(80) NOT NULL,
    "points_required" INTEGER NOT NULL,
    "discount" DECIMAL(5,4) NOT NULL DEFAULT 1,
    "auto_approve_quota" INTEGER NOT NULL DEFAULT 0,
    "wish_slots" INTEGER NOT NULL DEFAULT 1,
    "double_points_days" INTEGER NOT NULL DEFAULT 0,
    "skip_cards_per_month" INTEGER NOT NULL DEFAULT 0,
    "skip_card_validity_days" INTEGER NOT NULL DEFAULT 60,
    "extra_dimensions" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "level_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "level_rewards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "level_config_id" UUID NOT NULL,
    "reward_type" "level_reward_type" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "icon_media_id" UUID,
    "auto_grant" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "level_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "image_media_id" UUID,
    "points_cost" INTEGER NOT NULL,
    "type" "reward_type" NOT NULL,
    "stock_total" INTEGER,
    "stock_reserved" INTEGER NOT NULL DEFAULT 0,
    "stock_consumed" INTEGER NOT NULL DEFAULT 0,
    "prerequisites" JSONB,
    "status" "reward_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redemptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "reward_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "listed_points_cost" INTEGER NOT NULL,
    "discount" DECIMAL(5,4) NOT NULL DEFAULT 1,
    "points_spent" INTEGER NOT NULL,
    "status" "redemption_status" NOT NULL DEFAULT 'pending',
    "is_auto_approved" BOOLEAN NOT NULL DEFAULT false,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "rejected_by" UUID,
    "rejected_at" TIMESTAMPTZ(3),
    "rejection_reason" TEXT,
    "fulfilled_by" UUID,
    "fulfilled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "target_points" INTEGER NOT NULL,
    "status" "wish_status" NOT NULL DEFAULT 'active',
    "adopted_reward_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "wishes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "entity_type" VARCHAR(80) NOT NULL,
    "entity_id" UUID,
    "business_key" VARCHAR(160),
    "request_id" VARCHAR(128) NOT NULL,
    "outcome" "audit_outcome" NOT NULL,
    "metadata" JSONB,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "families_deleted_at_idx" ON "families"("deleted_at");

-- CreateIndex
CREATE INDEX "users_family_id_role_deleted_at_idx" ON "users"("family_id", "role", "deleted_at");

-- CreateIndex
CREATE INDEX "users_family_id_current_level_idx" ON "users"("family_id", "current_level");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_family_id_status_expires_at_idx" ON "invitations"("family_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "invitations_email_status_idx" ON "invitations"("email", "status");

-- CreateIndex
CREATE UNIQUE INDEX "task_type_templates_code_key" ON "task_type_templates"("code");

-- CreateIndex
CREATE INDEX "task_types_family_id_deleted_at_sort_order_idx" ON "task_types"("family_id", "deleted_at", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "task_types_family_id_template_code_key" ON "task_types"("family_id", "template_code");

-- CreateIndex
CREATE INDEX "tasks_family_id_status_deleted_at_idx" ON "tasks"("family_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "tasks_family_id_task_type_id_idx" ON "tasks"("family_id", "task_type_id");

-- CreateIndex
CREATE INDEX "task_assignments_family_id_child_id_deleted_at_idx" ON "task_assignments"("family_id", "child_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "task_assignments_task_id_child_id_key" ON "task_assignments"("task_id", "child_id");

-- CreateIndex
CREATE INDEX "collaboration_rounds_family_id_status_start_date_end_date_idx" ON "collaboration_rounds"("family_id", "status", "start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "collaboration_rounds_task_id_round_number_key" ON "collaboration_rounds"("task_id", "round_number");

-- CreateIndex
CREATE INDEX "collaboration_round_participants_family_id_child_id_idx" ON "collaboration_round_participants"("family_id", "child_id");

-- CreateIndex
CREATE UNIQUE INDEX "collaboration_round_participants_round_id_child_id_key" ON "collaboration_round_participants"("round_id", "child_id");

-- CreateIndex
CREATE INDEX "collaboration_submissions_family_id_status_submitted_at_idx" ON "collaboration_submissions"("family_id", "status", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "collaboration_submissions_round_id_child_id_key" ON "collaboration_submissions"("round_id", "child_id");

-- CreateIndex
CREATE INDEX "check_ins_family_id_child_id_check_date_idx" ON "check_ins"("family_id", "child_id", "check_date");

-- CreateIndex
CREATE INDEX "check_ins_family_id_status_created_at_idx" ON "check_ins"("family_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "media_assets_family_id_upload_status_deleted_at_idx" ON "media_assets"("family_id", "upload_status", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_family_id_object_key_key" ON "media_assets"("family_id", "object_key");

-- CreateIndex
CREATE INDEX "check_in_media_family_id_media_asset_id_idx" ON "check_in_media"("family_id", "media_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "check_in_media_check_in_id_media_asset_id_key" ON "check_in_media"("check_in_id", "media_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "check_in_media_check_in_id_sort_order_key" ON "check_in_media"("check_in_id", "sort_order");

-- CreateIndex
CREATE INDEX "collaboration_submission_media_family_id_media_asset_id_idx" ON "collaboration_submission_media"("family_id", "media_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "collaboration_submission_media_submission_id_media_asset_id_key" ON "collaboration_submission_media"("submission_id", "media_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "collaboration_submission_media_submission_id_sort_order_key" ON "collaboration_submission_media"("submission_id", "sort_order");

-- CreateIndex
CREATE INDEX "points_logs_family_id_user_id_created_at_idx" ON "points_logs"("family_id", "user_id", "created_at");

-- CreateIndex
CREATE INDEX "points_logs_family_id_business_type_business_id_idx" ON "points_logs"("family_id", "business_type", "business_id");

-- CreateIndex
CREATE UNIQUE INDEX "points_logs_type_business_type_business_id_user_id_key" ON "points_logs"("type", "business_type", "business_id", "user_id");

-- CreateIndex
CREATE INDEX "level_configs_family_id_points_required_idx" ON "level_configs"("family_id", "points_required");

-- CreateIndex
CREATE UNIQUE INDEX "level_configs_family_id_level_key" ON "level_configs"("family_id", "level");

-- CreateIndex
CREATE INDEX "level_rewards_family_id_level_config_id_is_active_idx" ON "level_rewards"("family_id", "level_config_id", "is_active");

-- CreateIndex
CREATE INDEX "rewards_family_id_status_deleted_at_idx" ON "rewards"("family_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "redemptions_family_id_child_id_status_created_at_idx" ON "redemptions"("family_id", "child_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "redemptions_family_id_reward_id_idx" ON "redemptions"("family_id", "reward_id");

-- CreateIndex
CREATE UNIQUE INDEX "redemptions_family_id_idempotency_key_key" ON "redemptions"("family_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "wishes_family_id_child_id_status_deleted_at_idx" ON "wishes"("family_id", "child_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "audit_logs_family_id_occurred_at_idx" ON "audit_logs"("family_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_family_id_entity_type_entity_id_idx" ON "audit_logs"("family_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_request_id_idx" ON "audit_logs"("request_id");

-- AddForeignKey
ALTER TABLE "families" ADD CONSTRAINT "families_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_media_id_fkey" FOREIGN KEY ("avatar_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_user_id_fkey" FOREIGN KEY ("invited_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_types" ADD CONSTRAINT "task_types_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_types" ADD CONSTRAINT "task_types_template_code_fkey" FOREIGN KEY ("template_code") REFERENCES "task_type_templates"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_task_type_id_fkey" FOREIGN KEY ("task_type_id") REFERENCES "task_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_rounds" ADD CONSTRAINT "collaboration_rounds_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_rounds" ADD CONSTRAINT "collaboration_rounds_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_round_participants" ADD CONSTRAINT "collaboration_round_participants_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_round_participants" ADD CONSTRAINT "collaboration_round_participants_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "collaboration_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_round_participants" ADD CONSTRAINT "collaboration_round_participants_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_submissions" ADD CONSTRAINT "collaboration_submissions_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_submissions" ADD CONSTRAINT "collaboration_submissions_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "collaboration_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_submissions" ADD CONSTRAINT "collaboration_submissions_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_submissions" ADD CONSTRAINT "collaboration_submissions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_task_assignment_id_fkey" FOREIGN KEY ("task_assignment_id") REFERENCES "task_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_media" ADD CONSTRAINT "check_in_media_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_media" ADD CONSTRAINT "check_in_media_check_in_id_fkey" FOREIGN KEY ("check_in_id") REFERENCES "check_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_media" ADD CONSTRAINT "check_in_media_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_submission_media" ADD CONSTRAINT "collaboration_submission_media_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_submission_media" ADD CONSTRAINT "collaboration_submission_media_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "collaboration_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_submission_media" ADD CONSTRAINT "collaboration_submission_media_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_logs" ADD CONSTRAINT "points_logs_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_logs" ADD CONSTRAINT "points_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "level_configs" ADD CONSTRAINT "level_configs_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "level_rewards" ADD CONSTRAINT "level_rewards_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "level_rewards" ADD CONSTRAINT "level_rewards_level_config_id_fkey" FOREIGN KEY ("level_config_id") REFERENCES "level_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "level_rewards" ADD CONSTRAINT "level_rewards_icon_media_id_fkey" FOREIGN KEY ("icon_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_image_media_id_fkey" FOREIGN KEY ("image_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "rewards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_fulfilled_by_fkey" FOREIGN KEY ("fulfilled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishes" ADD CONSTRAINT "wishes_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishes" ADD CONSTRAINT "wishes_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishes" ADD CONSTRAINT "wishes_adopted_reward_id_fkey" FOREIGN KEY ("adopted_reward_id") REFERENCES "rewards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "users" ADD CONSTRAINT "users_points_balance_nonnegative_check" CHECK ("points_balance" >= 0);
ALTER TABLE "users" ADD CONSTRAINT "users_points_earned_total_nonnegative_check" CHECK ("points_earned_total" >= 0);
ALTER TABLE "users" ADD CONSTRAINT "users_current_level_range_check" CHECK ("current_level" BETWEEN 1 AND 20);
ALTER TABLE "users" ADD CONSTRAINT "users_version_nonnegative_check" CHECK ("version" >= 0);
ALTER TABLE "users" ADD CONSTRAINT "users_failed_login_attempts_nonnegative_check" CHECK ("failed_login_attempts" >= 0);
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_expiry_after_creation_check" CHECK ("expires_at" > "created_at");
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_base_points_positive_check" CHECK ("base_points" > 0);
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_custom_points_positive_check" CHECK ("custom_points" IS NULL OR "custom_points" > 0);
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_date_range_check" CHECK ("end_date" IS NULL OR "end_date" >= "start_date");
ALTER TABLE "collaboration_rounds" ADD CONSTRAINT "collaboration_rounds_number_positive_check" CHECK ("round_number" > 0);
ALTER TABLE "collaboration_rounds" ADD CONSTRAINT "collaboration_rounds_date_range_check" CHECK ("end_date" >= "start_date");
ALTER TABLE "collaboration_round_participants" ADD CONSTRAINT "collaboration_participants_reward_nonnegative_check" CHECK ("reward_points_snapshot" >= 0);
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_points_nonnegative_check" CHECK ("points_earned" IS NULL OR "points_earned" >= 0);
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_streak_multiplier_positive_check" CHECK ("streak_multiplier" IS NULL OR "streak_multiplier" > 0);
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_dimensions_nonnegative_check" CHECK ("size_bytes" >= 0 AND ("width" IS NULL OR "width" >= 0) AND ("height" IS NULL OR "height" >= 0) AND ("duration" IS NULL OR "duration" >= 0));
ALTER TABLE "check_in_media" ADD CONSTRAINT "check_in_media_sort_order_nonnegative_check" CHECK ("sort_order" >= 0);
ALTER TABLE "collaboration_submission_media" ADD CONSTRAINT "collaboration_submission_media_sort_order_nonnegative_check" CHECK ("sort_order" >= 0);
ALTER TABLE "points_logs" ADD CONSTRAINT "points_logs_balances_nonnegative_check" CHECK ("balance_before" >= 0 AND "balance_after" >= 0 AND "earned_total_after" >= 0);
ALTER TABLE "points_logs" ADD CONSTRAINT "points_logs_balance_conservation_check" CHECK ("balance_after" = "balance_before" + "delta");
ALTER TABLE "points_logs" ADD CONSTRAINT "points_logs_delta_direction_check" CHECK (("type" IN ('earn', 'refund') AND "delta" > 0) OR ("type" = 'redeem' AND "delta" < 0) OR ("type" = 'manual' AND "delta" <> 0));
ALTER TABLE "level_configs" ADD CONSTRAINT "level_configs_level_range_check" CHECK ("level" BETWEEN 1 AND 20);
ALTER TABLE "level_configs" ADD CONSTRAINT "level_configs_values_range_check" CHECK ("points_required" >= 0 AND "discount" > 0 AND "discount" <= 1 AND "auto_approve_quota" >= 0 AND "wish_slots" >= 0 AND "double_points_days" >= 0 AND "skip_cards_per_month" >= 0 AND "skip_card_validity_days" >= 0);
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_points_cost_positive_check" CHECK ("points_cost" > 0);
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_stock_nonnegative_check" CHECK (("stock_total" IS NULL OR "stock_total" >= 0) AND "stock_reserved" >= 0 AND "stock_consumed" >= 0);
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_stock_capacity_check" CHECK ("stock_total" IS NULL OR "stock_reserved" + "stock_consumed" <= "stock_total");
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_points_nonnegative_check" CHECK ("listed_points_cost" > 0 AND "points_spent" >= 0);
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_discount_range_check" CHECK ("discount" > 0 AND "discount" <= 1);
ALTER TABLE "wishes" ADD CONSTRAINT "wishes_target_points_positive_check" CHECK ("target_points" > 0);

-- CreatePartialIndex
CREATE UNIQUE INDEX "users_email_active_key" ON "users" (LOWER("email")) WHERE "email" IS NOT NULL AND "deleted_at" IS NULL;
CREATE UNIQUE INDEX "check_ins_assignment_date_active_key" ON "check_ins" ("task_assignment_id", "check_date") WHERE "deleted_at" IS NULL;
