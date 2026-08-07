CREATE TYPE "notification_type" AS ENUM (
  'review',
  'points',
  'level',
  'redemption',
  'wish',
  'badge',
  'invitation'
);

CREATE TABLE "notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "family_id" UUID NOT NULL,
  "recipient_id" UUID NOT NULL,
  "type" "notification_type" NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "content" TEXT NOT NULL,
  "target_type" VARCHAR(80) NOT NULL,
  "target_id" UUID,
  "target_url" TEXT NOT NULL,
  "source_event_id" UUID NOT NULL,
  "source_event_name" VARCHAR(160) NOT NULL,
  "read_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notifications_content_check" CHECK (
    length(btrim("title")) >= 1 AND
    length(btrim("content")) >= 1 AND
    length(btrim("target_type")) >= 1 AND
    length(btrim("target_url")) >= 1
  ),
  CONSTRAINT "notifications_source_event_name_format_check" CHECK (
    "source_event_name" ~ '^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.v[1-9][0-9]*$'
  ),
  CONSTRAINT "notifications_read_time_check" CHECK ("read_at" IS NULL OR "read_at" >= "created_at")
);

CREATE TABLE "notification_preferences" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "family_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
  "browser_enabled" BOOLEAN NOT NULL DEFAULT false,
  "type_settings" JSONB NOT NULL DEFAULT '{}',
  "quiet_hours_enabled" BOOLEAN NOT NULL DEFAULT false,
  "quiet_hours_start" TIME(0),
  "quiet_hours_end" TIME(0),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_preferences_type_settings_object_check" CHECK (
    jsonb_typeof("type_settings") = 'object'
  ),
  CONSTRAINT "notification_preferences_quiet_hours_pair_check" CHECK (
    ("quiet_hours_start" IS NULL) = ("quiet_hours_end" IS NULL)
  ),
  CONSTRAINT "notification_preferences_quiet_hours_enabled_check" CHECK (
    NOT "quiet_hours_enabled" OR "quiet_hours_start" IS NOT NULL
  )
);

CREATE UNIQUE INDEX "notifications_source_event_id_recipient_id_key" ON "notifications"("source_event_id", "recipient_id");
CREATE INDEX "notifications_family_id_recipient_id_created_at_id_idx" ON "notifications"("family_id", "recipient_id", "created_at", "id");
CREATE INDEX "notifications_family_id_recipient_id_read_at_idx" ON "notifications"("family_id", "recipient_id", "read_at");
CREATE INDEX "notifications_family_id_created_at_id_idx" ON "notifications"("family_id", "created_at", "id");
CREATE UNIQUE INDEX "notification_preferences_user_id_key" ON "notification_preferences"("user_id");
CREATE INDEX "notification_preferences_family_id_user_id_idx" ON "notification_preferences"("family_id", "user_id");

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
