/**
 * Remove submissions and requirement activities for test recruiters.
 * Does NOT delete requirements, users, or clients.
 *
 * Usage:
 *   npx tsx scripts/cleanup-recruiter-test-data.ts --dry-run
 *   npx tsx scripts/cleanup-recruiter-test-data.ts --yes
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');
const confirmed = process.argv.includes('--yes');

const DEFAULT_EMAILS = [
  'harish.g@metaforgeit.com',
  'saiteja.p@metaforgeit.com',
  'raj.mj@metaforgeit.com',
];

function recruiterActivityPatterns(fullName: string): RegExp[] {
  const escaped = fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [
    new RegExp(`^${escaped} submitted `, 'i'),
    new RegExp(`^${escaped} forwarded `, 'i'),
    new RegExp(`^Requirement assigned to ${escaped}$`, 'i'),
    new RegExp(`^${escaped} is already assigned`, 'i'),
    new RegExp(`^${escaped} resigned`, 'i'),
    new RegExp(`^${escaped} revoked`, 'i'),
    new RegExp(`^${escaped} `, 'i'),
  ];
}

/** Parse "Harish Gadipally submitted Jane Doe for REQ-2026-05-12-014" */
function parseSubmissionCreatedSummary(summary: string): { candidateName: string; requirementCode: string } | null {
  const m = summary.match(/^(.+?) submitted (.+?) for (REQ-\d{4}-\d{2}-\d{2}-\d+)$/i);
  if (!m) return null;
  return { candidateName: m[2].trim(), requirementCode: m[3].trim() };
}

async function main() {
  if (!dryRun && !confirmed) {
    console.error('Use --dry-run or --yes');
    process.exit(1);
  }

  const emails = DEFAULT_EMAILS;
  const users = await prisma.user.findMany({
    where: { email: { in: emails, mode: 'insensitive' } },
  });
  if (users.length === 0) {
    console.error('No matching users found');
    process.exit(1);
  }

  const userIds = users.map((u) => u.id);
  const patterns = users.flatMap((u) => recruiterActivityPatterns(`${u.firstName} ${u.lastName}`));

  const allActivities = await prisma.requirementActivity.findMany({
    select: { id: true, actorId: true, action: true, summary: true, requirementId: true, metadata: true },
  });

  const activitiesToDelete = allActivities.filter(
    (a) =>
      (a.actorId && userIds.includes(a.actorId)) ||
      patterns.some((p) => p.test(a.summary.trim())),
  );
  const activityIds = activitiesToDelete.map((a) => a.id);

  const subsByUser = await prisma.submission.findMany({
    where: { OR: [{ submittedBy: { in: userIds } }, { forwardedBy: { in: userIds } }] },
    select: { id: true, requirementId: true, submissionRef: true, candidateId: true },
  });

  const subIdSet = new Set(subsByUser.map((s) => s.id));

  for (const act of activitiesToDelete) {
    if (act.action !== 'submission.created') continue;
    const parsed = parseSubmissionCreatedSummary(act.summary.trim());
    if (!parsed) continue;
    const req = await prisma.requirement.findFirst({
      where: { requirementId: parsed.requirementCode },
      select: { id: true },
    });
    if (!req) continue;
    const candidates = await prisma.candidate.findMany({
      where: {
        name: { contains: parsed.candidateName.split(' ')[0], mode: 'insensitive' },
      },
      select: { id: true, name: true },
    });
    const match = candidates.find(
      (c) => c.name.trim().toLowerCase() === parsed.candidateName.toLowerCase(),
    ) ?? candidates[0];
    if (!match) continue;
    const sub = await prisma.submission.findFirst({
      where: { requirementId: req.id, candidateId: match.id },
      select: { id: true, submissionRef: true, requirementId: true, candidateId: true },
    });
    if (sub) subIdSet.add(sub.id);
  }

  const subIds = [...subIdSet];
  const subs = await prisma.submission.findMany({
    where: { id: { in: subIds } },
    include: {
      submitter: { select: { email: true } },
      requirement: { select: { requirementId: true, roleTitle: true } },
      candidate: { select: { name: true, email: true } },
    },
  });

  const affectedReqIds = new Set<string>();
  subs.forEach((s) => affectedReqIds.add(s.requirementId));
  activitiesToDelete.forEach((a) => affectedReqIds.add(a.requirementId));

  console.log(dryRun ? '=== DRY RUN ===' : '=== CLEANING ===');
  console.log('Recruiters:', users.map((u) => u.email).join(', '));
  console.log('Submissions to delete:', subs.length);
  for (const s of subs) {
    console.log(`  ${s.submissionRef ?? s.id} | ${s.submitter.email} | ${s.requirement.requirementId} | ${s.candidate.name}`);
  }
  console.log('Requirement activities to delete:', activityIds.length);
  console.log('Requirements kept (counts will be recalculated):', affectedReqIds.size);

  if (dryRun) {
    console.log('\nRe-run with --yes to apply.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (subIds.length) {
      await tx.candidateStatusHistory.deleteMany({ where: { submissionId: { in: subIds } } });
      await tx.interviewRound.deleteMany({ where: { submissionId: { in: subIds } } });
      await tx.offerManagement.deleteMany({ where: { submissionId: { in: subIds } } });
      await tx.offerLetter.deleteMany({ where: { submissionId: { in: subIds } } });
      await tx.interview.deleteMany({ where: { submissionId: { in: subIds } } });
      await tx.communicationLog.deleteMany({ where: { submissionId: { in: subIds } } });
      await tx.submission.deleteMany({ where: { id: { in: subIds } } });
    }

    await tx.requirementActivity.deleteMany({ where: { id: { in: activityIds } } });

    for (const reqId of affectedReqIds) {
      const count = await tx.submission.count({ where: { requirementId: reqId } });
      await tx.requirement.update({
        where: { id: reqId },
        data: { submissionsCount: count },
      });
    }
  });

  console.log('\nDone. Requirements were NOT deleted.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
