-- Daily counter table for user IDs like USER-2026-04-01-001
CREATE TABLE IF NOT EXISTS "user_id_counters" (
  "day_date" DATE PRIMARY KEY,
  "last_value" INTEGER NOT NULL
);

-- ID generator function used by users.id default
CREATE OR REPLACE FUNCTION generate_user_id()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_day DATE := CURRENT_DATE;
  v_seq INTEGER;
BEGIN
  INSERT INTO "user_id_counters" ("day_date", "last_value")
  VALUES (v_day, 1)
  ON CONFLICT ("day_date")
  DO UPDATE SET "last_value" = "user_id_counters"."last_value" + 1
  RETURNING "last_value" INTO v_seq;

  RETURN 'USER-' || to_char(v_day, 'YYYY-MM-DD') || '-' || lpad(v_seq::TEXT, 3, '0');
END;
$$;

-- Convert existing user IDs to USER-YYYY-MM-DD-###
CREATE TEMP TABLE "_user_id_map" AS
SELECT
  u.id AS old_id,
  generate_user_id() AS new_id
FROM "users" u
WHERE u.id !~ '^USER-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{3}$'
ORDER BY u."createdAt", u.id;

-- Update all FK references to users.id dynamically
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

-- Update users.id values
UPDATE "users" u
SET "id" = m.new_id
FROM "_user_id_map" m
WHERE u.id = m.old_id;

-- Set default for all upcoming users
ALTER TABLE "users"
ALTER COLUMN "id" SET DEFAULT generate_user_id();
