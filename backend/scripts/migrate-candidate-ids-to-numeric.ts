import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const ok =
    process.argv.includes('--yes') ||
    process.argv.includes('-y') ||
    process.env.CONFIRM_MIGRATE_CANDIDATE_IDS_NUMERIC === 'true';

  if (!ok) {
    console.error(
      '\nRefusing to run: this rewrites candidates.id to numeric values.\n' +
        'Run: npx tsx scripts/migrate-candidate-ids-to-numeric.ts --yes\n',
    );
    process.exit(1);
  }

  console.warn('\n*** MIGRATING candidates.id TO NUMERIC TEXT (1..N) ***\n');

  const invalidRefs = await prisma.$queryRawUnsafe<Array<{ id: string; candidate_ref: string | null }>>(`
    SELECT id, candidate_ref
    FROM "candidates"
    WHERE candidate_ref IS NULL OR candidate_ref !~ '^CAND-[0-9]+$'
    LIMIT 20
  `);
  if (invalidRefs.length > 0) {
    console.error('Found candidates without valid CAND refs. Fix these before running migration:');
    for (const row of invalidRefs) {
      console.error(`  id=${row.id} candidate_ref=${row.candidate_ref ?? '(null)'}`);
    }
    process.exit(1);
  }

  const conflicts = await prisma.$queryRawUnsafe<Array<{ id: string; candidate_ref: string; new_id: string }>>(`
    WITH mapped AS (
      SELECT
        id,
        candidate_ref,
        regexp_replace(candidate_ref, '^CAND-', '') AS new_id
      FROM "candidates"
      WHERE candidate_ref ~ '^CAND-[0-9]+$'
    )
    SELECT m.id, m.candidate_ref, m.new_id
    FROM mapped m
    WHERE EXISTS (
      SELECT 1
      FROM "candidates" x
      WHERE x.id = m.new_id
        AND x.id <> m.id
    )
    LIMIT 20
  `);
  if (conflicts.length > 0) {
    console.error('Found ID conflicts; refusing migration. Sample:');
    for (const row of conflicts) {
      console.error(`  current id=${row.id} wants new id=${row.new_id} (ref=${row.candidate_ref})`);
    }
    process.exit(1);
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Temporary IDs avoid unique collisions while rewriting PK values.
    await tx.$executeRawUnsafe(`
      WITH mapped AS (
        SELECT
          id AS old_id,
          regexp_replace(candidate_ref, '^CAND-', '') AS new_id
        FROM "candidates"
        WHERE candidate_ref ~ '^CAND-[0-9]+$'
      )
      UPDATE "candidates" c
      SET id = 'TMP-NUM-' || m.new_id
      FROM mapped m
      WHERE c.id = m.old_id
        AND c.id <> 'TMP-NUM-' || m.new_id
    `);

    return tx.$executeRawUnsafe(`
      UPDATE "candidates"
      SET id = regexp_replace(id, '^TMP-NUM-', '')
      WHERE id LIKE 'TMP-NUM-%'
    `);
  });

  const check = await prisma.$queryRawUnsafe<
    Array<{ total: bigint; numeric_ids: bigint; min_id: bigint; max_id: bigint; distinct_id: bigint }>
  >(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE id ~ '^[0-9]+$')::bigint AS numeric_ids,
      COALESCE(MIN(id::BIGINT), 0)::bigint AS min_id,
      COALESCE(MAX(id::BIGINT), 0)::bigint AS max_id,
      COUNT(DISTINCT id::BIGINT)::bigint AS distinct_id
    FROM "candidates"
    WHERE id ~ '^[0-9]+$'
  `);

  const c = check[0];
  console.log(`Updated rows: ${updated}`);
  console.log(
    `Check: total=${c?.total ?? 0}, numeric_ids=${c?.numeric_ids ?? 0}, min=${c?.min_id ?? 0}, max=${c?.max_id ?? 0}, distinct=${c?.distinct_id ?? 0}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
