ALTER TABLE "users"
ADD COLUMN "selected_theme" VARCHAR(40) NOT NULL DEFAULT 'starlight';

ALTER TABLE "users"
ADD CONSTRAINT "users_selected_theme_format_check"
CHECK ("selected_theme" ~ '^[a-z][a-z0-9-]{0,39}$');
