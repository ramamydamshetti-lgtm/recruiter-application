-- Role-based submission workflow: lead review stage + client forward audit fields
-- Note: enum value adds only — legacy SUBMITTED rows are mapped in application code.

ALTER TYPE "SubmissionStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED_TO_LEAD';
ALTER TYPE "SubmissionStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED_TO_CLIENT';

ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "assigned_lead_id" TEXT;
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "assigned_lead_name" TEXT;
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "forwarded_by" TEXT;
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "forwarded_on" TIMESTAMP(3);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'submissions_assigned_lead_id_fkey') THEN
    ALTER TABLE "submissions"
      ADD CONSTRAINT "submissions_assigned_lead_id_fkey"
      FOREIGN KEY ("assigned_lead_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'submissions_forwarded_by_fkey') THEN
    ALTER TABLE "submissions"
      ADD CONSTRAINT "submissions_forwarded_by_fkey"
      FOREIGN KEY ("forwarded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "submissions_assigned_lead_id_idx" ON "submissions"("assigned_lead_id");
