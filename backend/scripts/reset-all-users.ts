/**
 * Deletes ALL users and resets the global user id sequence (next: user-001).
 * Removes or nulls dependent rows that reference users (submissions, interviews, assignments, etc.).
 *
 * Usage:
 *   npx tsx scripts/reset-all-users.ts --yes
 *
 * Before registering again, ensure the DB generator exists:
 *   npx prisma db execute --file prisma/sql/ensure_user_id_generator.sql
 *
 * New registrations get user-001, user-002, ... (sequence reset to 1 below).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const ok =
    process.argv.includes('--yes') ||
    process.argv.includes('-y') ||
    process.env.CONFIRM_RESET_USERS === 'true';

  if (!ok) {
    console.error(
      '\nRefusing to run: this deletes every user and related assignment/submission data.\n' +
        'Run:  npx tsx scripts/reset-all-users.ts --yes\n',
    );
    process.exit(1);
  }

  console.warn('\n*** RESET USERS: deleting user-linked rows, then all users ***\n');

  const counts = await prisma.$transaction(async (tx) => {
    const act = await tx.requirementActivity.deleteMany({});
    const ra = await tx.requirementAssignment.deleteMany({});
    const iv = await tx.interview.deleteMany({});
    const ol = await tx.offerLetter.deleteMany({});
    const sub = await tx.submission.deleteMany({});

    const req = await tx.requirement.updateMany({
      data: {
        assignment: 'UNASSIGNED',
        requirementCreatorName: null,
        assignedToRecruiterName: null,
        assignmentAssignerName: null,
      },
    });

    const users = await tx.user.deleteMany({});

    try {
      await tx.$executeRawUnsafe(`SELECT setval('global_user_code_seq', 1, false)`);
    } catch {
      console.warn(
        'Could not reset global_user_code_seq (run: npx prisma db execute --file prisma/sql/ensure_user_id_generator.sql)',
      );
    }

    return {
      requirementActivities: act.count,
      requirementAssignments: ra.count,
      interviews: iv.count,
      offerLetters: ol.count,
      submissions: sub.count,
      requirementsOwnerCleared: req.count,
      usersDeleted: users.count,
    };
  });

  console.log('Done:', counts);
  console.log(
    '\nRegister new users via POST /api/auth/register — ids will be user-001, user-002, ...\n' +
      'If registration errors on generate_user_id, run:\n' +
      '  npx prisma db execute --file prisma/sql/ensure_user_id_generator.sql\n',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
