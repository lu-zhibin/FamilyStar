CREATE TYPE "review_target_type" AS ENUM ('check_in', 'collaboration_submission');
CREATE TYPE "review_decision" AS ENUM ('approved', 'rejected');
CREATE TYPE "review_source" AS ENUM ('parent', 'timeout');

CREATE TABLE "submission_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "target_type" "review_target_type" NOT NULL,
    "check_in_attempt_id" UUID,
    "collaboration_attempt_id" UUID,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "decision" "review_decision" NOT NULL,
    "source" "review_source" NOT NULL,
    "reason" TEXT,
    "reviewer_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "submission_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "submission_reviews_check_in_attempt_id_key" ON "submission_reviews"("check_in_attempt_id");
CREATE UNIQUE INDEX "submission_reviews_collaboration_attempt_id_key" ON "submission_reviews"("collaboration_attempt_id");
CREATE UNIQUE INDEX "submission_reviews_family_id_idempotency_key_key" ON "submission_reviews"("family_id", "idempotency_key");
CREATE INDEX "submission_reviews_family_id_reviewed_at_idx" ON "submission_reviews"("family_id", "reviewed_at");

ALTER TABLE "submission_reviews" ADD CONSTRAINT "submission_reviews_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "submission_reviews" ADD CONSTRAINT "submission_reviews_check_in_attempt_id_fkey" FOREIGN KEY ("check_in_attempt_id") REFERENCES "check_in_submission_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "submission_reviews" ADD CONSTRAINT "submission_reviews_collaboration_attempt_id_fkey" FOREIGN KEY ("collaboration_attempt_id") REFERENCES "collaboration_submission_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "submission_reviews" ADD CONSTRAINT "submission_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "submission_reviews" ADD CONSTRAINT "submission_reviews_target_check" CHECK (
    ("target_type" = 'check_in' AND "check_in_attempt_id" IS NOT NULL AND "collaboration_attempt_id" IS NULL)
    OR
    ("target_type" = 'collaboration_submission' AND "check_in_attempt_id" IS NULL AND "collaboration_attempt_id" IS NOT NULL)
);
ALTER TABLE "submission_reviews" ADD CONSTRAINT "submission_reviews_rejection_reason_check" CHECK (
    "decision" <> 'rejected' OR ("reason" IS NOT NULL AND length(btrim("reason")) > 0)
);
ALTER TABLE "submission_reviews" ADD CONSTRAINT "submission_reviews_source_reviewer_check" CHECK (
    ("source" = 'parent' AND "reviewer_id" IS NOT NULL)
    OR
    ("source" = 'timeout' AND "reviewer_id" IS NULL)
);
