import type { Submission } from '@/lib/domain/submissions/types';
import type { InterviewRecord } from '@/lib/api/interviews';
import type { OfferLetterRecord } from '@/lib/api/offerLetters';
import {
  isLeadReviewStatus,
  isSubmittedToClientLaneStatus,
  normalizeSubmissionStatusKey,
} from '@/lib/domain/submissions/status';

/**
 * Kanban column identifiers for the Requirement Overview pipeline.
 *
 * Order mirrors the recruiter flow:
 *   Sourced → Submitted → Submitted to Lead → Submitted to Client → L1 → L2 → Final →
 *   Selected → Offered → Joined → Rejected.
 */
export type PipelineColumnId =
  | 'sourced'
  | 'submitted'
  | 'submitted_to_lead'
  | 'submitted_to_client'
  | 'l1'
  | 'l2'
  | 'final'
  | 'selected'
  | 'offered'
  | 'joined'
  | 'rejected';

export const PIPELINE_COLUMNS: { id: PipelineColumnId; label: string }[] = [
  { id: 'sourced', label: 'Sourced' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'submitted_to_lead', label: 'Submitted to Lead' },
  { id: 'submitted_to_client', label: 'Submitted to Client' },
  { id: 'l1', label: 'L1 Round' },
  { id: 'l2', label: 'L2 Round' },
  { id: 'final', label: 'Final Round' },
  { id: 'selected', label: 'Selected' },
  { id: 'offered', label: 'Candidate Response' },
  { id: 'joined', label: 'Joined' },
  { id: 'rejected', label: 'Rejected' },
];

function normalizeRound(raw: string): 'L1' | 'L2' | 'Final' | null {
  const r = raw.trim().toUpperCase();
  if (r === 'L1') return 'L1';
  if (r === 'L2') return 'L2';
  if (r === 'FINAL' || r.startsWith('FINAL')) return 'Final';
  return null;
}

function isSubmittedStageStatus(status: string): boolean {
  const s = normalizeSubmissionStatusKey(status);
  return s === 'submitted' || s === 'submitted to lead' || s === 'submitted to client';
}

/** Latest meaningful interview per submission (non-cancelled preferred). */
export function latestInterviewForSubmission(
  submissionId: string,
  interviews: InterviewRecord[],
): InterviewRecord | null {
  const rows = interviews.filter((i) => i.submissionId === submissionId && i.status !== 'Cancelled');
  if (rows.length === 0) return null;
  return [...rows].sort(
    (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
  )[0];
}

export function inferPipelineColumn(
  sub: Submission & { emailSent?: boolean },
  interviews: InterviewRecord[],
  offerBySubmissionId: Record<string, OfferLetterRecord | undefined>,
): PipelineColumnId {
  if (sub.status === 'Rejected') return 'rejected';

  const offer = offerBySubmissionId[sub.id];
  // Keep all released/accepted/declined offers grouped in Candidate Response lane
  // so recruiters can track response states from one place.
  if (offer?.status === 'RELEASED' || offer?.status === 'ACCEPTED' || offer?.status === 'DECLINED') {
    return 'offered';
  }

  const latest = latestInterviewForSubmission(sub.id, interviews);
  const round = latest ? normalizeRound(latest.round) : null;
  const decision = String(latest?.finalDecision ?? '').trim().toUpperCase();
  const selectedInAdvancedRound = decision === 'SELECTED' && (round === 'L2' || round === 'Final');
  const selectedBySubmissionState =
    sub.status === 'Selected' && (round === 'L2' || round === 'Final' || round === null);

  if (selectedInAdvancedRound || selectedBySubmissionState) return 'selected';

  if (latest && round && (sub.status === 'Interview' || isSubmittedStageStatus(sub.status) || sub.status === 'Selected')) {
    if (round === 'Final') return 'final';
    if (round === 'L2') return 'l2';
    if (round === 'L1') return 'l1';
  }

  if (sub.status === 'Interview' || sub.status === 'Selected') return 'submitted_to_client';

  if (isLeadReviewStatus(sub.status)) return 'submitted_to_lead';

  if (isSubmittedToClientLaneStatus(sub.status)) return 'submitted_to_client';

  return 'submitted';
}

/** Skill overlap 0–100 for match badge (naive Jaccard on requirement vs candidate tech). */
export function computeMatchPercent(
  reqTech: string[] | undefined,
  candTech: string[] | undefined,
): number {
  const a = new Set((reqTech ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean));
  const b = new Set((candTech ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean));
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of b) {
    if (a.has(x)) inter += 1;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : Math.round((inter / union) * 100);
}
