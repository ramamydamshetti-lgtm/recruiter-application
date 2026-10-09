import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Removes integration/test users and their dependent recruiter/candidate profile data.
 *
 * Usage:
 *   cd backend
 *   npx tsx scripts/remove-test-users.ts
 */
const EMAIL_PREFIXES = ['integration.test.recruiter', 'avatar.integration'] as const;

async function main() {
  const users = await prisma.user.findMany({
    where: {
      OR: EMAIL_PREFIXES.map((p) => ({ email: { startsWith: p } })),
    },
    select: { id: true, email: true, role: true },
  });

  console.log('🔎 Found test users:', users.length);
  if (users.length) console.log(users.map((u) => `${u.email} (${u.role})`).join('\n'));

  if (users.length === 0) return;

  const userIds = users.map((u) => u.id);

  // Delete in dependency order.
  await prisma.$transaction(async (tx) => {
    // 1) Remove references in requirements (ownerId, assignedBy, assignedRecruiters[])
    // - ownerId is a FK relation, so must be nulled before deleting user.
    await tx.requirement.updateMany({
      where: { ownerId: { in: userIds } },
      data: { ownerId: null },
    });
    await tx.requirement.updateMany({
      where: { assignedBy: { in: userIds } },
      data: { assignedBy: null },
    });

    // assignedRecruiters is a string[] of userIds. Remove deleted ids.
    const reqsWithAssignments = await tx.requirement.findMany({
      where: {
        assignedRecruiters: { hasSome: userIds },
      },
      select: { id: true, assignedRecruiters: true },
    });
    for (const r of reqsWithAssignments) {
      const next = (r.assignedRecruiters || []).filter((id) => !userIds.includes(id));
      await tx.requirement.update({
        where: { id: r.id },
        data: { assignedRecruiters: next },
      });
    }

    // 2) Remove requirement assignments that reference these users
    await tx.requirementAssignment.deleteMany({
      where: {
        OR: [{ recruiterId: { in: userIds } }, { assignedBy: { in: userIds } }],
      },
    });

    // 3) Remove submissions created by these users (submitter FK)
    await tx.submission.deleteMany({ where: { submittedBy: { in: userIds } } });

    // Finally delete users
    const r = await tx.user.deleteMany({ where: { id: { in: userIds } } });
    console.log('🗑️  Deleted users:', r.count);
  });
}

main()
  .catch((e) => {
    console.error('❌ remove-test-users failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

