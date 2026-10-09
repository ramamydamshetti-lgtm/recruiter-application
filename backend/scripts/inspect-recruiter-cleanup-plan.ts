import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const emails = ['harish.g@metaforgeit.com', 'saiteja.p@metaforgeit.com', 'raj.mj@metaforgeit.com'];

function recruiterActivityPatterns(fullName: string): RegExp[] {
  const escaped = fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [
    new RegExp(`^${escaped} submitted `, 'i'),
    new RegExp(`^${escaped} forwarded `, 'i'),
    new RegExp(`^Requirement assigned to ${escaped}$`, 'i'),
    new RegExp(`^${escaped} is already assigned`, 'i'),
    new RegExp(`^${escaped} resigned`, 'i'),
    new RegExp(`^${escaped} revoked`, 'i'),
  ];
}

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { in: emails, mode: 'insensitive' } },
  });
  const userIds = users.map((u) => u.id);
  const patterns = users.flatMap((u) => recruiterActivityPatterns(`${u.firstName} ${u.lastName}`));

  const allActivities = await prisma.requirementActivity.findMany({
    select: { id: true, actorId: true, action: true, summary: true, requirementId: true },
  });

  const activityIds = allActivities
    .filter(
      (a) =>
        (a.actorId && userIds.includes(a.actorId)) ||
        patterns.some((p) => p.test(a.summary.trim())),
    )
    .map((a) => a.id);

  const subs = await prisma.submission.findMany({
    where: { OR: [{ submittedBy: { in: userIds } }, { forwardedBy: { in: userIds } }] },
    select: { id: true, requirementId: true, submissionRef: true },
  });

  console.log('Activities to delete:', activityIds.length);
  console.log('Submissions to delete:', subs.length);

  const recent = allActivities
    .filter(
      (a) =>
        (a.actorId && userIds.includes(a.actorId)) ||
        patterns.some((p) => p.test(a.summary.trim())),
    )
    .slice(-30);
  console.log('\nSample activities targeted:');
  recent.forEach((a) => console.log(a.id, a.action, a.summary));
}

main().finally(() => prisma.$disconnect());
