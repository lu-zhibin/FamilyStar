CREATE UNIQUE INDEX "invitations_family_email_pending_key"
ON "invitations" ("family_id", LOWER("email"))
WHERE "status" = 'pending';

ALTER TABLE "invitations"
ADD CONSTRAINT "invitations_status_consistency_check" CHECK (
  ("status" = 'pending' AND "invited_user_id" IS NULL AND "accepted_at" IS NULL)
  OR ("status" = 'accepted' AND "invited_user_id" IS NOT NULL AND "accepted_at" IS NOT NULL)
  OR ("status" = 'expired' AND "invited_user_id" IS NULL AND "accepted_at" IS NULL)
);
