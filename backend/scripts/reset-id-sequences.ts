/**
 * Resets sequences based on current max values in tables.
 * Use this when you want "next created" to continue correctly (or after manual deletes).
 *
 * Usage:
 *   npx tsx scripts/reset-id-sequences.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseSeq(id: string, prefix: string): number | null {
  if (!id.startsWith(prefix)) return null;
  const n = parseInt(id.slice(prefix.length), 10);
  return Number.isFinite(n) ? n : null;
}

/** Max numeric suffix from user-001, usr-001, OWNER-011, USER-001, etc. */
function parseUserSeq(id: string): number | null {
  const m = id.match(/^(?:user|usr|OWNER|USER)-(\d+)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function parseSubmissionSeq(id: string): number | null {
  const m = id.match(/^SUB-(\d+)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function parsePrefixedSeq(id: string, prefix: string): number | null {
  const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = id.match(new RegExp(`^${esc}(\\d+)$`));
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const [users, reqs, clients, subs, reqAss, reqAct, offers, ints] = await Promise.all([
    prisma.user.findMany({ select: { id: true } }),
    prisma.requirement.findMany({ select: { id: true } }),
    prisma.client.findMany({ select: { id: true } }),
    prisma.submission.findMany({ select: { id: true } }),
    prisma.requirementAssignment.findMany({ select: { id: true } }),
    prisma.requirementActivity.findMany({ select: { id: true } }),
    prisma.offerLetter.findMany({ select: { id: true } }),
    prisma.interview.findMany({ select: { id: true } }),
  ]);

  const maxUser = users
    .map((u) => parseUserSeq(u.id))
    .filter((n): n is number => n != null)
    .reduce((a, b) => Math.max(a, b), 0);

  const maxReq = reqs
    .map((r) => parseSeq(r.id, 'REQ-'))
    .filter((n): n is number => n != null)
    .reduce((a, b) => Math.max(a, b), 0);

  const maxClient = clients
    .map((c) => parseSeq(c.id, 'CLIENT-'))
    .filter((n): n is number => n != null)
    .reduce((a, b) => Math.max(a, b), 0);

  const maxSub = subs
    .map((s) => parseSubmissionSeq(s.id))
    .filter((n): n is number => n != null)
    .reduce((a, b) => Math.max(a, b), 0);

  const maxReqAss = reqAss
    .map((r) => parsePrefixedSeq(r.id, 'req_ass-'))
    .filter((n): n is number => n != null)
    .reduce((a, b) => Math.max(a, b), 0);
  const maxReqAct = reqAct
    .map((r) => parsePrefixedSeq(r.id, 'req_act-'))
    .filter((n): n is number => n != null)
    .reduce((a, b) => Math.max(a, b), 0);
  const maxOff = offers
    .map((o) => parsePrefixedSeq(o.id, 'off-'))
    .filter((n): n is number => n != null)
    .reduce((a, b) => Math.max(a, b), 0);
  const maxInt = ints
    .map((i) => parsePrefixedSeq(i.id, 'int-'))
    .filter((n): n is number => n != null)
    .reduce((a, b) => Math.max(a, b), 0);

  await prisma.$executeRawUnsafe(`SELECT setval('global_user_code_seq', ${maxUser + 1}, false)`);
  await prisma.$executeRawUnsafe(`SELECT setval('global_requirement_pk_seq', ${maxReq + 1}, false)`);
  await prisma.$executeRawUnsafe(`SELECT setval('global_client_pk_seq', ${maxClient + 1}, false)`);
  await prisma.$executeRawUnsafe(
    `CREATE SEQUENCE IF NOT EXISTS global_submission_pk_seq AS BIGINT START 1 INCREMENT 1`,
  );
  await prisma.$executeRawUnsafe(`SELECT setval('global_submission_pk_seq', ${maxSub + 1}, false)`);

  await prisma.$executeRawUnsafe(
    `CREATE SEQUENCE IF NOT EXISTS global_requirement_assignment_pk_seq AS BIGINT START 1 INCREMENT 1`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE SEQUENCE IF NOT EXISTS global_requirement_activity_pk_seq AS BIGINT START 1 INCREMENT 1`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE SEQUENCE IF NOT EXISTS global_offer_letter_pk_seq AS BIGINT START 1 INCREMENT 1`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE SEQUENCE IF NOT EXISTS global_interview_pk_seq AS BIGINT START 1 INCREMENT 1`,
  );
  await prisma.$executeRawUnsafe(
    `SELECT setval('global_requirement_assignment_pk_seq', ${maxReqAss + 1}, false)`,
  );
  await prisma.$executeRawUnsafe(
    `SELECT setval('global_requirement_activity_pk_seq', ${maxReqAct + 1}, false)`,
  );
  await prisma.$executeRawUnsafe(`SELECT setval('global_offer_letter_pk_seq', ${maxOff + 1}, false)`);
  await prisma.$executeRawUnsafe(`SELECT setval('global_interview_pk_seq', ${maxInt + 1}, false)`);

  console.log('Reset sequences:', {
    nextUser: maxUser + 1,
    nextReq: maxReq + 1,
    nextClient: maxClient + 1,
    nextSubmission: maxSub + 1,
    nextRequirementAssignment: maxReqAss + 1,
    nextRequirementActivity: maxReqAct + 1,
    nextOfferLetter: maxOff + 1,
    nextInterview: maxInt + 1,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

