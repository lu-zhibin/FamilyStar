-- Phase 1 reward redemption idempotency and audit snapshots.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "redemptions"
  ADD COLUMN "request_fingerprint" VARCHAR(64);

UPDATE "redemptions"
SET "request_fingerprint" = ENCODE(
  DIGEST('{"childId":"' || "child_id"::TEXT || '","rewardId":"' || "reward_id"::TEXT || '"}', 'sha256'),
  'hex'
);

ALTER TABLE "redemptions"
  ALTER COLUMN "request_fingerprint" SET NOT NULL;

ALTER TABLE "wishes"
  ADD COLUMN "cancelled_at" TIMESTAMPTZ(3),
  ADD COLUMN "adopted_at" TIMESTAMPTZ(3);

UPDATE "wishes"
SET "cancelled_at" = COALESCE("updated_at", "created_at")
WHERE "status" = 'cancelled';

UPDATE "wishes"
SET "adopted_at" = COALESCE("updated_at", "created_at")
WHERE "status" = 'adopted';

ALTER TABLE "redemptions"
  DROP CONSTRAINT "redemptions_points_nonnegative_check";

ALTER TABLE "redemptions"
  ADD CONSTRAINT "redemptions_points_spent_positive_check"
  CHECK ("listed_points_cost" > 0 AND "points_spent" > 0);

ALTER TABLE "redemptions"
  ADD CONSTRAINT "redemptions_status_consistency_check"
  CHECK (
    ("status" = 'pending' AND NOT "is_auto_approved" AND "approved_by" IS NULL AND "approved_at" IS NULL AND "rejected_by" IS NULL AND "rejected_at" IS NULL AND "rejection_reason" IS NULL AND "fulfilled_by" IS NULL AND "fulfilled_at" IS NULL)
    OR
    ("status" = 'approved' AND "approved_at" IS NOT NULL AND (("is_auto_approved" AND "approved_by" IS NULL) OR (NOT "is_auto_approved" AND "approved_by" IS NOT NULL)) AND "rejected_by" IS NULL AND "rejected_at" IS NULL AND "rejection_reason" IS NULL AND "fulfilled_by" IS NULL AND "fulfilled_at" IS NULL)
    OR
    ("status" = 'fulfilled' AND "approved_at" IS NOT NULL AND (("is_auto_approved" AND "approved_by" IS NULL) OR (NOT "is_auto_approved" AND "approved_by" IS NOT NULL)) AND "fulfilled_by" IS NOT NULL AND "fulfilled_at" IS NOT NULL AND "rejected_by" IS NULL AND "rejected_at" IS NULL AND "rejection_reason" IS NULL)
    OR
    ("status" = 'rejected' AND NOT "is_auto_approved" AND "approved_by" IS NULL AND "approved_at" IS NULL AND "rejected_by" IS NOT NULL AND "rejected_at" IS NOT NULL AND LENGTH(BTRIM("rejection_reason")) > 0 AND "fulfilled_by" IS NULL AND "fulfilled_at" IS NULL)
  );

ALTER TABLE "wishes"
  ADD CONSTRAINT "wishes_status_adoption_consistency_check"
  CHECK (
    ("status" = 'active' AND "adopted_reward_id" IS NULL AND "cancelled_at" IS NULL AND "adopted_at" IS NULL)
    OR ("status" = 'cancelled' AND "adopted_reward_id" IS NULL AND "cancelled_at" IS NOT NULL AND "adopted_at" IS NULL)
    OR ("status" = 'adopted' AND "adopted_reward_id" IS NOT NULL AND "cancelled_at" IS NULL AND "adopted_at" IS NOT NULL)
  );

CREATE INDEX "redemptions_frequency_lookup_idx"
  ON "redemptions" ("family_id", "reward_id", "child_id", "status", "created_at");

CREATE UNIQUE INDEX "points_logs_redemption_refund_once_idx"
  ON "points_logs" ("business_type", "business_id", "type")
  WHERE "type" = 'refund' AND "business_type" = 'redemption';
