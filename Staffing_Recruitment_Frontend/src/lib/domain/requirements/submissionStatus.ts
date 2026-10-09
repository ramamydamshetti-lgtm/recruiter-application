import type { Requirement, RequirementStatus } from './types';
import type { Submission } from '@/lib/domain/submissions/types';

type RankedStatus = { rank: number; status: RequirementStatus };

function getSubmissionStatusRank(status: string): number {
  const s = status.trim().toUpperCase();
  // Final HR selection should stay in open/interview stage until offer release.
  if (s === 'SELECTED') return 3;
  if (s === 'INTERVIEW') return 3;
  if (s === 'SUBMITTED') return 2;
  if (s === 'REJECTED') return 1;
  return 0;
}

function toRequirementStatus(status: string): RequirementStatus | null {
  const s = status.trim().toUpperCase();
  // Keep requirement open after final-round selection, until offer is released.
  if (s === 'SELECTED') return 'Interview';
  if (s === 'INTERVIEW') return 'Interview';
  if (s === 'SUBMITTED') return 'Submitted';
  if (s === 'REJECTED') return 'Rejected';
  return null;
}

export function buildEffectiveStatusByRequirementId(submissions: Submission[]) {
  const best = new Map<string, RankedStatus>();

  for (const submission of submissions) {
    const reqId = submission.requirement?.id;
    if (!reqId || !submission.status) continue;

    const mapped = toRequirementStatus(submission.status);
    if (!mapped) continue;

    const nextRank = getSubmissionStatusRank(submission.status);
    const prev = best.get(reqId);
    if (!prev || nextRank > prev.rank) {
      best.set(reqId, { rank: nextRank, status: mapped });
    }
  }

  return best;
}

export function withEffectiveStatuses(
  requirements: Requirement[],
  effectiveStatusByRequirementId: Map<string, RankedStatus>,
) {
  return requirements.map((r) => {
    const derived = effectiveStatusByRequirementId.get(r.id)?.status;
    if (!derived) return r;
    return { ...r, status: derived };
  });
}
