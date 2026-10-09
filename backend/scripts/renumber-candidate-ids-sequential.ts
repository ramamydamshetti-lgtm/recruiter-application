import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const ok =
    process.argv.includes('--yes') ||
    process.argv.includes('-y') ||
    process.env.CONFIRM_RENUMBER_CANDIDATES === 'true';

  if (!ok) {
    console.error(
      '\nRefusing to run: this renumbers all candidates.id and candidates.candidate_ref.\n' +
        'Run: npx tsx scripts/renumber-candidate-ids-sequential.ts --yes\n',
    );
    process.exit(1);
  }

  console.warn('\n*** RENUNBERING CANDIDATES TO id=1..N, candidate_ref=CAND-1..N ***\n');

  const totalBefore = await prisma.candidate.count();

  await prisma.$transaction(async (tx) => {
    // Step 1: assign temporary IDs to avoid uniqueness collisions during remap.
    await tx.$executeRawUnsafe(`
      WITH ordered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
        FROM "candidates"
      )
      UPDATE "candidates" c
      SET
        id = 'TMP-CAND-' || o.rn::TEXT,
        candidate_ref = 'TMP-CAND-' || o.rn::TEXT
      FROM ordered o
      WHERE c.id = o.id
    `);

    // Step 2: final IDs in desired contiguous format.
    await tx.$executeRawUnsafe(`
      UPDATE "candidates"
      SET
        id = regexp_replace(id, '^TMP-CAND-', ''),
        candidate_ref = regexp_replace(candidate_ref, '^TMP-CAND-', 'CAND-')
      WHERE id LIKE 'TMP-CAND-%'
    `);
  });

  // Align generator sequence with highest assigned number.
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

  const check = await prisma.$queryRawUnsafe<Array<{ total: bigint; min_n: bigint; max_n: bigint; distinct_n: bigint }>>(`
    SELECT
      COUNT(*)::bigint AS total,
      COALESCE(MIN((regexp_replace(candidate_ref, '^CAND-', ''))::BIGINT), 0)::bigint AS min_n,
      COALESCE(MAX((regexp_replace(candidate_ref, '^CAND-', ''))::BIGINT), 0)::bigint AS max_n,
      COUNT(DISTINCT (regexp_replace(candidate_ref, '^CAND-', ''))::BIGINT)::bigint AS distinct_n
    FROM "candidates"
    WHERE candidate_ref ~ '^CAND-[0-9]+$'
  `);

  const first = await prisma.candidate.findMany({
    take: 5,
    orderBy: { createdAt: 'asc' },
    select: { id: true, candidateRef: true, name: true },
  });
  const last = await prisma.candidate.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: { id: true, candidateRef: true, name: true },
  });

  const c = check[0];
  console.log(`Total before: ${totalBefore}`);
  console.log(
    `Coverage check: total=${c?.total ?? 0}, min=${c?.min_n ?? 0}, max=${c?.max_n ?? 0}, distinct=${c?.distinct_n ?? 0}`,
  );
  console.log('\nFirst 5 by created_at:');
  for (const row of first) {
    console.log(`  id=${row.id}\tref=${row.candidateRef ?? '(none)'}\t${row.name}`);
  }
  console.log('\nLast 5 by created_at:');
  for (const row of last) {
    console.log(`  id=${row.id}\tref=${row.candidateRef ?? '(none)'}\t${row.name}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
