-- interview_rounds + InterviewRoundType enum

CREATE TYPE "InterviewRoundType" AS ENUM ('L1', 'L2', 'FINAL');

CREATE TABLE "interview_rounds" (
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

CREATE UNIQUE INDEX "interview_rounds_legacy_interview_id_key" ON "interview_rounds"("legacy_interview_id");

CREATE INDEX "interview_rounds_submission_id_idx" ON "interview_rounds"("submission_id");

ALTER TABLE "interview_rounds" ADD CONSTRAINT "interview_rounds_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "interview_rounds" ADD CONSTRAINT "interview_rounds_reschedule_of_id_fkey" FOREIGN KEY ("reschedule_of_id") REFERENCES "interview_rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
