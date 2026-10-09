-- Submission primary key ids: SUB-001, SUB-002, ... (min 3 digits, grows for 1000+)
-- Safe to run multiple times.

CREATE SEQUENCE IF NOT EXISTS global_submission_pk_seq AS BIGINT START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_submission_pk()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  n BIGINT;
  w INT;
BEGIN
  n := nextval('global_submission_pk_seq');
  w := GREATEST(3, length(n::TEXT));
  RETURN 'SUB-' || lpad(n::TEXT, w, '0');
END;
$$;

ALTER TABLE "submissions"
ALTER COLUMN "id" SET DEFAULT generate_submission_pk();
