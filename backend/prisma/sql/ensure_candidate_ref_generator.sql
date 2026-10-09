-- Candidate human-readable ref ids: CAND-YYYY-MM-DD-001, CAND-YYYY-MM-DD-002, ...
-- Serial resets per calendar day. Stored in candidates.candidate_ref.
-- Safe to run multiple times.

CREATE OR REPLACE FUNCTION generate_candidate_ref()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  today TEXT;
  prefix TEXT;
  n INTEGER;
BEGIN
  today := to_char(CURRENT_DATE, 'YYYY-MM-DD');
  prefix := 'CAND-' || today || '-';
  SELECT COALESCE(MAX(CAST(RIGHT(candidate_ref, 3) AS INTEGER)), 0) + 1
  INTO n
  FROM candidates
  WHERE candidate_ref LIKE prefix || '%'
    AND candidate_ref ~ '^CAND-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{3}$';
  RETURN prefix || lpad(n::TEXT, 3, '0');
END;
$$;

ALTER TABLE "candidates"
ALTER COLUMN "candidate_ref" SET DEFAULT generate_candidate_ref();
