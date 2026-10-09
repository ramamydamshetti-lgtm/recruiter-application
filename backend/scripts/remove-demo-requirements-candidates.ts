import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Removes demo requirements and candidates shown in UI screenshots:
 * - Requirements: requirementId starts with REQ-INT / roleTitle contains "Integration"
 * - Candidates: email starts with integration.test.candidate / name starts with "Integration Candidate"
 *
 * Also removes dependent submissions and requirement assignments so FK constraints won't block deletes.
 *
 * Usage:
 *   cd backend
 *   npx tsx scripts/remove-demo-requirements-candidates.ts
 */

async function main() {
  const requirements = await prisma.requirement.findMany({
    where: {
      OR: [{ requirementId: { startsWith: 'REQ-INT' } }, { roleTitle: { contains: 'Integration' } }],
    },
    select: { id: true, requirementId: true, roleTitle: true },
  });

  const candidates = await prisma.candidate.findMany({
    where: {
      OR: [
        { email: { startsWith: 'integration.test.candidate' } },
        { name: { startsWith: 'Integration Candidate' } },
      ],
    },
    select: { id: true, email: true, name: true },
  });

  const reqIds = requirements.map((r) => r.id);
  const candIds = candidates.map((c) => c.id);

  console.log('🔎 Demo requirements found:', requirements.length);
  if (requirements.length) console.log(requirements.map((r) => `${r.requirementId} — ${r.roleTitle}`).join('\n'));
  console.log('🔎 Demo candidates found:', candidates.length);
  if (candidates.length) console.log(candidates.map((c) => `${c.email} — ${c.name}`).join('\n'));

  if (reqIds.length === 0 && candIds.length === 0) {
    console.log('✅ Nothing to remove.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Submissions reference both Requirement and Candidate.
    const sub = await tx.submission.deleteMany({
      where: {
        OR: [
          reqIds.length ? { requirementId: { in: reqIds } } : undefined,
          candIds.length ? { candidateId: { in: candIds } } : undefined,
        ].filter(Boolean) as any,
      },
    });
    console.log(' - submissions deleted:', sub.count);

    // Assignments reference Requirement and User.
    if (reqIds.length) {
      const ra = await tx.requirementAssignment.deleteMany({
        where: { requirementId: { in: reqIds } },
      });
      console.log(' - requirement assignments deleted:', ra.count);
    }

    // Delete demo requirements.
    if (reqIds.length) {
      const r = await tx.requirement.deleteMany({ where: { id: { in: reqIds } } });
      console.log(' - requirements deleted:', r.count);
    }

    // Delete demo candidates.
    if (candIds.length) {
      const c = await tx.candidate.deleteMany({ where: { id: { in: candIds } } });
      console.log(' - candidates deleted:', c.count);
    }
  });

  console.log('✅ Demo requirements/candidates removed.');
}

main()
  .catch((e) => {
    console.error('❌ remove-demo-requirements-candidates failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

