-- AlterTable
ALTER TABLE "families" ADD COLUMN "family_code" VARCHAR(10);

-- Backfill stable codes from family UUIDs, resolving any prefix collision deterministically.
DO $$
DECLARE
    family_record RECORD;
    candidate TEXT;
    attempt INTEGER;
BEGIN
    FOR family_record IN SELECT "id" FROM "families" ORDER BY "id" LOOP
        candidate := UPPER(SUBSTRING(REPLACE(family_record."id"::text, '-', '') FROM 1 FOR 10));
        attempt := 0;
        WHILE EXISTS (SELECT 1 FROM "families" WHERE "family_code" = candidate) LOOP
            attempt := attempt + 1;
            candidate := UPPER(SUBSTRING(MD5(family_record."id"::text || ':' || attempt::text) FROM 1 FOR 10));
        END LOOP;
        UPDATE "families" SET "family_code" = candidate WHERE "id" = family_record."id";
    END LOOP;
END $$;

-- AlterTable
ALTER TABLE "families" ALTER COLUMN "family_code" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "families_family_code_key" ON "families"("family_code");

-- AddCheckConstraint
ALTER TABLE "families"
ADD CONSTRAINT "families_family_code_format_check"
CHECK ("family_code" ~ '^[A-Z0-9]{10}$');
