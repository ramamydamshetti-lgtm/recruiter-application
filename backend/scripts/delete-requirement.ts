/**
 * Delete a single requirement and related test data.
 *
 * Usage:
 *   npx tsx scripts/delete-requirement.ts REQ-2026-06-17-006 --dry-run
 *   npx tsx scripts/delete-requirement.ts REQ-2026-06-17-006 --yes
 *
 * Options:
 *   --delete-orphan-candidates  Also delete candidates with no remaining submissions after removal
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const reqPublicId = process.argv[2]?.trim();
const dryRun = process.argv.includes('--dry-run');
const confirmed = process.argv.includes('--yes');
const deleteOrphanCandidates = process.argv.includes('--delete-orphan-candidates');

async function main() {
  if (!reqPublicId) {
    console.error('Usage: npx tsx scripts/delete-requirement.ts REQ-2026-06-17-006 [--dry-run|--yes]');
    process.exit(1);
  }
  if (!dryRun && !confirmed) {
    console.error('Pass --dry-run to preview or --yes to execute deletion.');
    process.exit(1);
  }

  const req = await prisma.requirement.findFirst({
    where: { requirementId: reqPublicId },
    include: {
      client: { select: { id: true, name: true } },
      submissions: {
        select: {
          id: true,
          submissionRef: true,
          candidateId: true,
          candidate: { select: { id: true, name: true, email: true } },
        },
      },
      assignments: { select: { id: true } },
      activities: { select: { id: true } },
    },
  });

  if (!req) {
    console.error('Requirement not found:', reqPublicId);
    process.exit(1);
  }

  const subIds = req.submissions.map((s) => s.id);
  const candidateIds = [...new Set(req.submissions.map((s) => s.candidateId))];

  const orphanCandidateIds: string[] = [];
  for (const cid of candidateIds) {
    const total = await prisma.submission.count({ where: { candidateId: cid } });
    const onlyThisReq = total === 1;
    if (onlyThisReq) orphanCandidateIds.push(cid);
  }

  const otherReqsOnClient = await prisma.requirement.count({
    where: { clientId: req.clientId, id: { not: req.id } },
  });
  const deleteClient = otherReqsOnClient === 0;

  const ingestionEvents = await prisma.emailIngestionEvent.findMany({
    where: {
      OR: [
        { requirementPk: req.id },
        { requirementCode: req.requirementId },
        ...(req.sourceEmailGraphMessageId ? [{ graphMessageId: req.sourceEmailGraphMessageId }] : []),
      ],
    },
    select: { id: true, status: true, requirementCode: true },
  });

  console.log(dryRun ? '=== DRY RUN ===' : '=== DELETING ===');
  console.log('Requirement:', req.requirementId, '-', req.roleTitle, `(${req.id})`);
  console.log('Client:', req.client.name, `(${req.clientId})`, deleteClient ? '→ will delete client' : '→ keep client');
  console.log('Submissions to delete:', subIds.length, subIds);
  console.log('Assignments:', req.assignments.length);
  console.log('Activities:', req.activities.length);
  console.log('Email ingestion events:', ingestionEvents.length);
  console.log('Candidates linked:', candidateIds.length);
  console.log(
    'Orphan candidates (only this requirement):',
    orphanCandidateIds.length,
    req.submissions
      .filter((s) => orphanCandidateIds.includes(s.candidateId))
      .map((s) => `${s.candidate.name} <${s.candidate.email}>`),
  );
  console.log(
    'Candidates kept (used elsewhere):',
    req.submissions
      .filter((s) => !orphanCandidateIds.includes(s.candidateId))
      .map((s) => `${s.candidate.name} <${s.candidate.email}>`),
  );

  if (dryRun) {
    console.log('\nRe-run with --yes to delete.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.candidateStatusHistory.deleteMany({ where: { submissionId: { in: subIds } } });
    await tx.interviewRound.deleteMany({ where: { submissionId: { in: subIds } } });
    await tx.offerManagement.deleteMany({ where: { submissionId: { in: subIds } } });
    await tx.offerLetter.deleteMany({ where: { submissionId: { in: subIds } } });
    await tx.interview.deleteMany({ where: { submissionId: { in: subIds } } });
    await tx.communicationLog.deleteMany({
      where: { OR: [{ requirementId: req.id }, { submissionId: { in: subIds } }] },
    });
    await tx.submission.deleteMany({ where: { id: { in: subIds } } });
    await tx.requirementActivity.deleteMany({ where: { requirementId: req.id } });
    await tx.requirementAssignment.deleteMany({ where: { requirementId: req.id } });
    await tx.emailIngestionEvent.deleteMany({
      where: { id: { in: ingestionEvents.map((e) => e.id) } },
    });
    await tx.requirement.delete({ where: { id: req.id } });

    if (deleteOrphanCandidates && orphanCandidateIds.length) {
      await tx.candidate.deleteMany({ where: { id: { in: orphanCandidateIds } } });
    }

    if (deleteClient) {
      await tx.client.delete({ where: { id: req.clientId } });
    }
  });

  console.log('\nDeleted successfully.');
  if (!deleteOrphanCandidates && orphanCandidateIds.length) {
    console.log(
      'Note: orphan test candidates were kept. Re-run with --delete-orphan-candidates to remove them.',
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
