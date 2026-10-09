/**
 * Rewrites primary keys to sequential public ids:
 *   requirement_assignments -> req_ass-001, ...
 *   requirement_activities  -> req_act-001, ...
 *   offer_letters           -> off-001, ...
 *   interviews              -> int-001, ...
 *
 * No other tables FK these ids (only submission_id etc.), so updates are in-place.
 *
 * Usage:
 *   npx tsx scripts/migrate-aux-entity-ids-to-seq.ts --yes
 *   npx tsx scripts/reset-id-sequences.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const ok =
    process.argv.includes('--yes') ||
    process.argv.includes('-y') ||
    process.env.CONFIRM_MIGRATE_AUX_ENTITY_IDS === 'true';

  if (!ok) {
    console.error(
      '\nRefusing: rewrites primary keys on requirement_assignments, requirement_activities, offer_letters, interviews.\n' +
        'Run: npx tsx scripts/migrate-aux-entity-ids-to-seq.ts --yes\n',
    );
    process.exit(1);
  }

  console.warn('\n*** MIGRATING aux entity ids -> req_ass-### / req_act-### / off-### / int-### ***\n');

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS global_requirement_assignment_pk_seq AS BIGINT START 1 INCREMENT 1`,
    );
    await tx.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION generate_requirement_assignment_pk()
      RETURNS TEXT LANGUAGE plpgsql AS $$
      DECLARE n BIGINT; w INT;
      BEGIN
        n := nextval('global_requirement_assignment_pk_seq');
        w := GREATEST(3, length(n::TEXT));
        RETURN 'req_ass-' || lpad(n::TEXT, w, '0');
      END; $$;
    `);
    await tx.$executeRawUnsafe(
      `ALTER TABLE "requirement_assignments" ALTER COLUMN "id" SET DEFAULT generate_requirement_assignment_pk()`,
    );

    await tx.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS global_requirement_activity_pk_seq AS BIGINT START 1 INCREMENT 1`,
    );
    await tx.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION generate_requirement_activity_pk()
      RETURNS TEXT LANGUAGE plpgsql AS $$
      DECLARE n BIGINT; w INT;
      BEGIN
        n := nextval('global_requirement_activity_pk_seq');
        w := GREATEST(3, length(n::TEXT));
        RETURN 'req_act-' || lpad(n::TEXT, w, '0');
      END; $$;
    `);
    await tx.$executeRawUnsafe(
      `ALTER TABLE "requirement_activities" ALTER COLUMN "id" SET DEFAULT generate_requirement_activity_pk()`,
    );

    await tx.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS global_offer_letter_pk_seq AS BIGINT START 1 INCREMENT 1`,
    );
    await tx.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION generate_offer_letter_pk()
      RETURNS TEXT LANGUAGE plpgsql AS $$
      DECLARE n BIGINT; w INT;
      BEGIN
        n := nextval('global_offer_letter_pk_seq');
        w := GREATEST(3, length(n::TEXT));
        RETURN 'off-' || lpad(n::TEXT, w, '0');
      END; $$;
    `);
    await tx.$executeRawUnsafe(
      `ALTER TABLE "offer_letters" ALTER COLUMN "id" SET DEFAULT generate_offer_letter_pk()`,
    );

    await tx.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS global_interview_pk_seq AS BIGINT START 1 INCREMENT 1`,
    );
    await tx.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION generate_interview_pk()
      RETURNS TEXT LANGUAGE plpgsql AS $$
      DECLARE n BIGINT; w INT;
      BEGIN
        n := nextval('global_interview_pk_seq');
        w := GREATEST(3, length(n::TEXT));
        RETURN 'int-' || lpad(n::TEXT, w, '0');
      END; $$;
    `);
    await tx.$executeRawUnsafe(
      `ALTER TABLE "interviews" ALTER COLUMN "id" SET DEFAULT generate_interview_pk()`,
    );

    await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS "_req_ass_id_map"`);
    await tx.$executeRawUnsafe(`
      CREATE TEMP TABLE "_req_ass_id_map" AS
      SELECT a.id AS old_id, generate_requirement_assignment_pk() AS new_id
      FROM "requirement_assignments" a
      WHERE a.id !~ '^req_ass-[0-9]{3,}$'
      ORDER BY a.assigned_on, a.id
    `);
    await tx.$executeRawUnsafe(`
      UPDATE "requirement_assignments" t
      SET id = m.new_id
      FROM "_req_ass_id_map" m
      WHERE t.id = m.old_id
    `);

    await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS "_req_act_id_map"`);
    await tx.$executeRawUnsafe(`
      CREATE TEMP TABLE "_req_act_id_map" AS
      SELECT a.id AS old_id, generate_requirement_activity_pk() AS new_id
      FROM "requirement_activities" a
      WHERE a.id !~ '^req_act-[0-9]{3,}$'
      ORDER BY a.created_at, a.id
    `);
    await tx.$executeRawUnsafe(`
      UPDATE "requirement_activities" t
      SET id = m.new_id
      FROM "_req_act_id_map" m
      WHERE t.id = m.old_id
    `);

    await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS "_off_id_map"`);
    await tx.$executeRawUnsafe(`
      CREATE TEMP TABLE "_off_id_map" AS
      SELECT o.id AS old_id, generate_offer_letter_pk() AS new_id
      FROM "offer_letters" o
      WHERE o.id !~ '^off-[0-9]{3,}$'
      ORDER BY o.created_at, o.id
    `);
    await tx.$executeRawUnsafe(`
      UPDATE "offer_letters" t
      SET id = m.new_id
      FROM "_off_id_map" m
      WHERE t.id = m.old_id
    `);

    await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS "_int_id_map"`);
    await tx.$executeRawUnsafe(`
      CREATE TEMP TABLE "_int_id_map" AS
      SELECT i.id AS old_id, generate_interview_pk() AS new_id
      FROM "interviews" i
      WHERE i.id !~ '^int-[0-9]{3,}$'
      ORDER BY i.scheduled_at, i.created_at, i.id
    `);
    await tx.$executeRawUnsafe(`
      UPDATE "interviews" t
      SET id = m.new_id
      FROM "_int_id_map" m
      WHERE t.id = m.old_id
    `);
  });

  console.log('\nDone. Run: npx prisma generate && npx tsx scripts/reset-id-sequences.ts\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
