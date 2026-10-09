-- Requirement primary key ids: REQ-001, REQ-002, ... (min 3 digits, grows for 1000+)
-- Safe to run multiple times.

CREATE SEQUENCE IF NOT EXISTS global_requirement_pk_seq AS BIGINT START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_requirement_pk()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  n BIGINT;
  w INT;
BEGIN
  n := nextval('global_requirement_pk_seq');
  w := GREATEST(3, length(n::TEXT));
  RETURN 'REQ-' || lpad(n::TEXT, w, '0');
END;
$$;

ALTER TABLE "requirements"
ALTER COLUMN "id" SET DEFAULT generate_requirement_pk();

