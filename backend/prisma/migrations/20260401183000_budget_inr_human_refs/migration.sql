-- Budget: store amounts in INR (whole currency units). Rename columns for clarity.
-- Heuristic: existing rows stored as "lakhs" (values < 1000) are multiplied by 100000.

ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "budget_currency" TEXT NOT NULL DEFAULT 'INR';

ALTER TABLE "requirements" RENAME COLUMN "yearly_budget_lakhs" TO "yearly_budget_inr";
ALTER TABLE "requirements" RENAME COLUMN "monthly_budget_lakhs" TO "monthly_budget_inr";

UPDATE "requirements"
SET "yearly_budget_inr" = "yearly_budget_inr" * 100000
WHERE "yearly_budget_inr" IS NOT NULL AND "yearly_budget_inr" > 0 AND "yearly_budget_inr" < 1000;

UPDATE "requirements"
SET "monthly_budget_inr" = "monthly_budget_inr" * 100000
WHERE "monthly_budget_inr" IS NOT NULL AND "monthly_budget_inr" > 0 AND "monthly_budget_inr" < 1000;

UPDATE "requirements"
SET "overall_budget" = "overall_budget" * 100000
WHERE "overall_budget" IS NOT NULL AND "overall_budget" > 0 AND "overall_budget" < 1000;

-- Human-readable refs for exports and recruiter-facing views (not internal cuids).
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "candidate_ref" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "candidates_candidate_ref_key" ON "candidates"("candidate_ref");

ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "submission_ref" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "submissions_submission_ref_key" ON "submissions"("submission_ref");

-- Prefer turning legacy REQ-* candidate primary keys into CND-* refs for readability.
UPDATE "candidates"
SET "candidate_ref" = REPLACE("id", 'REQ-', 'CND-')
WHERE "id" LIKE 'REQ-%' AND ("candidate_ref" IS NULL OR "candidate_ref" = '');

WITH numbered AS (
  SELECT
    "id",
    ("created_at"::date) AS d,
    ROW_NUMBER() OVER (PARTITION BY ("created_at"::date) ORDER BY "created_at") AS rn
  FROM "candidates"
  WHERE "candidate_ref" IS NULL OR TRIM("candidate_ref") = ''
)
UPDATE "candidates" c
SET "candidate_ref" = 'CND-' || to_char(n.d, 'YYYY-MM-DD') || '-' || lpad(n.rn::text, 4, '0')
FROM numbered n
WHERE c."id" = n."id";

WITH numbered AS (
  SELECT
    "id",
    ("created_at"::date) AS d,
    ROW_NUMBER() OVER (PARTITION BY ("created_at"::date) ORDER BY "created_at") AS rn
  FROM "submissions"
  WHERE "submission_ref" IS NULL OR TRIM("submission_ref") = ''
)
UPDATE "submissions" s
SET "submission_ref" = 'SUB-' || to_char(n.d, 'YYYY-MM-DD') || '-' || lpad(n.rn::text, 4, '0')
FROM numbered n
WHERE s."id" = n."id";
