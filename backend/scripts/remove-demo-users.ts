/**
 * Removes demo/seeded users and their dependent seeded data.
 *
 * Usage:
 *   cd backend
 *   npx tsx scripts/remove-demo-users.ts
 *
 * Notes:
 * - Targets only the exact seeded emails from prisma/seed.ts
 * - Idempotent: safe to run multiple times
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_EMAILS = ['admin@recruiter.com', 'recruiter@company.com', 'candidate@email.com'] as const;

async function main() {
  console.log('🧹 Removing demo users:', DEMO_EMAILS.join(', '));

  const demoUsers = await prisma.user.findMany({
    where: { email: { in: [...DEMO_EMAILS] } },
    select: { id: true, email: true },
  });

  if (demoUsers.length === 0) {
    console.log('✅ No demo users found. Nothing to remove.');
    return;
  }

  const userIds = demoUsers.map((u) => u.id);
  const emails = demoUsers.map((u) => u.email);

  const recruiterProfiles = await prisma.recruiterProfile.findMany({
    where: { userId: { in: userIds } },
    select: { id: true, userId: true },
  });
  const recruiterProfileIds = recruiterProfiles.map((r) => r.id);

  const candidateProfiles = await prisma.candidateProfile.findMany({
    where: { userId: { in: userIds } },
    select: { id: true, userId: true },
  });
  const candidateProfileIds = candidateProfiles.map((c) => c.id);

  // Job postings created by demo recruiter profile(s)
  const jobPostings = recruiterProfileIds.length
    ? await prisma.jobPosting.findMany({
        where: { recruiterId: { in: recruiterProfileIds } },
        select: { id: true },
      })
    : [];
  const jobIds = jobPostings.map((j) => j.id);

  // Applications created for demo candidate profiles
  const applications = candidateProfileIds.length
    ? await prisma.application.findMany({
        where: { candidateId: { in: candidateProfileIds } },
        select: { id: true },
      })
    : [];
  const applicationIds = applications.map((a) => a.id);

  await prisma.$transaction(async (tx) => {
    // Interviews depend on applications
    if (applicationIds.length) {
      const r = await tx.interview.deleteMany({ where: { applicationId: { in: applicationIds } } });
      console.log(' - interviews deleted:', r.count);
    }

    // App-dependent records (if any)
    if (applicationIds.length) {
      const r = await tx.application.deleteMany({ where: { id: { in: applicationIds } } });
      console.log(' - applications deleted:', r.count);
    }

    // Candidate profile dependents
    if (candidateProfileIds.length) {
      const ex = await tx.experience.deleteMany({ where: { candidateId: { in: candidateProfileIds } } });
      const ed = await tx.education.deleteMany({ where: { candidateId: { in: candidateProfileIds } } });
      const cs = await tx.candidateSkill.deleteMany({ where: { candidateId: { in: candidateProfileIds } } });
      const sj = await tx.savedJob.deleteMany({ where: { candidateId: { in: candidateProfileIds } } });
      const as = await tx.assessment.deleteMany({ where: { candidateId: { in: candidateProfileIds } } });
      console.log(' - experiences deleted:', ex.count);
      console.log(' - education deleted:', ed.count);
      console.log(' - candidate skills deleted:', cs.count);
      console.log(' - saved jobs deleted:', sj.count);
      console.log(' - assessments deleted:', as.count);
    }

    // Company reviews seeded with reviewerId=user.id
    if (userIds.length) {
      const cr = await tx.companyReview.deleteMany({ where: { reviewerId: { in: userIds } } });
      console.log(' - company reviews deleted:', cr.count);
    }

    // Job posting dependents
    if (jobIds.length) {
      const js = await tx.jobSkill.deleteMany({ where: { jobId: { in: jobIds } } });
      console.log(' - job skills deleted:', js.count);

      // Also remove any applications tied to demo jobs (belt + suspenders)
      const appsForJobs = await tx.application.findMany({
        where: { jobId: { in: jobIds } },
        select: { id: true },
      });
      const appIdsForJobs = appsForJobs.map((a) => a.id);
      if (appIdsForJobs.length) {
        const i2 = await tx.interview.deleteMany({ where: { applicationId: { in: appIdsForJobs } } });
        const a2 = await tx.application.deleteMany({ where: { id: { in: appIdsForJobs } } });
        console.log(' - interviews (job-linked) deleted:', i2.count);
        console.log(' - applications (job-linked) deleted:', a2.count);
      }

      const jp = await tx.jobPosting.deleteMany({ where: { id: { in: jobIds } } });
      console.log(' - job postings deleted:', jp.count);
    }

    // Profiles
    if (candidateProfileIds.length) {
      const cp = await tx.candidateProfile.deleteMany({ where: { id: { in: candidateProfileIds } } });
      console.log(' - candidate profiles deleted:', cp.count);
    }
    if (recruiterProfileIds.length) {
      const rp = await tx.recruiterProfile.deleteMany({ where: { id: { in: recruiterProfileIds } } });
      console.log(' - recruiter profiles deleted:', rp.count);
    }

    // Finally, delete the demo users
    const u = await tx.user.deleteMany({ where: { id: { in: userIds } } });
    console.log(' - users deleted:', u.count);
  });

  console.log('✅ Demo user cleanup complete for:', emails.join(', '));
}

main()
  .catch((e) => {
    console.error('❌ Demo user cleanup failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

