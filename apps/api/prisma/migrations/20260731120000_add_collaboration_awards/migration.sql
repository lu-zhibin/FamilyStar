ALTER TABLE "collaboration_round_participants"
ADD COLUMN "points_earned" INTEGER,
ADD COLUMN "streak_multiplier" DECIMAL(8,4);

ALTER TABLE "collaboration_round_participants"
ADD CONSTRAINT "collaboration_round_participants_award_snapshot_check"
CHECK (
  ("points_earned" IS NULL AND "streak_multiplier" IS NULL)
  OR ("points_earned" > 0 AND "streak_multiplier" > 0)
);
