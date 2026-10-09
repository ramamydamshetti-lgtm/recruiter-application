import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();

  // We keep Users/Clients intact so login + requirement creation still work.
  // Only wipe recruitment workflow data.
  const deletedSubmissions = await prisma.submission.deleteMany({});
  const deletedRequirements = await prisma.requirement.deleteMany({});
  const deletedCandidates = await prisma.candidate.deleteMany({});

  console.log('✅ Clean complete');
  console.log(`- deletedSubmissions: ${deletedSubmissions.count}`);
  console.log(`- deletedRequirements: ${deletedRequirements.count}`);
  console.log(`- deletedCandidates: ${deletedCandidates.count}`);
}

main()
  .catch((e) => {
    console.error('❌ Clean failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    // no-op: main() handles disconnect via PrismaClient lifecycle
  });

