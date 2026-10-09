-- Global user ids: user-001, user-002, ... (minimum 3 digits, grows for 1000+)
-- Safe to run multiple times.

CREATE SEQUENCE IF NOT EXISTS global_user_code_seq AS BIGINT START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_user_id()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  n BIGINT;
  w INT;
BEGIN
  n := nextval('global_user_code_seq');
  w := GREATEST(3, length(n::TEXT));
  RETURN 'user-' || lpad(n::TEXT, w, '0');
END;
$$;

ALTER TABLE "users"
ALTER COLUMN "id" SET DEFAULT generate_user_id();
