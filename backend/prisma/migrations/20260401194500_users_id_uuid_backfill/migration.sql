-- Ensure UUID generation function is available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Map only non-UUID user IDs (for example: 'test') to new UUIDs
CREATE TEMP TABLE "_user_id_map" AS
SELECT
  u.id AS old_id,
  gen_random_uuid()::text AS new_id
FROM "users" u
WHERE u.id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

-- Update all FK references to users.id dynamically before changing users.id values
DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT
      kcu.table_name,
      kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.constraint_schema = kcu.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.constraint_schema = tc.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'users'
      AND ccu.column_name = 'id'
  LOOP
    EXECUTE format(
      'UPDATE %I t
       SET %I = m.new_id
       FROM "_user_id_map" m
       WHERE t.%I = m.old_id',
      fk.table_name,
      fk.column_name,
      fk.column_name
    );
  END LOOP;
END $$;

-- Update users.id itself
UPDATE "users" u
SET "id" = m.new_id
FROM "_user_id_map" m
WHERE u.id = m.old_id;

-- Ensure all future user IDs are auto-generated as UUID text
ALTER TABLE "users"
ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
