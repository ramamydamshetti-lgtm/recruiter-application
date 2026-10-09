import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const emails = ['harish.g@metaforgeit.com', 'saiteja.p@metaforgeit.com', 'raj.mj@metaforgeit.com'];

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { in: emails, mode: 'insensitive' } },
  });
  const userIds = users.map((u) => u.id);
  console.log('Users:', users.map((u) => `${u.email} (${u.id})`));

  const createdCandidates = await prisma.candidate.findMany({
    where: { createdById: { in: userIds } },
    select: { id: true, name: true, email: true, candidateRef: true, createdAt: true },
  });
  console.log('\nCandidates created by them:', createdCandidates.length);
  createdCandidates.forEach((c) => console.log(c));

  const subsByCreatedCandidate = await prisma.submission.findMany({
    where: { candidate: { createdById: { in: userIds } } },
    include: {
      submitter: { select: { email: true } },
      requirement: { select: { requirementId: true, roleTitle: true } },
      candidate: { select: { email: true, createdById: true } },
    },
  });
  console.log('\nSubmissions for candidates they created:', subsByCreatedCandidate.length);
  subsByCreatedCandidate.forEach((s) =>
    console.log({
      id: s.id,
      ref: s.submissionRef,
      submitter: s.submitter.email,
      req: s.requirement.requirementId,
      candidate: s.candidate.email,
      status: s.status,
    }),
  );

  const allSubs = await prisma.submission.findMany({
    take: 20,
    orderBy: { submittedOn: 'desc' },
    include: {
      submitter: { select: { email: true } },
      requirement: { select: { requirementId: true } },
      candidate: { select: { email: true } },
    },
  });
  console.log('\nLatest 20 submissions in DB:');
  allSubs.forEach((s) =>
    console.log(s.id, s.submitter.email, s.requirement.requirementId, s.candidate.email, s.status),
  );

  const activities = await prisma.requirementActivity.findMany({
    take: 30,
    orderBy: { createdAt: 'desc' },
    include: { requirement: { select: { requirementId: true } } },
  });
  console.log('\nLatest 30 requirement activities:');
  activities.forEach((a) =>
    console.log(a.id, a.actorId, a.action, a.summary?.slice(0, 60), a.requirement?.requirementId),
  );

  const comms = await prisma.communicationLog.findMany({
    where: {
      OR: userIds.flatMap((id) => [
        { recipient: { contains: 'harish', mode: 'insensitive' as const } },
      ]),
    },
    take: 5,
  });

  const reqsWithTheirName = await prisma.requirement.findMany({
    where: {
      OR: [
        { assignedToRecruiterName: { contains: 'Harish', mode: 'insensitive' } },
        { assignedToRecruiterName: { contains: 'Saiteja', mode: 'insensitive' } },
        { assignedToRecruiterName: { contains: 'Raj', mode: 'insensitive' } },
        { assignmentAssignerName: { contains: 'Harish', mode: 'insensitive' } },
      ],
    },
    select: {
      requirementId: true,
      roleTitle: true,
      assignedToRecruiterName: true,
      submissionsCount: true,
      status: true,
    },
    take: 20,
  });
  console.log('\nRequirements with their names in display fields:', reqsWithTheirName.length);
  reqsWithTheirName.forEach((r) => console.log(r));

  const acts = await prisma.requirementActivity.count({ where: { actorId: { in: userIds } } });
  const subs = await prisma.submission.count({
    where: { OR: [{ submittedBy: { in: userIds } }, { forwardedBy: { in: userIds } }] },
  });
  const assigns = await prisma.requirementAssignment.count({
    where: { OR: [{ recruiterId: { in: userIds } }, { assignedBy: { in: userIds } }] },
  });
  console.log('\n=== Totals for user IDs ===', { activities: acts, submissions: subs, assignments: assigns });
}

main().finally(() => prisma.$disconnect());
