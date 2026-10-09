import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const emails = ['harish.g@metaforgeit.com', 'saiteja.p@metaforgeit.com', 'raj.mj@metaforgeit.com'];

async function main() {
  const users = await prisma.user.findMany({ where: { email: { in: emails, mode: 'insensitive' } } });
  const userIds = users.map((u) => u.id);

  const assigns = await prisma.requirementAssignment.findMany({
    where: { recruiterId: { in: userIds } },
    include: { requirement: { select: { requirementId: true, roleTitle: true } } },
  });
  console.log('Assignments:', assigns.length);
  assigns.forEach((a) => console.log(a));

  const juneSubs = await prisma.submission.findMany({
    where: {
      submittedOn: { gte: new Date('2026-06-01') },
      OR: [{ submittedBy: { in: userIds } }, { forwardedBy: { in: userIds } }],
    },
    include: {
      submitter: { select: { email: true } },
      requirement: { select: { requirementId: true } },
    },
  });
  console.log('\nJune 2026 subs by them:', juneSubs.length);

  const juneActs = await prisma.requirementActivity.findMany({
    where: { createdAt: { gte: new Date('2026-06-01') } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const theirJuneActs = juneActs.filter(
    (a) =>
      (a.actorId && userIds.includes(a.actorId)) ||
      /Harish Gadipally|Saiteja Puttapaka|Raj Mahendra/i.test(a.summary),
  );
  console.log('\nJune 2026 activities mentioning them (last 100 scan):', theirJuneActs.length);
  theirJuneActs.forEach((a) => console.log(a.createdAt, a.action, a.summary));
}

main().finally(() => prisma.$disconnect());
