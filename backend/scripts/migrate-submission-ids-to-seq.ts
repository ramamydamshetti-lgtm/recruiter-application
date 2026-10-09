/**
 * Migrates `submissions.id` from CUIDs to sequential `SUB-001`, `SUB-002`, ...
 * Updates FKs on interviews and offer_letters. Backfills empty text fields from candidates/requirements.
 *
 * Usage:
 *   npx prisma db execute --file prisma/sql/ensure_submission_pk_generator.sql
 *   npx tsx scripts/migrate-submission-ids-to-seq.ts --yes
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const ok =
    process.argv.includes('--yes') ||
    process.argv.includes('-y') ||
    process.env.CONFIRM_MIGRATE_SUBMISSION_IDS === 'true';

  if (!ok) {
    console.error(
      '\nRefusing: rewrites submissions primary keys.\n' +
        'Run: npx tsx scripts/migrate-submission-ids-to-seq.ts --yes\n',
    );
    process.exit(1);
  }

  console.warn('\n*** MIGRATING submissions.id -> SUB-### ***\n');

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS global_submission_pk_seq AS BIGINT START 1 INCREMENT 1`,
    );
    await tx.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION generate_submission_pk()
      RETURNS TEXT
      LANGUAGE plpgsql
      AS $$
      DECLARE
        n BIGINT;
        w INT;
      BEGIN
        n := nextval('global_submission_pk_seq');
        w := GREATEST(3, length(n::TEXT));
        RETURN 'SUB-' || lpad(n::TEXT, w, '0');
      END;
      $$;
    `);
    await tx.$executeRawUnsafe(
      `ALTER TABLE "submissions" ALTER COLUMN "id" SET DEFAULT generate_submission_pk()`,
    );

    await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS "_submission_id_map"`);
    await tx.$executeRawUnsafe(`
      CREATE TEMP TABLE "_submission_id_map" AS
      SELECT s.id AS old_id, generate_submission_pk() AS new_id
      FROM "submissions" s
      WHERE s.id !~ '^SUB-[0-9]{3,}$'
      ORDER BY s.submitted_on, s.id
    `);

    await tx.$executeRawUnsafe(
      `ALTER TABLE "interviews" DROP CONSTRAINT IF EXISTS "interviews_submission_id_fkey"`,
    );
    await tx.$executeRawUnsafe(
      `ALTER TABLE "offer_letters" DROP CONSTRAINT IF EXISTS "offer_letters_submission_id_fkey"`,
    );

    await tx.$executeRawUnsafe(`
      UPDATE "interviews" i
      SET "submission_id" = m.new_id
      FROM "_submission_id_map" m
      WHERE i."submission_id" = m.old_id
    `);
    await tx.$executeRawUnsafe(`
      UPDATE "offer_letters" o
      SET "submission_id" = m.new_id
      FROM "_submission_id_map" m
      WHERE o."submission_id" = m.old_id
    `);

    await tx.$executeRawUnsafe(`
      UPDATE "submissions" s
      SET "id" = m.new_id
      FROM "_submission_id_map" m
      WHERE s.id = m.old_id
    `);

    await tx.$executeRawUnsafe(`
      ALTER TABLE "interviews"
      ADD CONSTRAINT "interviews_submission_id_fkey"
      FOREIGN KEY ("submission_id") REFERENCES "submissions"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    `);
    await tx.$executeRawUnsafe(`
      ALTER TABLE "offer_letters"
      ADD CONSTRAINT "offer_letters_submission_id_fkey"
      FOREIGN KEY ("submission_id") REFERENCES "submissions"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    `);

    // Mirror public ref; backfill text fields from candidate / requirement.
    await tx.$executeRawUnsafe(`
      UPDATE "submissions" s
      SET "submission_ref" = s.id
      WHERE "submission_ref" IS NULL OR "submission_ref" <> s.id
    `);
    await tx.$executeRawUnsafe(`
      UPDATE "submissions" s
      SET
        "reason_for_job_change" = COALESCE(NULLIF(TRIM(s."reason_for_job_change"), ''), NULLIF(TRIM(c."reason_for_job_change"), ''), 'Not specified'),
        "offer_in_hand" = COALESCE(NULLIF(TRIM(s."offer_in_hand"), ''), NULLIF(TRIM(c."offer_in_hand"), ''), 'No'),
        "offer_in_hand_amount" = COALESCE(NULLIF(TRIM(s."offer_in_hand_amount"), ''), NULLIF(TRIM(c."offer_in_hand_amount"), ''), '—'),
        "offer_in_hand_company" = COALESCE(NULLIF(TRIM(s."offer_in_hand_company"), ''), NULLIF(TRIM(c."offer_in_hand_company"), ''), '—'),
        "relevant_experience" = COALESCE(NULLIF(TRIM(s."relevant_experience"), ''), NULLIF(TRIM(c."relevant_experience"), ''), NULLIF(TRIM(c."experience_label"), ''), 'Not specified'),
        "so_number" = COALESCE(NULLIF(TRIM(s."so_number"), ''), NULLIF(TRIM(r."client_jd_id"), ''), NULLIF(TRIM(r."requirement_id"), ''), '—'),
        "interview_location" = COALESCE(NULLIF(TRIM(s."interview_location"), ''), NULLIF(TRIM(r."location"), ''), 'Not specified'),
        "client_feedback" = COALESCE(NULLIF(TRIM(s."client_feedback"), ''), 'Pending'),
        "rejection_reason" = COALESCE(NULLIF(TRIM(s."rejection_reason"), ''), '—'),
        "interview_type" = COALESCE(s."interview_type", 'PHONE'::"InterviewType")
      FROM "candidates" c, "requirements" r
      WHERE s."candidate_id" = c.id AND s."requirement_id" = r.id
    `);
  });

  const cnt = await prisma.submission.count();
  console.log(`\nDone. ${cnt} submission(s). Run: npx tsx scripts/reset-id-sequences.ts\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
