/**
 * Migrates existing users.id to user-### (global sequence) and updates all FK references dynamically.
 *
 * Usage:
 *   npx prisma db execute --file prisma/sql/ensure_user_id_generator.sql
 *   npx tsx scripts/migrate-user-ids-to-owner.ts --yes
 *
 * Notes:
 * - Uses the same dynamic FK update approach as the earlier SQL migration in prisma/migrations.
 * - Best run while backend is stopped.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const ok =
    process.argv.includes('--yes') ||
    process.argv.includes('-y') ||
    process.env.CONFIRM_MIGRATE_USER_IDS === 'true';

  if (!ok) {
    console.error(
      '\nRefusing to run: this rewrites users primary keys.\n' +
        'Run: npx tsx scripts/migrate-user-ids-to-owner.ts --yes\n',
    );
    process.exit(1);
  }

  console.warn('\n*** MIGRATING users.id -> user-### (updates all FKs) ***\n');

  await prisma.$transaction(async (tx) => {
    // Ensure generator exists and default is set (idempotent).
    await tx.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS global_user_code_seq AS BIGINT START 1 INCREMENT 1`,
    );
    await tx.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION generate_user_id()
      RETURNS TEXT
      LANGUAGE plpgsql
      AS $$
      DECLARE
        n BIGINT;
        w INT;
      BEGIN
        n := nextval('global_user_code_seq');
        w := GREATEST(3, length(n::TEXT));
        RETURN 'user-' || lpad(n::TEXT, w, '0');
      END;
      $$;
    `);
    await tx.$executeRawUnsafe(`ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT generate_user_id()`);

    // Build mapping for any non-user- ids (CUIDs, old USER-/OWNER-/usr-###, etc.)
    await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS "_user_id_map"`);
    await tx.$executeRawUnsafe(`
      CREATE TEMP TABLE "_user_id_map" AS
      SELECT u.id AS old_id, generate_user_id() AS new_id
      FROM "users" u
      WHERE u.id !~ '^user-[0-9]{3,}$'
      ORDER BY u."createdAt", u.id
    `);

    // Drop FK constraints that reference users.id (not deferrable in this schema).
    await tx.$executeRawUnsafe(`ALTER TABLE "submissions" DROP CONSTRAINT IF EXISTS "submissions_submitted_by_fkey"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "interviews" DROP CONSTRAINT IF EXISTS "interviews_recruiter_id_fkey"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "offer_letters" DROP CONSTRAINT IF EXISTS "offer_letters_released_by_id_fkey"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "requirement_activities" DROP CONSTRAINT IF EXISTS "requirement_activities_actor_id_fkey"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "requirement_assignments" DROP CONSTRAINT IF EXISTS "requirement_assignments_recruiter_id_fkey"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "requirement_assignments" DROP CONSTRAINT IF EXISTS "requirement_assignments_assigned_by_fkey"`);

    // Update FK columns explicitly (based on current schema.prisma).
    await tx.$executeRawUnsafe(`
      UPDATE "submissions" s
      SET "submitted_by" = m.new_id
      FROM "_user_id_map" m
      WHERE s."submitted_by" = m.old_id
    `);
    await tx.$executeRawUnsafe(`
      UPDATE "interviews" i
      SET "recruiter_id" = m.new_id
      FROM "_user_id_map" m
      WHERE i."recruiter_id" = m.old_id
    `);
    await tx.$executeRawUnsafe(`
      UPDATE "offer_letters" o
      SET "released_by_id" = m.new_id
      FROM "_user_id_map" m
      WHERE o."released_by_id" = m.old_id
    `);
    await tx.$executeRawUnsafe(`
      UPDATE "requirement_activities" a
      SET "actor_id" = m.new_id
      FROM "_user_id_map" m
      WHERE a."actor_id" = m.old_id
    `);
    await tx.$executeRawUnsafe(`
      UPDATE "requirement_assignments" ra
      SET "recruiter_id" = m.new_id
      FROM "_user_id_map" m
      WHERE ra."recruiter_id" = m.old_id
    `);
    await tx.$executeRawUnsafe(`
      UPDATE "requirement_assignments" ra
      SET "assigned_by" = m.new_id
      FROM "_user_id_map" m
      WHERE ra."assigned_by" = m.old_id
    `);

    // Update users.id itself.
    await tx.$executeRawUnsafe(`
      UPDATE "users" u
      SET "id" = m.new_id
      FROM "_user_id_map" m
      WHERE u.id = m.old_id
    `);

    // Recreate FK constraints referencing users.id with best-effort defaults.
    // Submissions / Interviews / Offer letters / Activities / Assignments
    await tx.$executeRawUnsafe(`
      ALTER TABLE "submissions"
      ADD CONSTRAINT "submissions_submitted_by_fkey"
      FOREIGN KEY ("submitted_by") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
    `);
    await tx.$executeRawUnsafe(`
      ALTER TABLE "interviews"
      ADD CONSTRAINT "interviews_recruiter_id_fkey"
      FOREIGN KEY ("recruiter_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    `);
    await tx.$executeRawUnsafe(`
      ALTER TABLE "offer_letters"
      ADD CONSTRAINT "offer_letters_released_by_id_fkey"
      FOREIGN KEY ("released_by_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
    `);
    await tx.$executeRawUnsafe(`
      ALTER TABLE "requirement_activities"
      ADD CONSTRAINT "requirement_activities_actor_id_fkey"
      FOREIGN KEY ("actor_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
    `);
    await tx.$executeRawUnsafe(`
      ALTER TABLE "requirement_assignments"
      ADD CONSTRAINT "requirement_assignments_recruiter_id_fkey"
      FOREIGN KEY ("recruiter_id") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
    `);
    await tx.$executeRawUnsafe(`
      ALTER TABLE "requirement_assignments"
      ADD CONSTRAINT "requirement_assignments_assigned_by_fkey"
      FOREIGN KEY ("assigned_by") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
    `);
  });

  console.log('\nDone. users.id is now user-###.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

