-- Durable Worker execution records support retries and deterministic re-entry.
CREATE TYPE "worker_job_status" AS ENUM ('running', 'succeeded', 'failed');

CREATE TABLE "worker_job_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "job_name" VARCHAR(80) NOT NULL,
  "run_key" VARCHAR(128) NOT NULL,
  "status" "worker_job_status" NOT NULL DEFAULT 'running',
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMPTZ(3),
  "next_retry_at" TIMESTAMPTZ(3),
  "error_code" VARCHAR(80),
  "result" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "worker_job_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "worker_job_runs_attempts_check" CHECK ("attempts" BETWEEN 1 AND 3),
  CONSTRAINT "worker_job_runs_state_check" CHECK (
    ("status" = 'running' AND "finished_at" IS NULL AND "next_retry_at" IS NULL AND "error_code" IS NULL)
    OR ("status" = 'succeeded' AND "finished_at" IS NOT NULL AND "next_retry_at" IS NULL AND "error_code" IS NULL)
    OR ("status" = 'failed' AND "finished_at" IS NOT NULL AND "error_code" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "worker_job_runs_job_name_run_key_key"
  ON "worker_job_runs" ("job_name", "run_key");

CREATE INDEX "worker_job_runs_status_next_retry_at_idx"
  ON "worker_job_runs" ("status", "next_retry_at");
