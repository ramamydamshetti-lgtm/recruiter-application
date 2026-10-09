const TRACKER_EMPTY = '—';

const LOCATION_HEADERS = ['Current Location', 'Current location', 'Location'] as const;
const ORG_HEADERS = [
  'Current Organization',
  'Current company',
  'Current Company',
  'Organization',
] as const;

type CandidateProfile = {
  currentLocation?: string | null;
  currentCompany?: string | null;
  preferredLocation?: string | null;
};

function resolveCandidateLocation(candidate: CandidateProfile): string {
  const current = String(candidate.currentLocation ?? '').trim();
  if (current) return current;
  const preferred = String(candidate.preferredLocation ?? '').trim();
  return preferred;
}

function isBlankCell(value: string | undefined): boolean {
  const v = String(value ?? '').trim();
  return !v || v === TRACKER_EMPTY;
}

/** Fill empty tracker location/org cells from live candidate profile data. */
export function enrichTrackerMatrixFromCandidates(
  headers: readonly string[],
  rows: string[][],
  candidates: CandidateProfile[],
): string[][] {
  return rows.map((row, index) => {
    const candidate = candidates[index];
    if (!candidate) return row;
    const next = [...row];

    for (const header of LOCATION_HEADERS) {
      const col = headers.indexOf(header);
      if (col < 0) continue;
      if (!isBlankCell(next[col])) continue;
      const loc = resolveCandidateLocation(candidate);
      if (loc) next[col] = loc;
    }

    for (const header of ORG_HEADERS) {
      const col = headers.indexOf(header);
      if (col < 0) continue;
      if (!isBlankCell(next[col])) continue;
      const org = String(candidate.currentCompany ?? '').trim();
      if (org) next[col] = org;
    }

    return next;
  });
}
