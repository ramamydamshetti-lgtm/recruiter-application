ALTER TABLE "candidates"
ADD COLUMN IF NOT EXISTS "linkedin_url" TEXT,
ADD COLUMN IF NOT EXISTS "highest_qualification" TEXT,
ADD COLUMN IF NOT EXISTS "available_for_interview" TEXT,
ADD COLUMN IF NOT EXISTS "reason_for_job_change" TEXT,
ADD COLUMN IF NOT EXISTS "offer_in_hand" TEXT,
ADD COLUMN IF NOT EXISTS "relevant_experience" TEXT;
