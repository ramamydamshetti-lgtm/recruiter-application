/**
 * Handover cleanup: remove all business data for a fresh company start.
 * KEEPS: users (and _prisma_migrations).
 * REMOVES: interviews, submissions, candidates, requirements, clients, requirement_assignments.
 * Also clears files in uploads/resumes/ (not the folder itself).
 *
 * Usage:
 *   npx tsx scripts/clean-database-handover.ts --yes
 *   CONFIRM_HANDOVER_CLEAN=true npx tsx scripts/clean-database-handover.ts
 *
 * Take a DB backup first: pg_dump ...
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearResumeUploads(): Promise<number> {
  const dir = path.join(process.cwd(), 'uploads', 'resumes');
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    try {
      if (fs.statSync(p).isFile()) {
        fs.unlinkSync(p);
        n += 1;
      }
    } catch {
      // skip locked / odd entries
    }
  }
  return n;
}

async function main() {
  const confirmed =
    process.argv.includes('--yes') ||
    process.argv.includes('-y') ||
    process.env.CONFIRM_HANDOVER_CLEAN === 'true';

  if (!confirmed) {
    console.error(
      '\nRefusing to run: this permanently deletes business data (users are kept).\n' +
        'Run with:  npx tsx scripts/clean-database-handover.ts --yes\n' +
        'Or set:    CONFIRM_HANDOVER_CLEAN=true\n',
    );
    process.exit(1);
  }

  console.warn('\n*** HANDOVER CLEAN: deleting business data; users table unchanged ***\n');

  const counts = await prisma.$transaction(async (tx) => {
    const i = await tx.interview.deleteMany({});
    const s = await tx.submission.deleteMany({});
    const ra = await tx.requirementAssignment.deleteMany({});
    const c = await tx.candidate.deleteMany({});
    const r = await tx.requirement.deleteMany({});
    const cl = await tx.client.deleteMany({});
    return {
      interviews: i.count,
      submissions: s.count,
      requirementAssignments: ra.count,
      candidates: c.count,
      requirements: r.count,
      clients: cl.count,
    };
  });

  console.log('Database rows deleted:', counts);

  const files = await clearResumeUploads();
  console.log(`Resume files removed from uploads/resumes: ${files}`);

  console.log('\nDone. User accounts are intact; company can log in and create clients/requirements.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
