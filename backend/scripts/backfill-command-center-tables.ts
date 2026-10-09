/**
 * One-shot idempotent backfill: legacy Interview -> interview_rounds, OfferLetter -> offer_management.
 * Run: npx ts-node scripts/backfill-command-center-tables.ts (from backend/)
 */
import { PrismaClient } from '@prisma/client';
import { upsertInterviewRoundFromLegacy } from '../src/services/interviewRoundsSync';
import { upsertOfferManagementFromLegacy } from '../src/services/offerManagementSync';

const prisma = new PrismaClient();

async function main() {
  console.log('[backfill] starting…');

  const interviews = await prisma.interview.findMany({ orderBy: { createdAt: 'asc' } });
  let iv = 0;
  for (const i of interviews) {
    await upsertInterviewRoundFromLegacy(prisma, i);
    iv += 1;
  }
  console.log(`[backfill] interview_rounds upserts (from interviews): ${iv}`);

  const offers = await prisma.offerLetter.findMany({ orderBy: { createdAt: 'asc' } });
  let ov = 0;
  for (const o of offers) {
    await upsertOfferManagementFromLegacy(prisma, o);
    ov += 1;
  }
  console.log(`[backfill] offer_management upserts (from offer_letters): ${ov}`);

  console.log('[backfill] done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
