-- Reset transactional recruiting data while keeping users and clients.
-- Run against a demo/staging database only. Destructive and not reversible.
-- Usage (example): psql "$DATABASE_URL" -f scripts/clean-recruiter-demo-data.sql

BEGIN;

TRUNCATE TABLE
  offer_letters,
  interviews,
  submissions,
  requirement_activities,
  requirement_assignments,
  requirements,
  candidates
RESTART IDENTITY CASCADE;

COMMIT;
