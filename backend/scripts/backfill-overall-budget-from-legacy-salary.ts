/**
 * One-time: copy legacy salary_min/salary_max into overall_budget (lakhs) where overall_budget is null.
 * Run BEFORE `prisma db push` after removing salary columns from schema, OR run while columns still exist.
 *
 * Heuristic: values >= 100000 treated as annual rupees → divide by 100000 for lakhs.
 * Smaller values treated as already in lakhs.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const n = await prisma.$executeRaw`
    UPDATE "requirements"
    SET "overall_budget" = COALESCE(
      "overall_budget",
      CASE
        WHEN COALESCE("salary_max", 0) >= 100000 OR COALESCE("salary_min", 0) >= 100000 THEN
          GREATEST(COALESCE("salary_max", 0), COALESCE("salary_min", 0))::double precision / 100000.0
        WHEN GREATEST(COALESCE("salary_max", 0), COALESCE("salary_min", 0)) > 0 THEN
          GREATEST(COALESCE("salary_max", 0), COALESCE("salary_min", 0))::double precision
        ELSE NULL
      END
    )
    WHERE "overall_budget" IS NULL
      AND (COALESCE("salary_max", 0) > 0 OR COALESCE("salary_min", 0) > 0)
  `;
  console.log('Rows updated (approx batch count):', n);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
