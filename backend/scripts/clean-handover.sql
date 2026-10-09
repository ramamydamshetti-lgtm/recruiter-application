-- Handover: wipe business data, keep users.
-- Run as: psql "$DATABASE_URL" -f scripts/clean-handover.sql
-- Backup first: pg_dump ...

BEGIN;

DELETE FROM "interviews";
DELETE FROM "submissions";
DELETE FROM "requirement_assignments";
DELETE FROM "candidates";
DELETE FROM "requirements";
DELETE FROM "clients";

COMMIT;

-- Optional: verify
-- SELECT 'users' AS t, COUNT(*) FROM "users"
-- UNION ALL SELECT 'clients', COUNT(*) FROM "clients"
-- UNION ALL SELECT 'requirements', COUNT(*) FROM "requirements";
