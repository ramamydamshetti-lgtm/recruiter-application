import type { PrismaClient } from '@prisma/client';

const CAND_DATE_REF = /^CAND-(\d{4}-\d{2}-\d{2})-(\d{3})$/i;

function formatDateYmd(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function resolveDateYmd(raw?: string): string {
  const trimmed = raw?.trim();
  if (trimmed && /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return formatDateYmd();
}

/** Max 3-digit suffix for CAND-YYYY-MM-DD-XXX on a given calendar day. */
async function maxSerialForDate(prisma: PrismaClient, dateYmd: string): Promise<number> {
  const prefix = `CAND-${dateYmd}-`;
  const rows = await prisma.candidate.findMany({
    where: { candidateRef: { startsWith: prefix } },
    select: { candidateRef: true },
  });
  let max = 0;
  for (const row of rows) {
    const ref = row.candidateRef ?? '';
    if (!CAND_DATE_REF.test(ref)) continue;
    const match = ref.match(/-(\d{3})$/);
    if (match?.[1]) {
      const n = Number.parseInt(match[1], 10);
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
  }
  return max;
}

/** Global numeric internal PK (distinct from the date suffix in candidateRef). */
async function getNextInternalNumericId(prisma: PrismaClient): Promise<string> {
  const rows = await prisma.candidate.findMany({
    where: { id: { not: { contains: '-' } } },
    select: { id: true },
  });
  let max = 0;
  for (const row of rows) {
    const n = Number.parseInt(row.id, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1);
}

/**
 * Allocate CAND-YYYY-MM-DD-XXX from the database when the Postgres function is unavailable.
 */
async function allocateCandRefFromDb(
  prisma: PrismaClient,
  dateYmd?: string,
): Promise<string> {
  const datePart = resolveDateYmd(dateYmd);
  const maxAttempts = 25;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const maxSerial = await maxSerialForDate(prisma, datePart);
    const serial = maxSerial + 1 + attempt;
    const candidateRef = `CAND-${datePart}-${String(serial).padStart(3, '0')}`;
    const existing = await prisma.candidate.findUnique({
      where: { candidateRef },
      select: { id: true },
    });
    if (!existing) return candidateRef;
  }

  throw new Error('Could not generate a unique candidate reference.');
}

/**
 * Public candidate ref for reports (CAND-2026-06-05-001, CAND-2026-06-05-002, …).
 *
 * Uses the Postgres function `generate_candidate_ref()` when available; otherwise
 * allocates the next ref for the given calendar day from existing rows.
 */
export async function generateUniqueCandidateRef(
  prisma: PrismaClient,
  dateYmd?: string,
): Promise<string> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ generate_candidate_ref: string }>>(
      `SELECT generate_candidate_ref() AS generate_candidate_ref`,
    );
    const generated = rows?.[0]?.generate_candidate_ref;
    if (generated && CAND_DATE_REF.test(generated)) {
      const existing = await prisma.candidate.findUnique({
        where: { candidateRef: generated },
        select: { id: true },
      });
      if (!existing) return generated;
    }
  } catch (error) {
    console.warn(
      '[candidateRef] generate_candidate_ref() unavailable, falling back to DB allocation:',
      (error as Error)?.message ?? error,
    );
  }

  return allocateCandRefFromDb(prisma, dateYmd);
}

export type AllocateCandidateIdentityOptions = {
  /** Calendar day for the ref prefix (YYYY-MM-DD). Defaults to today. */
  dateYmd?: string;
  /** Client-suggested ref (e.g. from entry form); used when unique. */
  preferredRef?: string;
};

/** Internal numeric PK + public CAND-YYYY-MM-DD-XXX ref for candidate create. */
export async function allocateCandidateIdentity(
  prisma: PrismaClient,
  options?: AllocateCandidateIdentityOptions,
): Promise<{ id: string; candidateRef: string }> {
  const preferred = options?.preferredRef?.trim();
  let candidateRef: string;

  if (preferred && CAND_DATE_REF.test(preferred)) {
    const taken = await prisma.candidate.findUnique({
      where: { candidateRef: preferred },
      select: { id: true },
    });
    if (!taken) {
      candidateRef = preferred;
    } else {
      const dateFromRef = preferred.match(CAND_DATE_REF)?.[1];
      candidateRef = await allocateCandRefFromDb(prisma, dateFromRef ?? options?.dateYmd);
    }
  } else {
    candidateRef = await generateUniqueCandidateRef(prisma, options?.dateYmd);
  }

  if (!CAND_DATE_REF.test(candidateRef)) {
    candidateRef = await allocateCandRefFromDb(prisma, options?.dateYmd);
  }

  const id = await getNextInternalNumericId(prisma);
  return { id, candidateRef };
}
