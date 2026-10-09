-- Overall budget (single numeric column) replaces min/max salary for new entries.
ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "overall_budget" DOUBLE PRECISION;

UPDATE "requirements"
SET "overall_budget" = (
  CASE
    WHEN "salary_min" IS NOT NULL AND "salary_max" IS NOT NULL THEN ("salary_min" + "salary_max") / 2.0
    WHEN "salary_max" IS NOT NULL THEN "salary_max"
    WHEN "salary_min" IS NOT NULL THEN "salary_min"
    ELSE NULL
  END
)
WHERE "overall_budget" IS NULL;
