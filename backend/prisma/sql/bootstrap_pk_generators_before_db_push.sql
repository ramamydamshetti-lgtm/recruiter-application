-- Run once on an empty database before `npx prisma db push`.
-- Prisma creates tables with DEFAULT generate_*(); those functions must exist first.
-- Signup uses SELECT generate_user_id() before `users` exists, so that function is included here too.
-- After push, run prisma/sql/ensure_* scripts as needed (they ALTER columns). No ALTER here.

CREATE SEQUENCE IF NOT EXISTS global_client_pk_seq AS BIGINT START 1 INCREMENT 1;
CREATE OR REPLACE FUNCTION generate_client_pk()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE n BIGINT; w INT;
BEGIN
  n := nextval('global_client_pk_seq');
  w := GREATEST(3, length(n::TEXT));
  RETURN 'CLIENT-' || lpad(n::TEXT, w, '0');
END;
$$;

CREATE SEQUENCE IF NOT EXISTS global_requirement_pk_seq AS BIGINT START 1 INCREMENT 1;
CREATE OR REPLACE FUNCTION generate_requirement_pk()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE n BIGINT; w INT;
BEGIN
  n := nextval('global_requirement_pk_seq');
  w := GREATEST(3, length(n::TEXT));
  RETURN 'REQ-' || lpad(n::TEXT, w, '0');
END;
$$;

CREATE SEQUENCE IF NOT EXISTS global_submission_pk_seq AS BIGINT START 1 INCREMENT 1;
CREATE OR REPLACE FUNCTION generate_submission_pk()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE n BIGINT; w INT;
BEGIN
  n := nextval('global_submission_pk_seq');
  w := GREATEST(3, length(n::TEXT));
  RETURN 'SUB-' || lpad(n::TEXT, w, '0');
END;
$$;

CREATE SEQUENCE IF NOT EXISTS global_requirement_assignment_pk_seq AS BIGINT START 1 INCREMENT 1;
CREATE OR REPLACE FUNCTION generate_requirement_assignment_pk()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE n BIGINT; w INT;
BEGIN
  n := nextval('global_requirement_assignment_pk_seq');
  w := GREATEST(3, length(n::TEXT));
  RETURN 'req_ass-' || lpad(n::TEXT, w, '0');
END;
$$;

CREATE SEQUENCE IF NOT EXISTS global_requirement_activity_pk_seq AS BIGINT START 1 INCREMENT 1;
CREATE OR REPLACE FUNCTION generate_requirement_activity_pk()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE n BIGINT; w INT;
BEGIN
  n := nextval('global_requirement_activity_pk_seq');
  w := GREATEST(3, length(n::TEXT));
  RETURN 'req_act-' || lpad(n::TEXT, w, '0');
END;
$$;

CREATE SEQUENCE IF NOT EXISTS global_offer_letter_pk_seq AS BIGINT START 1 INCREMENT 1;
CREATE OR REPLACE FUNCTION generate_offer_letter_pk()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE n BIGINT; w INT;
BEGIN
  n := nextval('global_offer_letter_pk_seq');
  w := GREATEST(3, length(n::TEXT));
  RETURN 'off-' || lpad(n::TEXT, w, '0');
END;
$$;

CREATE SEQUENCE IF NOT EXISTS global_interview_pk_seq AS BIGINT START 1 INCREMENT 1;
CREATE OR REPLACE FUNCTION generate_interview_pk()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE n BIGINT; w INT;
BEGIN
  n := nextval('global_interview_pk_seq');
  w := GREATEST(3, length(n::TEXT));
  RETURN 'int-' || lpad(n::TEXT, w, '0');
END;
$$;

CREATE SEQUENCE IF NOT EXISTS global_user_code_seq AS BIGINT START 1 INCREMENT 1;
CREATE OR REPLACE FUNCTION generate_user_id()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE n BIGINT; w INT;
BEGIN
  n := nextval('global_user_code_seq');
  w := GREATEST(3, length(n::TEXT));
  RETURN 'user-' || lpad(n::TEXT, w, '0');
END;
$$;
