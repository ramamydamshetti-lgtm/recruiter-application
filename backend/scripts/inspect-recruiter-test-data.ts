/**
 * Inspect submissions and requirement activities for given recruiter emails.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const emails = (process.argv[2] ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const DEFAULT_EMAILS = [
  'harish.g@metaforgeit.com',
  'saiteja.p@metaforgeit.com',
  'raj.mj@metaforgeit.com',
];

async function main() {
  const targets = emails.length ? emails : DEFAULT_EMAILS;

  const users = await prisma.user.findMany({
    where: { email: { in: targets, mode: 'insensitive' } },
    select: { id: true, email: true, firstName: true, lastName: true, role: true },
  });

  console.log('=== Users found ===');
  console.log(users);
  const missing = targets.filter((e) => !users.some((u) => u.email.toLowerCase() === e));
  if (missing.length) console.log('Missing users:', missing);

  const userIds = users.map((u) => u.id);

  const submissions = await prisma.submission.findMany({
    where: {
      OR: [
        { submittedBy: { in: userIds } },
        { forwardedBy: { in: userIds } },
      ],
    },
    include: {
      submitter: { select: { email: true } },
      requirement: { select: { requirementId: true, roleTitle: true } },
      candidate: { select: { name: true, email: true } },
    },
    orderBy: { submittedOn: 'desc' },
  });

  console.log('\n=== Submissions ===', submissions.length);
  for (const s of submissions) {
    console.log({
      id: s.id,
      ref: s.submissionRef,
      status: s.status,
      submitter: s.submitter.email,
      requirement: s.requirement.requirementId,
      role: s.requirement.roleTitle,
      candidate: `${s.candidate.name} <${s.candidate.email}>`,
      submittedOn: s.submittedOn,
    });
  }

  const assignments = await prisma.requirementAssignment.findMany({
    where: { recruiterId: { in: userIds } },
    include: {
      requirement: { select: { requirementId: true, roleTitle: true } },
    },
  });
  console.log('\n=== Requirement assignments (NOT deleting per user request) ===', assignments.length);
  for (const a of assignments) {
    console.log({
      id: a.id,
      recruiterId: a.recruiterId,
      status: a.status,
      requirement: a.requirement.requirementId,
      role: a.requirement.roleTitle,
    });
  }

  const activities = await prisma.requirementActivity.findMany({
    where: { actorId: { in: userIds } },
    include: {
      requirement: { select: { requirementId: true, roleTitle: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  console.log('\n=== Requirement activities ===', activities.length);
  for (const a of activities.slice(0, 30)) {
    console.log({
      id: a.id,
      action: a.action,
      summary: a.summary?.slice(0, 80),
      actorId: a.actorId,
      requirement: a.requirement?.requirementId,
    });
  }
  if (activities.length > 30) console.log(`... and ${activities.length - 30} more`);

  const statusHistory = await prisma.candidateStatusHistory.findMany({
    where: { changedById: { in: userIds } },
    select: { id: true },
  });
  console.log('\n=== Candidate status history by these users ===', statusHistory.length);

  const interviews = await prisma.interview.findMany({
    where: { recruiterId: { in: userIds } },
    select: { id: true, submissionId: true },
  });
  console.log('=== Interviews by these recruiters ===', interviews.length);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
