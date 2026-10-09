import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Emails and/or user ids to remove (edit before run). */
const TARGET_EMAILS: string[] = ['sumanth.c@metaforgeit.com'];
const TARGET_USER_IDS: string[] = ['user-001'];

async function deleteUsersByIds(userIds: string[]) {
  if (userIds.length === 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.requirementAssignment.deleteMany({
      where: { OR: [{ recruiterId: { in: userIds } }, { assignedBy: { in: userIds } }] },
    });
    await tx.interview.deleteMany({ where: { recruiterId: { in: userIds } } });
    await tx.submission.deleteMany({ where: { submittedBy: { in: userIds } } });
    const deleted = await tx.user.deleteMany({ where: { id: { in: userIds } } });
    console.log('Deleted users:', deleted.count);
  });
}

async function main() {
  const byEmail = TARGET_EMAILS.length
    ? await prisma.user.findMany({
        where: {
          OR: TARGET_EMAILS.map((email) => ({ email: { equals: email, mode: 'insensitive' as const } })),
        },
        select: { id: true, email: true },
      })
    : [];

  const byId = TARGET_USER_IDS.length
    ? await prisma.user.findMany({
        where: { id: { in: TARGET_USER_IDS } },
        select: { id: true, email: true },
      })
    : [];

  const seen = new Set<string>();
  const users = [...byEmail, ...byId].filter((u) => {
    if (seen.has(u.id)) return false;
    seen.add(u.id);
    return true;
  });

  console.log('Targets:');
  for (const u of users) {
    console.log(`  - ${u.id} ${u.email || '(no email)'}`);
  }

  if (users.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  await deleteUsersByIds(users.map((u) => u.id));
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error('delete-users-by-email failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
