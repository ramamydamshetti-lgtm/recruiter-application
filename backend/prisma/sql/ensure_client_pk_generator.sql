-- Client primary key ids: CLIENT-001, CLIENT-002, ... (min 3 digits)
-- Safe to run multiple times.

CREATE SEQUENCE IF NOT EXISTS global_client_pk_seq AS BIGINT START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_client_pk()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  n BIGINT;
  w INT;
BEGIN
  n := nextval('global_client_pk_seq');
  w := GREATEST(3, length(n::TEXT));
  RETURN 'CLIENT-' || lpad(n::TEXT, w, '0');
END;
$$;

ALTER TABLE "clients"
ALTER COLUMN "id" SET DEFAULT generate_client_pk();

