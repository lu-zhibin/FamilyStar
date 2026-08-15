ALTER TABLE "families"
ADD COLUMN "settings_version" INTEGER NOT NULL DEFAULT 0;

UPDATE "families"
SET "settings" = jsonb_set(
  COALESCE("settings", '{}'::jsonb),
  '{modules}',
  '{"analytics":true,"growth-records":true,"levels":true,"rewards":true,"badges":true,"notifications":true}'::jsonb
    || CASE
      WHEN jsonb_typeof("settings"->'modules') = 'object' THEN "settings"->'modules'
      ELSE '{}'::jsonb
    END,
  true
);

ALTER TABLE "families"
ADD CONSTRAINT "families_settings_version_nonnegative_check"
CHECK ("settings_version" >= 0);
