/**
 * Rewrite candidates.id to CAND-### (matching candidates.candidate_ref).
 *
 * Why:
 * - Some older rows still use cuid-like internal IDs (e.g. cmp...).
 * - Product requirement is to use readable sequential candidate IDs everywhere.
 *
 * Safety:
 * - Requires --yes (or CONFIRM_MIGRATE_CANDIDATE_IDS=true).
 * - Updates only rows where candidate_ref is valid CAND-### and id differs.
 * - Relies on FK ON UPDATE CASCADE for dependent tables (e.g. submissions.candidate_id).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const ok =
    process.argv.includes('--yes') ||
    process.argv.includes('-y') ||
    process.env.CONFIRM_MIGRATE_CANDIDATE_IDS === 'true';

  if (!ok) {
    console.error(
      '\nRefusing to run: this rewrites candidates.id for existing rows.\n' +
        'Run: npx tsx scripts/migrate-candidate-ids-to-cand.ts --yes\n',
    );
    process.exit(1);
  }

  console.warn('\n*** REWRITING candidates.id -> CAND-### (from candidate_ref) ***\n');

  const conflicts = await prisma.$queryRawUnsafe<Array<{ id: string; candidate_ref: string }>>(`
    SELECT c.id, c.candidate_ref
    FROM "candidates" c
    WHERE c.candidate_ref ~ '^CAND-[0-9]+$'
      AND c.id <> c.candidate_ref
      AND EXISTS (
        SELECT 1
        FROM "candidates" x
        WHERE x.id = c.candidate_ref
          AND x.id <> c.id
      )
    LIMIT 20
  `);
  if (conflicts.length > 0) {
    console.error('Found ID conflicts; refusing migration. Sample conflicts:');
    for (const row of conflicts) {
      console.error(`  current id=${row.id} wants new id=${row.candidate_ref}`);
    }
    process.exit(1);
  }

  const before = await prisma.$queryRawUnsafe<Array<{ total: bigint; cand_ids: bigint }>>(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE id ~ '^CAND-[0-9]+$')::bigint AS cand_ids
    FROM "candidates"
  `);

  const updated = await prisma.$transaction(async (tx) => {
    return tx.$executeRawUnsafe(`
      UPDATE "candidates" c
      SET id = c.candidate_ref
      WHERE c.candidate_ref ~ '^CAND-[0-9]+$'
        AND c.id <> c.candidate_ref
    `);
  });

  const after = await prisma.$queryRawUnsafe<Array<{ total: bigint; cand_ids: bigint }>>(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE id ~ '^CAND-[0-9]+$')::bigint AS cand_ids
    FROM "candidates"
  `);

  const b = before[0];
  const a = after[0];
  console.log(`Updated candidate IDs: ${updated}`);
  console.log(`Before: total=${b?.total ?? 0}, CAND ids=${b?.cand_ids ?? 0}`);
  console.log(`After:  total=${a?.total ?? 0}, CAND ids=${a?.cand_ids ?? 0}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
