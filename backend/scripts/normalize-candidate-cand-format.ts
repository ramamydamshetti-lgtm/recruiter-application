import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const ok =
    process.argv.includes('--yes') ||
    process.argv.includes('-y') ||
    process.env.CONFIRM_NORMALIZE_CAND_FORMAT === 'true';

  if (!ok) {
    console.error(
      '\nRefusing to run: this rewrites candidates.id and candidates.candidate_ref.\n' +
        'Run: npx tsx scripts/normalize-candidate-cand-format.ts --yes\n',
    );
    process.exit(1);
  }

  console.warn('\n*** NORMALIZING CAND IDs: CAND-001 -> CAND-1 ***\n');

  const updated = await prisma.$transaction(async (tx) => {
    return tx.$executeRawUnsafe(`
      WITH mapped AS (
        SELECT
          id AS old_id,
          candidate_ref AS old_ref,
          'CAND-' || (regexp_replace(candidate_ref, '^CAND-', ''))::BIGINT::TEXT AS new_ref
        FROM "candidates"
        WHERE candidate_ref ~ '^CAND-[0-9]+$'
      )
      UPDATE "candidates" c
      SET
        candidate_ref = m.new_ref,
        id = m.new_ref
      FROM mapped m
      WHERE c.id = m.old_id
        AND (c.candidate_ref <> m.new_ref OR c.id <> m.new_ref)
    `);
  });

  // Keep next generated value aligned with highest numeric suffix.
  await prisma.$executeRawUnsafe(`
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

  const sample = await prisma.candidate.findMany({
    orderBy: { createdAt: 'asc' },
    take: 5,
    select: { id: true, candidateRef: true, name: true },
  });

  console.log(`Updated rows: ${updated}`);
  console.log('\nFirst 5 candidates after normalization:');
  for (const row of sample) {
    console.log(`  id=${row.id}\tref=${row.candidateRef ?? '(none)'}\t${row.name}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
