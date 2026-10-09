/**
 * Inspect a requirement and related records before deletion.
 * Usage: npx tsx scripts/inspect-requirement.ts REQ-2026-06-17-006
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const reqPublicId = process.argv[2]?.trim();

async function main() {
  if (!reqPublicId) {
    console.error('Usage: npx tsx scripts/inspect-requirement.ts REQ-2026-06-17-006');
    process.exit(1);
  }

  const req = await prisma.requirement.findFirst({
    where: { requirementId: reqPublicId },
    include: {
      client: { select: { id: true, name: true, clientCode: true } },
      assignments: true,
      submissions: {
        include: {
          candidate: { select: { id: true, candidateRef: true, name: true, email: true } },
          submitter: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      },
      activities: { select: { id: true, action: true, summary: true } },
      communicationLogs: { select: { id: true, type: true, subject: true, status: true } },
    },
  });

  if (!req) {
    console.log('Requirement not found:', reqPublicId);
    process.exit(1);
  }

  console.log('=== Requirement ===');
  console.log(JSON.stringify({
    id: req.id,
    requirementId: req.requirementId,
    roleTitle: req.roleTitle,
    status: req.status,
    client: req.client,
    sourceEmailSubject: req.sourceEmailSubject,
    assignedToRecruiterName: req.assignedToRecruiterName,
    submissionsCount: req.submissionsCount,
  }, null, 2));

  console.log('\n=== Assignments ===');
  console.log(req.assignments);

  console.log('\n=== Submissions ===');
  for (const s of req.submissions) {
    console.log({
      id: s.id,
      submissionRef: s.submissionRef,
      status: s.status,
      candidate: s.candidate,
      submitter: s.submitter,
      submittedOn: s.submittedOn,
    });
  }

  console.log('\n=== Activities ===', req.activities.length);
  console.log('\n=== Communication logs ===', req.communicationLogs.length);

  const candidateIds = [...new Set(req.submissions.map((s) => s.candidateId))];
  for (const cid of candidateIds) {
    const otherSubs = await prisma.submission.count({
      where: { candidateId: cid, requirementId: { not: req.id } },
    });
    const cand = req.submissions.find((s) => s.candidateId === cid)?.candidate;
    console.log(`\nCandidate ${cand?.email}: other submissions elsewhere = ${otherSubs}`);
  }

  const ingestion = await prisma.emailIngestionEvent.findMany({
    where: {
      OR: [
        { graphMessageId: req.sourceEmailGraphMessageId ?? undefined },
        { requirementId: req.id },
      ].filter((o) => Object.values(o)[0]),
    },
    take: 5,
  });
  console.log('\n=== Email ingestion events ===', ingestion.length);
  if (ingestion.length) console.log(ingestion);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
