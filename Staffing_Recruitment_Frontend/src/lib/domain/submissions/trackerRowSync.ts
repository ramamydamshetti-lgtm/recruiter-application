import type { Candidate, CandidateSubmission } from '@/lib/domain/candidates/types';
import {
  TRACKER_EMPTY,
  TRACKER_SKILL_COLUMN_KEYS,
  TRACKER_PROFILE_COLUMN_KEYS,
} from '@/lib/domain/submissions/trackerFieldResolvers';

/** Resolve current location from submission override, candidate profile, or legacy `location`. */
export function pickCandidateCurrentLocation(
  candidate: Candidate,
  submission?: CandidateSubmission,
): string {
  const fromSub = submission?.currentLocation;
  if (fromSub != null && fromSub !== '') return fromSub;
  const fromCand = candidate.currentLocation;
  if (fromCand != null && fromCand !== '') return fromCand;
  const legacy = candidate.location;
  if (legacy != null && legacy !== '') return legacy;
  // Legacy records: entry form once sent current location as `location`, stored in preferred_location.
  const misfiledPreferred = candidate.preferredLocation;
  if (misfiledPreferred != null && misfiledPreferred !== '') return misfiledPreferred;
  return '';
}

/**
 * Rebuild tracker row from fresh candidate data while keeping recruiter-edited non-empty cells.
 * Skill columns always take the latest candidate skill set so JD skills never stick as stale data.
 */
export function mergeTrackerRowPreservingEdits<
  T extends { candidateId: string } & Record<string, string>,
>(existing: T | undefined, fresh: T): T {
  if (!existing) return fresh;
  const merged: T = { ...fresh };
  for (const key of Object.keys(fresh)) {
    if (key === 'candidateId') continue;
    if (TRACKER_SKILL_COLUMN_KEYS.has(key) || TRACKER_PROFILE_COLUMN_KEYS.has(key)) continue;

    const prev = String(existing[key] ?? '');
    const next = String(fresh[key] ?? '');
    if (next && next !== TRACKER_EMPTY) {
      (merged as Record<string, string>)[key] = fresh[key];
      continue;
    }
    if (prev && prev !== TRACKER_EMPTY) {
      (merged as Record<string, string>)[key] = existing[key];
    }
  }
  return merged;
}

/** Keep attached candidates in sync with the latest profile from the candidates store. */
export function syncAttachedCandidatesFromStore(
  attached: Candidate[],
  storeCandidates: Candidate[],
): Candidate[] {
  if (attached.length === 0) return attached;
  const byId = new Map(storeCandidates.map((c) => [c.id, c]));
  return attached.map((c) => {
    const fresh = byId.get(c.id);
    return fresh ? { ...c, ...fresh } : c;
  });
}
