CREATE TYPE "media_upload_part_status" AS ENUM ('pending', 'confirmed');

ALTER TABLE "check_ins" ADD COLUMN "idempotency_key" VARCHAR(128);
UPDATE "check_ins" SET "idempotency_key" = gen_random_uuid()::text WHERE "idempotency_key" IS NULL;
ALTER TABLE "check_ins" ALTER COLUMN "idempotency_key" SET NOT NULL;

ALTER TABLE "collaboration_submissions" ADD COLUMN "idempotency_key" VARCHAR(128);
UPDATE "collaboration_submissions" SET "idempotency_key" = gen_random_uuid()::text WHERE "idempotency_key" IS NULL;
ALTER TABLE "collaboration_submissions" ALTER COLUMN "idempotency_key" SET NOT NULL;

CREATE TABLE "check_in_submission_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "check_in_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "content_text" TEXT,
    "status" "submission_status" NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,
    "media_ids" JSONB NOT NULL,
    "prior_status" "submission_status",
    "prior_reviewer_id" UUID,
    "prior_reviewed_at" TIMESTAMPTZ(3),
    "prior_review_comment" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "check_in_submission_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "collaboration_submission_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "content_text" TEXT,
    "status" "submission_status" NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,
    "media_ids" JSONB NOT NULL,
    "prior_status" "submission_status",
    "prior_reviewed_by" UUID,
    "prior_reviewed_at" TIMESTAMPTZ(3),
    "prior_review_comment" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "collaboration_submission_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "media_upload_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "upload_id" TEXT,
    "status" "media_upload_status" NOT NULL DEFAULT 'pending',
    "failure_code" VARCHAR(80),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "media_upload_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "media_upload_parts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "part_number" INTEGER NOT NULL,
    "status" "media_upload_part_status" NOT NULL DEFAULT 'pending',
    "etag" VARCHAR(255),
    "checksum" VARCHAR(128),
    "size_bytes" BIGINT,
    "confirmed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "media_upload_parts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "check_ins_family_id_idempotency_key_key" ON "check_ins"("family_id", "idempotency_key");
CREATE UNIQUE INDEX "collaboration_submissions_family_id_idempotency_key_key" ON "collaboration_submissions"("family_id", "idempotency_key");
CREATE UNIQUE INDEX "check_in_submission_attempts_check_in_id_attempt_number_key" ON "check_in_submission_attempts"("check_in_id", "attempt_number");
CREATE UNIQUE INDEX "check_in_submission_attempts_family_id_idempotency_key_key" ON "check_in_submission_attempts"("family_id", "idempotency_key");
CREATE INDEX "check_in_submission_attempts_family_id_check_in_id_submitted_at_idx" ON "check_in_submission_attempts"("family_id", "check_in_id", "submitted_at");
CREATE UNIQUE INDEX "collaboration_submission_attempts_submission_id_attempt_number_key" ON "collaboration_submission_attempts"("submission_id", "attempt_number");
CREATE UNIQUE INDEX "collaboration_submission_attempts_family_id_idempotency_key_key" ON "collaboration_submission_attempts"("family_id", "idempotency_key");
CREATE INDEX "collaboration_submission_attempts_family_id_submission_id_submitted_at_idx" ON "collaboration_submission_attempts"("family_id", "submission_id", "submitted_at");
CREATE UNIQUE INDEX "media_upload_sessions_media_asset_id_key" ON "media_upload_sessions"("media_asset_id");
CREATE UNIQUE INDEX "media_upload_sessions_family_id_idempotency_key_key" ON "media_upload_sessions"("family_id", "idempotency_key");
CREATE INDEX "media_upload_sessions_family_id_status_created_at_idx" ON "media_upload_sessions"("family_id", "status", "created_at");
CREATE UNIQUE INDEX "media_upload_parts_session_id_part_number_key" ON "media_upload_parts"("session_id", "part_number");
CREATE INDEX "media_upload_parts_family_id_session_id_status_idx" ON "media_upload_parts"("family_id", "session_id", "status");

ALTER TABLE "check_in_submission_attempts" ADD CONSTRAINT "check_in_submission_attempts_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "check_in_submission_attempts" ADD CONSTRAINT "check_in_submission_attempts_check_in_id_fkey" FOREIGN KEY ("check_in_id") REFERENCES "check_ins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "check_in_submission_attempts" ADD CONSTRAINT "check_in_submission_attempts_prior_reviewer_id_fkey" FOREIGN KEY ("prior_reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "collaboration_submission_attempts" ADD CONSTRAINT "collaboration_submission_attempts_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "collaboration_submission_attempts" ADD CONSTRAINT "collaboration_submission_attempts_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "collaboration_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "collaboration_submission_attempts" ADD CONSTRAINT "collaboration_submission_attempts_prior_reviewed_by_fkey" FOREIGN KEY ("prior_reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "media_upload_sessions" ADD CONSTRAINT "media_upload_sessions_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "media_upload_sessions" ADD CONSTRAINT "media_upload_sessions_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "media_upload_parts" ADD CONSTRAINT "media_upload_parts_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "media_upload_parts" ADD CONSTRAINT "media_upload_parts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "media_upload_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "check_in_submission_attempts" ADD CONSTRAINT "check_in_submission_attempts_number_check" CHECK ("attempt_number" > 0);
ALTER TABLE "collaboration_submission_attempts" ADD CONSTRAINT "collaboration_submission_attempts_number_check" CHECK ("attempt_number" > 0);
ALTER TABLE "media_upload_parts" ADD CONSTRAINT "media_upload_parts_number_check" CHECK ("part_number" BETWEEN 1 AND 10000);
ALTER TABLE "media_upload_parts" ADD CONSTRAINT "media_upload_parts_size_check" CHECK ("size_bytes" IS NULL OR "size_bytes" > 0);
ALTER TABLE "media_upload_sessions" ADD CONSTRAINT "media_upload_sessions_state_check" CHECK (("status" = 'failed' AND "failure_code" IS NOT NULL) OR ("status" <> 'failed'));
