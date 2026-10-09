/**
 * Backfills `candidates.candidate_ref` to CAND-1, CAND-2, ... ordered by createdAt ASC.
 * The internal cuid `candidates.id` is NOT touched. No FK changes.
 *
 * Idempotent: rows that already match CAND-### are skipped, and the sequence is
 * advanced past the highest existing number so new candidates continue cleanly.
 *
 * Usage:
 *   npx prisma db execute --file prisma/sql/ensure_candidate_ref_generator.sql
 *   npx tsx scripts/migrate-candidate-refs-to-seq.ts --yes
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const ok =
    process.argv.includes('--yes') ||
    process.argv.includes('-y') ||
    process.env.CONFIRM_MIGRATE_CANDIDATE_REFS === 'true';

  if (!ok) {
    console.error(
      '\nRefusing to run: this rewrites candidates.candidate_ref for existing rows.\n' +
        'Run: npx tsx scripts/migrate-candidate-refs-to-seq.ts --yes\n',
    );
    process.exit(1);
  }

  console.warn('\n*** BACKFILLING candidates.candidate_ref -> CAND-N ***\n');

  await prisma.$transaction(async (tx) => {
    // Ensure generator exists and default is set on candidate_ref.
    await tx.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS global_candidate_ref_seq AS BIGINT START 1 INCREMENT 1`,
    );
    await tx.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION generate_candidate_ref()
      RETURNS TEXT
      LANGUAGE plpgsql
      AS $$
      DECLARE
        n BIGINT;
      BEGIN
        n := nextval('global_candidate_ref_seq');
        RETURN 'CAND-' || n::TEXT;
      END;
      $$;
    `);
    await tx.$executeRawUnsafe(
      `ALTER TABLE "candidates" ALTER COLUMN "candidate_ref" SET DEFAULT generate_candidate_ref()`,
    );

    // Advance the sequence past any existing CAND-### values so we never collide.
    await tx.$executeRawUnsafe(`
      DO $$
      DECLARE
        max_n BIGINT;
      BEGIN
        SELECT COALESCE(MAX(NULLIF(regexp_replace(candidate_ref, '^CAND-', ''), '')::BIGINT), 0)
          INTO max_n
        FROM "candidates"
        WHERE candidate_ref ~ '^CAND-[0-9]+$';
        IF max_n > 0 THEN
          PERFORM setval('global_candidate_ref_seq', max_n, true);
        END IF;
      END$$;
    `);

    // Renumber rows that don't already match CAND-###, in stable order.
    const updated = await tx.$executeRawUnsafe(`
      WITH rows_to_update AS (
        SELECT id
        FROM "candidates"
        WHERE candidate_ref IS NULL
           OR candidate_ref !~ '^CAND-[0-9]+$'
        ORDER BY created_at ASC, id ASC
      )
      UPDATE "candidates" c
      SET candidate_ref = generate_candidate_ref()
      FROM rows_to_update r
      WHERE c.id = r.id
    `);

    console.log(`Updated ${updated} candidate rows with new CAND-N refs.`);
  });

  const sample = await prisma.candidate.findMany({
    take: 5,
    orderBy: { createdAt: 'asc' },
    select: { id: true, candidateRef: true, name: true, email: true },
  });
  console.log('\nFirst 5 candidates after backfill:');
  for (const row of sample) {
    console.log(`  ${row.candidateRef ?? '(none)'}\t${row.name}\t${row.email}`);
  }

  const total = await prisma.candidate.count();
  const named = await prisma.candidate.count({
    where: { candidateRef: { startsWith: 'CAND-' } },
  });
  console.log(`\nTotal candidates: ${total}`);
  console.log(`Now using CAND-N format: ${named}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
