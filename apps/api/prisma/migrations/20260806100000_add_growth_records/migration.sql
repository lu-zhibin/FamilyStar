CREATE TYPE "growth_record_type" AS ENUM (
  'check_in',
  'note',
  'milestone'
);

CREATE TABLE "growth_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "family_id" UUID NOT NULL,
  "child_id" UUID NOT NULL,
  "task_id" UUID,
  "type" "growth_record_type" NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "content_text" TEXT,
  "occurred_on" DATE NOT NULL,
  "source_type" VARCHAR(40),
  "source_id" UUID,
  "points_earned" INTEGER,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "growth_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "growth_records_title_check" CHECK (length(btrim("title")) >= 1),
  CONSTRAINT "growth_records_source_pair_check" CHECK (
    ("source_type" IS NULL AND "source_id" IS NULL) OR
    (length(btrim("source_type")) >= 1 AND "source_id" IS NOT NULL)
  ),
  CONSTRAINT "growth_records_points_earned_check" CHECK ("points_earned" IS NULL OR "points_earned" >= 0)
);

CREATE TABLE "growth_record_media" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "family_id" UUID NOT NULL,
  "growth_record_id" UUID NOT NULL,
  "media_asset_id" UUID NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "growth_record_media_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "growth_record_media_sort_order_check" CHECK ("sort_order" >= 0)
);

CREATE UNIQUE INDEX "growth_records_family_id_source_type_source_id_key" ON "growth_records"("family_id", "source_type", "source_id");
CREATE INDEX "growth_records_family_id_deleted_at_occurred_on_id_idx" ON "growth_records"("family_id", "deleted_at", "occurred_on", "id");
CREATE INDEX "growth_records_family_id_child_id_deleted_at_occurred_on_id_idx" ON "growth_records"("family_id", "child_id", "deleted_at", "occurred_on", "id");
CREATE INDEX "growth_records_family_id_task_id_deleted_at_occurred_on_id_idx" ON "growth_records"("family_id", "task_id", "deleted_at", "occurred_on", "id");
CREATE INDEX "growth_records_family_id_type_deleted_at_occurred_on_id_idx" ON "growth_records"("family_id", "type", "deleted_at", "occurred_on", "id");
CREATE UNIQUE INDEX "growth_record_media_growth_record_id_media_asset_id_key" ON "growth_record_media"("growth_record_id", "media_asset_id");
CREATE UNIQUE INDEX "growth_record_media_growth_record_id_sort_order_key" ON "growth_record_media"("growth_record_id", "sort_order");
CREATE INDEX "growth_record_media_family_id_media_asset_id_idx" ON "growth_record_media"("family_id", "media_asset_id");

ALTER TABLE "growth_records" ADD CONSTRAINT "growth_records_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "growth_records" ADD CONSTRAINT "growth_records_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "growth_records" ADD CONSTRAINT "growth_records_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "growth_records" ADD CONSTRAINT "growth_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "growth_record_media" ADD CONSTRAINT "growth_record_media_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "growth_record_media" ADD CONSTRAINT "growth_record_media_growth_record_id_fkey" FOREIGN KEY ("growth_record_id") REFERENCES "growth_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "growth_record_media" ADD CONSTRAINT "growth_record_media_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
