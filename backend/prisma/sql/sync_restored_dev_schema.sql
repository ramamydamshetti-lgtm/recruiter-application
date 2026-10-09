-- Safe schema sync for Staffing_DB_Dev after live backup restore.
-- Adds objects from dev migrations that were baselined but never executed on this database.
-- All statements are idempotent; no data is deleted.

-- Requirements: email ingestion source columns (schema-only, no migration file)
ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "source_email_graph_message_id" TEXT;
ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "source_email_internet_message_id" TEXT;
ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "source_email_mailbox" TEXT;
ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "source_email_subject" TEXT;
CREATE INDEX IF NOT EXISTS "requirements_source_email_graph_message_id_idx"
  ON "requirements"("source_email_graph_message_id");

-- Candidates: created_by (schema-only, no migration file)
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "created_by" TEXT;
CREATE INDEX IF NOT EXISTS "candidates_created_by_idx" ON "candidates"("created_by");
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'candidates_created_by_fkey'
  ) THEN
    ALTER TABLE "candidates"
      ADD CONSTRAINT "candidates_created_by_fkey"
      FOREIGN KEY ("created_by") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 20260429121000_add_email_ingestion_events
CREATE TABLE IF NOT EXISTS "email_ingestion_events" (
    "id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "graph_message_id" TEXT,
    "internet_message_id" TEXT,
    "source" TEXT NOT NULL DEFAULT 'EMAIL_AUTOMATION',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "requirement_pk" TEXT,
    "requirement_code" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "email_ingestion_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "email_ingestion_events_idempotency_key_key"
  ON "email_ingestion_events"("idempotency_key");
CREATE INDEX IF NOT EXISTS "email_ingestion_events_graph_message_id_idx"
  ON "email_ingestion_events"("graph_message_id");
CREATE INDEX IF NOT EXISTS "email_ingestion_events_status_idx"
  ON "email_ingestion_events"("status");

-- 20260508130000_candidate_status_history
CREATE TABLE IF NOT EXISTS "candidate_status_history" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "old_status" TEXT,
    "new_status" TEXT NOT NULL,
    "changed_by_id" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "candidate_status_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "candidate_status_history_submission_id_idx"
  ON "candidate_status_history"("submission_id");
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'candidate_status_history_submission_id_fkey'
  ) THEN
    ALTER TABLE "candidate_status_history"
      ADD CONSTRAINT "candidate_status_history_submission_id_fkey"
      FOREIGN KEY ("submission_id") REFERENCES "submissions"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'candidate_status_history_changed_by_id_fkey'
  ) THEN
    ALTER TABLE "candidate_status_history"
      ADD CONSTRAINT "candidate_status_history_changed_by_id_fkey"
      FOREIGN KEY ("changed_by_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 20260508131000_interview_rounds
DO $$ BEGIN
  CREATE TYPE "InterviewRoundType" AS ENUM ('L1', 'L2', 'FINAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE IF NOT EXISTS "interview_rounds" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "legacy_interview_id" TEXT,
    "round_type" "InterviewRoundType" NOT NULL,
    "timezone" TEXT,
    "interviewer_name" TEXT,
    "interviewer_email" TEXT,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "meeting_link" TEXT,
    "notes" TEXT,
    "feedback" TEXT,
    "rating" INTEGER,
    "final_decision" "SubmissionStatus",
    "reschedule_count" INTEGER NOT NULL DEFAULT 0,
    "reschedule_history" JSONB,
    "reschedule_of_id" TEXT,
    "candidate_confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "interview_rounds_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "interview_rounds_legacy_interview_id_key"
  ON "interview_rounds"("legacy_interview_id");
CREATE INDEX IF NOT EXISTS "interview_rounds_submission_id_idx"
  ON "interview_rounds"("submission_id");
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'interview_rounds_submission_id_fkey'
  ) THEN
    ALTER TABLE "interview_rounds"
      ADD CONSTRAINT "interview_rounds_submission_id_fkey"
      FOREIGN KEY ("submission_id") REFERENCES "submissions"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'interview_rounds_reschedule_of_id_fkey'
  ) THEN
    ALTER TABLE "interview_rounds"
      ADD CONSTRAINT "interview_rounds_reschedule_of_id_fkey"
      FOREIGN KEY ("reschedule_of_id") REFERENCES "interview_rounds"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 20260508132000_offer_management
CREATE TABLE IF NOT EXISTS "offer_management" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "legacy_offer_letter_id" TEXT,
    "status" "OfferLetterStatus" NOT NULL DEFAULT 'DRAFT',
    "offered_ctc" DECIMAL(18,2),
    "currency" TEXT,
    "hr_notes" TEXT,
    "offer_expiry_date" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "declined_at" TIMESTAMP(3),
    "position_title" TEXT,
    "compensation" TEXT,
    "joining_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "offer_management_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "offer_management_submission_id_key"
  ON "offer_management"("submission_id");
CREATE UNIQUE INDEX IF NOT EXISTS "offer_management_legacy_offer_letter_id_key"
  ON "offer_management"("legacy_offer_letter_id");
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'offer_management_submission_id_fkey'
  ) THEN
    ALTER TABLE "offer_management"
      ADD CONSTRAINT "offer_management_submission_id_fkey"
      FOREIGN KEY ("submission_id") REFERENCES "submissions"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 20260508133000_communication_logs
DO $$ BEGIN
  CREATE TYPE "CommunicationLogStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE IF NOT EXISTS "communication_logs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "status" "CommunicationLogStatus" NOT NULL,
    "provider_message_id" TEXT,
    "requirement_id" TEXT,
    "submission_id" TEXT,
    "body" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "communication_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "communication_logs_requirement_id_idx"
  ON "communication_logs"("requirement_id");
CREATE INDEX IF NOT EXISTS "communication_logs_submission_id_idx"
  ON "communication_logs"("submission_id");
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'communication_logs_requirement_id_fkey'
  ) THEN
    ALTER TABLE "communication_logs"
      ADD CONSTRAINT "communication_logs_requirement_id_fkey"
      FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'communication_logs_submission_id_fkey'
  ) THEN
    ALTER TABLE "communication_logs"
      ADD CONSTRAINT "communication_logs_submission_id_fkey"
      FOREIGN KEY ("submission_id") REFERENCES "submissions"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
