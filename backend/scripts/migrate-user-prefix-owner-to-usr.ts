/**
 * Renames users.id from OWNER-### / USER-### / usr-### to user-### (same numeric suffix) and updates all FKs.
 *
 * Usage (stop API first):
 *   npx prisma db execute --file prisma/sql/ensure_user_id_generator.sql
 *   npx tsx scripts/migrate-user-prefix-owner-to-usr.ts --yes
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const ok =
    process.argv.includes('--yes') ||
    process.argv.includes('-y') ||
    process.env.CONFIRM_MIGRATE_USER_PREFIX === 'true';

  if (!ok) {
    console.error(
      '\nRefusing to run: this rewrites users.id prefixes.\n' +
        'Run: npx tsx scripts/migrate-user-prefix-owner-to-usr.ts --yes\n',
    );
    process.exit(1);
  }

  console.warn('\n*** Renaming OWNER-/USER-/usr- -> user- (same suffix; updates all FKs) ***\n');

  await prisma.$transaction(async (tx) => {
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

    await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS "_user_prefix_map"`);
    await tx.$executeRawUnsafe(`
      CREATE TEMP TABLE "_user_prefix_map" AS
      SELECT
        u.id AS old_id,
        'user-' || (regexp_match(u.id, '-([0-9]+)$'))[1] AS new_id
      FROM "users" u
      WHERE u.id ~* '^(OWNER|USER|usr)-[0-9]+$'
    `);

    const dupTargets = await tx.$queryRawUnsafe<Array<{ new_id: string; ct: bigint }>>(`
      SELECT new_id, COUNT(*)::bigint AS ct
      FROM "_user_prefix_map"
      GROUP BY new_id
      HAVING COUNT(*) > 1
    `);
    if (dupTargets.length > 0) {
      throw new Error(
        `Cannot migrate: multiple users map to the same user- id: ${JSON.stringify(dupTargets)}`,
      );
    }

    const conflicts = await tx.$queryRawUnsafe<Array<{ old_id: string; new_id: string }>>(`
      SELECT m.old_id, m.new_id
      FROM "_user_prefix_map" m
      INNER JOIN "users" u ON u.id = m.new_id AND u.id <> m.old_id
    `);
    if (conflicts.length > 0) {
      throw new Error(
        `Cannot migrate: target user- id already taken by another user: ${JSON.stringify(conflicts.slice(0, 5))}`,
      );
    }

    await tx.$executeRawUnsafe(`ALTER TABLE "submissions" DROP CONSTRAINT IF EXISTS "submissions_submitted_by_fkey"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "interviews" DROP CONSTRAINT IF EXISTS "interviews_recruiter_id_fkey"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "offer_letters" DROP CONSTRAINT IF EXISTS "offer_letters_released_by_id_fkey"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "requirement_activities" DROP CONSTRAINT IF EXISTS "requirement_activities_actor_id_fkey"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "requirement_assignments" DROP CONSTRAINT IF EXISTS "requirement_assignments_recruiter_id_fkey"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "requirement_assignments" DROP CONSTRAINT IF EXISTS "requirement_assignments_assigned_by_fkey"`);

    const fkUpdates: [string, string][] = [
      ['submissions', 'submitted_by'],
      ['interviews', 'recruiter_id'],
      ['offer_letters', 'released_by_id'],
      ['requirement_activities', 'actor_id'],
      ['requirement_assignments', 'recruiter_id'],
      ['requirement_assignments', 'assigned_by'],
    ];
    for (const [table, col] of fkUpdates) {
      await tx.$executeRawUnsafe(`
        UPDATE "${table}" t
        SET "${col}" = m.new_id
        FROM "_user_prefix_map" m
        WHERE t."${col}" = m.old_id
      `);
    }

    await tx.$executeRawUnsafe(`
      UPDATE "users" u
      SET "id" = m.new_id
      FROM "_user_prefix_map" m
      WHERE u.id = m.old_id
    `);

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

  console.log('\nDone. users.id uses user-###.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
