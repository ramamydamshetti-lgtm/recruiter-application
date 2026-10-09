/**
 * Migrates `requirements.id` from CUIDs to sequential `REQ-001`, `REQ-002`, ...
 * Updates all FK references (submissions, requirement_assignments, requirement_activities).
 *
 * Usage:
 *   npx prisma db execute --file prisma/sql/ensure_requirement_pk_generator.sql
 *   npx tsx scripts/migrate-requirement-ids-to-seq.ts --yes
 *
 * Note:
 * - This is irreversible without a backup.
 * - Best run when backend is stopped (to avoid race conditions).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const ok =
    process.argv.includes('--yes') ||
    process.argv.includes('-y') ||
    process.env.CONFIRM_MIGRATE_REQUIREMENT_IDS === 'true';

  if (!ok) {
    console.error(
      '\nRefusing to run: this rewrites requirements primary keys.\n' +
        'Run: npx tsx scripts/migrate-requirement-ids-to-seq.ts --yes\n',
    );
    process.exit(1);
  }

  console.warn('\n*** MIGRATING requirements.id -> REQ-### (updates FKs) ***\n');

  await prisma.$transaction(async (tx) => {
    // Ensure generator exists and default is set.
    await tx.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS global_requirement_pk_seq AS BIGINT START 1 INCREMENT 1`,
    );
    await tx.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION generate_requirement_pk()
      RETURNS TEXT
      LANGUAGE plpgsql
      AS $$
      DECLARE
        n BIGINT;
        w INT;
      BEGIN
        n := nextval('global_requirement_pk_seq');
        w := GREATEST(3, length(n::TEXT));
        RETURN 'REQ-' || lpad(n::TEXT, w, '0');
      END;
      $$;
    `);
    await tx.$executeRawUnsafe(
      `ALTER TABLE "requirements" ALTER COLUMN "id" SET DEFAULT generate_requirement_pk()`,
    );

    // Create mapping table in a deterministic order (created_at then id).
    await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS "_requirement_id_map"`);
    await tx.$executeRawUnsafe(`
      CREATE TEMP TABLE "_requirement_id_map" AS
      SELECT r.id AS old_id, generate_requirement_pk() AS new_id
      FROM "requirements" r
      WHERE r.id !~ '^REQ-[0-9]{3,}$'
      ORDER BY r.created_at, r.id
    `);

    // When changing a primary key, we must temporarily drop FK constraints
    // because these constraints are typically NOT DEFERRABLE in this schema.
    await tx.$executeRawUnsafe(
      `ALTER TABLE "requirement_activities" DROP CONSTRAINT IF EXISTS "requirement_activities_requirement_id_fkey"`,
    );
    await tx.$executeRawUnsafe(
      `ALTER TABLE "requirement_assignments" DROP CONSTRAINT IF EXISTS "requirement_assignments_requirement_id_fkey"`,
    );
    await tx.$executeRawUnsafe(
      `ALTER TABLE "submissions" DROP CONSTRAINT IF EXISTS "submissions_requirement_id_fkey"`,
    );
    await tx.$executeRawUnsafe(`
      UPDATE "submissions" s
      SET "requirement_id" = m.new_id
      FROM "_requirement_id_map" m
      WHERE s."requirement_id" = m.old_id
    `);
    await tx.$executeRawUnsafe(`
      UPDATE "requirement_assignments" ra
      SET "requirement_id" = m.new_id
      FROM "_requirement_id_map" m
      WHERE ra."requirement_id" = m.old_id
    `);
    await tx.$executeRawUnsafe(`
      UPDATE "requirement_activities" act
      SET "requirement_id" = m.new_id
      FROM "_requirement_id_map" m
      WHERE act."requirement_id" = m.old_id
    `);

    // Finally update the PK values themselves.
    await tx.$executeRawUnsafe(`
      UPDATE "requirements" r
      SET "id" = m.new_id
      FROM "_requirement_id_map" m
      WHERE r.id = m.old_id
    `);

    // Recreate FK constraints.
    await tx.$executeRawUnsafe(`
      ALTER TABLE "submissions"
      ADD CONSTRAINT "submissions_requirement_id_fkey"
      FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    `);
    await tx.$executeRawUnsafe(`
      ALTER TABLE "requirement_assignments"
      ADD CONSTRAINT "requirement_assignments_requirement_id_fkey"
      FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    `);
    await tx.$executeRawUnsafe(`
      ALTER TABLE "requirement_activities"
      ADD CONSTRAINT "requirement_activities_requirement_id_fkey"
      FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    `);
  });

  console.log('\nDone. requirements.id is now REQ-###.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

