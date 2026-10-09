-- candidate_status_history (CandidateStatusHistory)

CREATE TABLE "candidate_status_history" (
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

CREATE INDEX "candidate_status_history_submission_id_idx" ON "candidate_status_history"("submission_id");

ALTER TABLE "candidate_status_history" ADD CONSTRAINT "candidate_status_history_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "candidate_status_history" ADD CONSTRAINT "candidate_status_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
