import type { Candidate } from '@/lib/domain/candidates/types';

const CAND_DATE_REF = /^CAND-(\d{4}-\d{2}-\d{2})-\d{3}$/i;

/** Calendar date from CAND-YYYY-MM-DD-XXX (submission date chosen at entry). */
export function parseCandidateSubmissionYmd(candidate: {
  candidateRef?: string | null;
  candidateCode?: string | null;
}): string | null {
  for (const raw of [candidate.candidateRef, candidate.candidateCode]) {
    if (typeof raw !== 'string') continue;
    const match = raw.trim().match(CAND_DATE_REF);
    if (match) return match[1];
  }
  return null;
}

function formatYmdLocal(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return '—';
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Submitted date for repository tables — prefer ID date over DB insert timestamp. */
export function formatCandidateSubmissionDate(
  candidate: Pick<Candidate, 'candidateRef' | 'candidateCode' | 'createdAt'>,
): string {
  const fromRef = parseCandidateSubmissionYmd(candidate);
  if (fromRef) return formatYmdLocal(fromRef);

  const iso = candidate.createdAt?.trim();
  if (!iso) return '—';

  const cal = iso.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(cal)) return formatYmdLocal(cal);

  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Numeric internal id for repository table (e.g. 16834), not CAND-YYYY-MM-DD-XXX ref. */
export function displayCandidateRepositoryNumber(
  candidate: Pick<Candidate, 'id' | 'candidateRef' | 'candidateCode'>,
): string {
  const id = String(candidate.id ?? '').trim();
  return id || '—';
}
