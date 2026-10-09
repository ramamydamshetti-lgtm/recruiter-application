-- Human-readable primary keys (global serial per table):
--   requirement_assignments: req_ass-001, req_ass-002, ...
--   requirement_activities:  req_act-001, ...
--   offer_letters:           off-001, ...
--   interviews:              int-001, ...
-- Min 3 digits; width grows automatically for 1000+.
-- Safe to run multiple times.

-- Requirement assignments
CREATE SEQUENCE IF NOT EXISTS global_requirement_assignment_pk_seq AS BIGINT START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_requirement_assignment_pk()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  n BIGINT;
  w INT;
BEGIN
  n := nextval('global_requirement_assignment_pk_seq');
  w := GREATEST(3, length(n::TEXT));
  RETURN 'req_ass-' || lpad(n::TEXT, w, '0');
END;
$$;

ALTER TABLE "requirement_assignments"
ALTER COLUMN "id" SET DEFAULT generate_requirement_assignment_pk();

-- Requirement activities
CREATE SEQUENCE IF NOT EXISTS global_requirement_activity_pk_seq AS BIGINT START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_requirement_activity_pk()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  n BIGINT;
  w INT;
BEGIN
  n := nextval('global_requirement_activity_pk_seq');
  w := GREATEST(3, length(n::TEXT));
  RETURN 'req_act-' || lpad(n::TEXT, w, '0');
END;
$$;

ALTER TABLE "requirement_activities"
ALTER COLUMN "id" SET DEFAULT generate_requirement_activity_pk();

-- Offer letters
CREATE SEQUENCE IF NOT EXISTS global_offer_letter_pk_seq AS BIGINT START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_offer_letter_pk()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  n BIGINT;
  w INT;
BEGIN
  n := nextval('global_offer_letter_pk_seq');
  w := GREATEST(3, length(n::TEXT));
  RETURN 'off-' || lpad(n::TEXT, w, '0');
END;
$$;

ALTER TABLE "offer_letters"
ALTER COLUMN "id" SET DEFAULT generate_offer_letter_pk();

-- Interviews
CREATE SEQUENCE IF NOT EXISTS global_interview_pk_seq AS BIGINT START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_interview_pk()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  n BIGINT;
  w INT;
BEGIN
  n := nextval('global_interview_pk_seq');
  w := GREATEST(3, length(n::TEXT));
  RETURN 'int-' || lpad(n::TEXT, w, '0');
END;
$$;

ALTER TABLE "interviews"
ALTER COLUMN "id" SET DEFAULT generate_interview_pk();
