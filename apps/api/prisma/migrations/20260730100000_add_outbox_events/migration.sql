-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "actor_id" UUID,
    "event_name" VARCHAR(160) NOT NULL,
    "correlation_id" VARCHAR(128) NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_at" TIMESTAMPTZ(3),
    "lock_owner" VARCHAR(128),
    "last_error" VARCHAR(80),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "outbox_events_attempts_nonnegative_check" CHECK ("attempts" >= 0),
    CONSTRAINT "outbox_events_publish_time_check" CHECK ("published_at" IS NULL OR "published_at" >= "occurred_at"),
    CONSTRAINT "outbox_events_lease_pair_check" CHECK (("locked_at" IS NULL) = ("lock_owner" IS NULL)),
    CONSTRAINT "outbox_events_event_name_format_check" CHECK ("event_name" ~ '^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.v[1-9][0-9]*$')
);

-- CreateIndex
CREATE INDEX "outbox_events_published_at_available_at_created_at_idx" ON "outbox_events"("published_at", "available_at", "created_at");

-- CreateIndex
CREATE INDEX "outbox_events_family_id_occurred_at_idx" ON "outbox_events"("family_id", "occurred_at");

-- CreateIndex
CREATE INDEX "outbox_events_locked_at_idx" ON "outbox_events"("locked_at");

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
