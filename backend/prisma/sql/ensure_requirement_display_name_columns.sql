-- Optional: add display-name columns if the table exists but Prisma db push was not run yet.
-- Safe to run multiple times (PostgreSQL 9.5+).

ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "requirement_creator_name" TEXT;
ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "assigned_to_recruiter_name" TEXT;
ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "assignment_assigner_name" TEXT;
