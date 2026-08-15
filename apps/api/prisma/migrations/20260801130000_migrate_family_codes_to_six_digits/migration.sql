BEGIN;

-- Prevent family creation while the finite code space is checked and reassigned.
LOCK TABLE "families" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF (SELECT COUNT(*) FROM "families") > 1000000 THEN
        RAISE EXCEPTION 'Six-digit family code space is exhausted';
    END IF;
END $$;

ALTER TABLE "families"
DROP CONSTRAINT "families_family_code_format_check";

-- The affine permutation assigns every existing family a distinct six-digit code.
WITH ranked_families AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (ORDER BY "id") - 1 AS sequence
    FROM "families"
)
UPDATE "families" AS family
SET "family_code" = LPAD(
    MOD((ranked.sequence::bigint * 999983) + 104729, 1000000)::text,
    6,
    '0'
)
FROM ranked_families AS ranked
WHERE family."id" = ranked."id";

ALTER TABLE "families"
ALTER COLUMN "family_code" TYPE VARCHAR(6);

ALTER TABLE "families"
ADD CONSTRAINT "families_family_code_format_check"
CHECK ("family_code" ~ '^[0-9]{6}$');

COMMIT;
