/**
 * Renumbers every user to user-001, user-002, ... in stable order (createdAt, then id).
 * Two-phase temp ids avoid PK collisions while rewriting users.id and all FKs.
 *
 * Usage (stop API first):
 *   npx tsx scripts/renumber-users-sequential.ts --yes
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function sqlStringLiteral(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

function finalUserId(n: number): string {
  const w = Math.max(3, String(n).length);
  return `user-${String(n).padStart(w, '0')}`;
}

async function main() {
  const ok =
    process.argv.includes('--yes') ||
    process.argv.includes('-y') ||
    process.env.CONFIRM_RENUMBER_USERS === 'true';

  if (!ok) {
    console.error(
      '\nRefusing: rewrites all users.id to user-001, user-002, ...\n' +
        'Run: npx tsx scripts/renumber-users-sequential.ts --yes\n',
    );
    process.exit(1);
  }

  const users = await prisma.user.findMany({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, createdAt: true },
  });

  if (users.length === 0) {
    console.log('No users to renumber.');
    return;
  }

  const rows = users.map((u, i) => ({
    old_id: u.id,
    tmp_id: `__TMPUSER${String(i).padStart(8, '0')}__`,
    final_id: finalUserId(i + 1),
  }));

  console.warn(
    `\n*** Renumbering ${rows.length} user(s) -> user-001 .. user-${String(rows.length).padStart(Math.max(3, String(rows.length).length), '0')} ***\n`,
  );

  const valueTuples = rows
    .map((r) => `(${sqlStringLiteral(r.old_id)}, ${sqlStringLiteral(r.tmp_id)}, ${sqlStringLiteral(r.final_id)})`)
    .join(',\n');

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`
      CREATE TEMP TABLE _renum (old_id TEXT PRIMARY KEY, tmp_id TEXT NOT NULL UNIQUE, final_id TEXT NOT NULL UNIQUE)
    `);
    await tx.$executeRawUnsafe(`INSERT INTO _renum (old_id, tmp_id, final_id) VALUES ${valueTuples}`);

    await tx.$executeRawUnsafe(`ALTER TABLE "submissions" DROP CONSTRAINT IF EXISTS "submissions_submitted_by_fkey"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "interviews" DROP CONSTRAINT IF EXISTS "interviews_recruiter_id_fkey"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "offer_letters" DROP CONSTRAINT IF EXISTS "offer_letters_released_by_id_fkey"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "requirement_activities" DROP CONSTRAINT IF EXISTS "requirement_activities_actor_id_fkey"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "requirement_assignments" DROP CONSTRAINT IF EXISTS "requirement_assignments_recruiter_id_fkey"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "requirement_assignments" DROP CONSTRAINT IF EXISTS "requirement_assignments_assigned_by_fkey"`);

    const fkCols: [string, string][] = [
      ['submissions', 'submitted_by'],
      ['interviews', 'recruiter_id'],
      ['offer_letters', 'released_by_id'],
      ['requirement_activities', 'actor_id'],
      ['requirement_assignments', 'recruiter_id'],
      ['requirement_assignments', 'assigned_by'],
    ];

    for (const [table, col] of fkCols) {
      await tx.$executeRawUnsafe(`
        UPDATE "${table}" t
        SET "${col}" = m.tmp_id
        FROM _renum m
        WHERE t."${col}" = m.old_id
      `);
    }

    await tx.$executeRawUnsafe(`
      UPDATE "users" u
      SET "id" = m.tmp_id
      FROM _renum m
      WHERE u.id = m.old_id
    `);

    for (const [table, col] of fkCols) {
      await tx.$executeRawUnsafe(`
        UPDATE "${table}" t
        SET "${col}" = m.final_id
        FROM _renum m
        WHERE t."${col}" = m.tmp_id
      `);
    }

    await tx.$executeRawUnsafe(`
      UPDATE "users" u
      SET "id" = m.final_id
      FROM _renum m
      WHERE u.id = m.tmp_id
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

    const nextSeq = rows.length + 1;
    await tx.$executeRawUnsafe(`SELECT setval('global_user_code_seq', ${nextSeq}, false)`);
  });

  console.log('\nDone. Users are now user-001 … in createdAt order. Log in again (JWTs are stale).\n');
  console.log('Map:', rows.map((r) => `${r.old_id} -> ${r.final_id}`).join(', '));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
