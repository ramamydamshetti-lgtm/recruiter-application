-- Performance indexes (idempotent: safe on restored live backup where indexes may already exist)

CREATE INDEX IF NOT EXISTS "candidates_phone_normalized_idx" ON "candidates"("phone_normalized");

CREATE INDEX IF NOT EXISTS "interviews_submission_id_idx" ON "interviews"("submission_id");
CREATE INDEX IF NOT EXISTS "interviews_recruiter_id_idx" ON "interviews"("recruiter_id");
CREATE INDEX IF NOT EXISTS "interviews_scheduled_at_idx" ON "interviews"("scheduled_at" DESC);
CREATE INDEX IF NOT EXISTS "interviews_recruiter_id_scheduled_at_idx" ON "interviews"("recruiter_id", "scheduled_at" DESC);

CREATE INDEX IF NOT EXISTS "requirements_is_deleted_status_idx" ON "requirements"("is_deleted", "status");
CREATE INDEX IF NOT EXISTS "requirements_is_deleted_created_at_idx" ON "requirements"("is_deleted", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "submissions_submitted_by_submitted_on_idx" ON "submissions"("submitted_by", "submitted_on" DESC);
CREATE INDEX IF NOT EXISTS "submissions_requirement_id_idx" ON "submissions"("requirement_id");
CREATE INDEX IF NOT EXISTS "submissions_status_idx" ON "submissions"("status");

CREATE INDEX IF NOT EXISTS "requirement_assignments_recruiter_id_status_idx" ON "requirement_assignments"("recruiter_id", "status");
CREATE INDEX IF NOT EXISTS "requirement_assignments_requirement_id_status_assigned_on_idx" ON "requirement_assignments"("requirement_id", "status", "assigned_on" DESC);

CREATE INDEX IF NOT EXISTS "requirement_activities_requirement_id_idx" ON "requirement_activities"("requirement_id");
