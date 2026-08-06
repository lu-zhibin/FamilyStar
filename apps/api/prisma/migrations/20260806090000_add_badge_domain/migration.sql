CREATE TYPE "badge_condition_type" AS ENUM (
  'task_completion_count',
  'streak_days',
  'total_points',
  'level_reached',
  'collaboration_count',
  'manual'
);

CREATE TABLE "badge_templates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "family_id" UUID NOT NULL,
  "preset_code" VARCHAR(40),
  "name" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "icon" VARCHAR(80) NOT NULL,
  "category" VARCHAR(80) NOT NULL,
  "condition_type" "badge_condition_type" NOT NULL,
  "condition" JSONB NOT NULL,
  "award_level" INTEGER NOT NULL DEFAULT 1,
  "is_visible" BOOLEAN NOT NULL DEFAULT true,
  "is_enabled" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "badge_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "badge_templates_condition_object_check" CHECK (jsonb_typeof("condition") = 'object'),
  CONSTRAINT "badge_templates_condition_type_check" CHECK (
    "condition"->>'type' = UPPER("condition_type"::text)
  ),
  CONSTRAINT "badge_templates_target_check" CHECK (
    ("condition_type" = 'manual' AND NOT ("condition" ? 'target')) OR
    ("condition_type" <> 'manual' AND jsonb_typeof("condition"->'target') = 'number' AND ("condition"->>'target')::numeric >= 1 AND ("condition"->>'target')::numeric <= 2147483647 AND trunc(("condition"->>'target')::numeric) = ("condition"->>'target')::numeric)
  ),
  CONSTRAINT "badge_templates_award_level_check" CHECK ("award_level" >= 1),
  CONSTRAINT "badge_templates_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "badge_awards" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "family_id" UUID NOT NULL,
  "template_id" UUID NOT NULL,
  "child_id" UUID NOT NULL,
  "level" INTEGER NOT NULL DEFAULT 1,
  "template_name_snapshot" VARCHAR(120) NOT NULL,
  "template_description_snapshot" TEXT,
  "template_icon_snapshot" VARCHAR(80) NOT NULL,
  "template_category_snapshot" VARCHAR(80) NOT NULL,
  "template_condition_type_snapshot" "badge_condition_type" NOT NULL,
  "template_condition_snapshot" JSONB NOT NULL,
  "template_version" INTEGER NOT NULL,
  "reason" TEXT,
  "source_event_id" UUID,
  "awarded_by" UUID,
  "awarded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "badge_awards_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "badge_awards_level_check" CHECK ("level" >= 1),
  CONSTRAINT "badge_awards_template_version_check" CHECK ("template_version" >= 1),
  CONSTRAINT "badge_awards_snapshot_object_check" CHECK (jsonb_typeof("template_condition_snapshot") = 'object')
);

CREATE TABLE "badge_progress" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "family_id" UUID NOT NULL,
  "template_id" UUID NOT NULL,
  "child_id" UUID NOT NULL,
  "level" INTEGER NOT NULL DEFAULT 1,
  "current_value" INTEGER NOT NULL DEFAULT 0,
  "target_value" INTEGER NOT NULL,
  "evaluated_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "badge_progress_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "badge_progress_values_check" CHECK ("level" >= 1 AND "current_value" >= 0 AND "target_value" >= 1)
);

CREATE UNIQUE INDEX "badge_templates_family_id_preset_code_key" ON "badge_templates"("family_id", "preset_code");
CREATE INDEX "badge_templates_family_id_is_enabled_deleted_at_idx" ON "badge_templates"("family_id", "is_enabled", "deleted_at");
CREATE UNIQUE INDEX "badge_awards_template_id_child_id_level_key" ON "badge_awards"("template_id", "child_id", "level");
CREATE INDEX "badge_awards_family_id_child_id_awarded_at_idx" ON "badge_awards"("family_id", "child_id", "awarded_at");
CREATE INDEX "badge_awards_family_id_source_event_id_idx" ON "badge_awards"("family_id", "source_event_id");
CREATE UNIQUE INDEX "badge_progress_template_id_child_id_level_key" ON "badge_progress"("template_id", "child_id", "level");
CREATE INDEX "badge_progress_family_id_child_id_idx" ON "badge_progress"("family_id", "child_id");

ALTER TABLE "badge_templates" ADD CONSTRAINT "badge_templates_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_templates" ADD CONSTRAINT "badge_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "badge_awards" ADD CONSTRAINT "badge_awards_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_awards" ADD CONSTRAINT "badge_awards_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "badge_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_awards" ADD CONSTRAINT "badge_awards_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_awards" ADD CONSTRAINT "badge_awards_awarded_by_fkey" FOREIGN KEY ("awarded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "badge_progress" ADD CONSTRAINT "badge_progress_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_progress" ADD CONSTRAINT "badge_progress_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "badge_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "badge_progress" ADD CONSTRAINT "badge_progress_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "badge_templates" (
  "family_id",
  "preset_code",
  "name",
  "description",
  "icon",
  "category",
  "condition_type",
  "condition"
)
SELECT
  family."id",
  preset."preset_code",
  preset."name",
  preset."description",
  preset."icon",
  preset."category",
  LOWER(preset."condition_type")::"badge_condition_type",
  jsonb_build_object('type', preset."condition_type", 'target', preset."target")
FROM "families" AS family
CROSS JOIN (
  VALUES
    ('first-task', '初次启程', '完成首个任务', '⭐', '任务', 'TASK_COMPLETION_COUNT', 1),
    ('seven-tasks', '小小行动家', '累计完成 7 次任务', '✅', '任务', 'TASK_COMPLETION_COUNT', 7),
    ('seven-day-streak', '坚持一周', '连续 7 天完成任务', '🔥', '坚持', 'STREAK_DAYS', 7),
    ('one-hundred-points', '百分新星', '累计获得 100 分', '💯', '积分', 'TOTAL_POINTS', 100),
    ('level-three', '三级成长', '成长等级达到 3 级', '🌱', '等级', 'LEVEL_REACHED', 3),
    ('first-collaboration', '合作之星', '首次完成协作任务', '🤝', '协作', 'COLLABORATION_COUNT', 1)
) AS preset("preset_code", "name", "description", "icon", "category", "condition_type", "target")
WHERE family."deleted_at" IS NULL
ON CONFLICT ("family_id", "preset_code") DO NOTHING;
