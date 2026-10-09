import type { InterviewRecord } from '@/lib/api/interviews';
import type { OfferLetterRecord } from '@/lib/api/offerLetters';
import type { RequirementStatus } from '@/lib/domain/requirements/types';

function normalizeRoundOrder(r: string): number {
  const u = r.trim().toUpperCase();
  if (u === 'L1') return 1;
  if (u === 'L2') return 2;
  if (u === 'FINAL' || u.startsWith('FINAL')) return 3;
  return 0;
}

function normalizeRoundLabel(r: string): 'L1' | 'L2' | 'Final' | 'Other' {
  const u = r.trim().toUpperCase();
  if (u === 'L1') return 'L1';
  if (u === 'L2') return 'L2';
  if (u === 'FINAL' || u.startsWith('FINAL')) return 'Final';
  return 'Other';
}

export function maxInterviewRoundFromList(interviews: InterviewRecord[]): 'none' | 'L1' | 'L2' | 'Final' {
  let max = 0;
  for (const i of interviews) {
    if (i.status === 'Cancelled') continue;
    const o = normalizeRoundOrder(i.round);
    if (o > max) max = o;
  }
  if (max === 1) return 'L1';
  if (max === 2) return 'L2';
  if (max === 3) return 'Final';
  return 'none';
}

/** Maps requirement + aggregates to RecruitmentTimeline currentIndex (0..12). */
export function computeRecruitmentTimelineIndex(input: {
  requirementStatus: RequirementStatus;
  requirementClosed?: boolean;
  hasSubmissions: boolean;
  hasLeadSubmissions?: boolean;
  hasClientSubmissions?: boolean;
  interviews: InterviewRecord[];
  offers: OfferLetterRecord[];
}): { index: number; rejected: boolean } {
  const {
    requirementStatus,
    requirementClosed,
    hasSubmissions,
    hasLeadSubmissions = false,
    hasClientSubmissions = false,
    interviews,
    offers,
  } = input;

  if (requirementClosed || requirementStatus === 'Closed') {
    return { index: 12, rejected: false };
  }
  if (requirementStatus === 'Rejected') {
    return { index: Math.min(12, 9), rejected: true };
  }

  const anyJoined = offers.some((o) => o.status === 'ACCEPTED');
  const anyReleased = offers.some((o) => o.status === 'RELEASED');

  const activeInterviews = interviews.filter((i) => i.status !== 'Cancelled');
  const hasRoundScheduled = (round: 'L1' | 'L2' | 'Final') =>
    activeInterviews.some((i) => {
      const isRound = normalizeRoundLabel(i.round) === round;
      const isScheduledState = i.status === 'Scheduled' || i.status === 'Rescheduled';
      return isRound && isScheduledState;
    });
  const hasRoundCompleted = (round: 'L1' | 'L2' | 'Final') =>
    activeInterviews.some((i) => {
      const isRound = normalizeRoundLabel(i.round) === round;
      const decision = (i.finalDecision ?? '').toString().trim().toUpperCase();
      const completedByDecision = decision === 'SELECTED' || decision === 'REJECTED';
      return isRound && (i.status === 'Completed' || completedByDecision);
    });

  if (anyJoined) return { index: 11, rejected: false };
  if (anyReleased) return { index: 10, rejected: false };

  if (hasRoundCompleted('Final') || requirementStatus === 'Selected') return { index: 9, rejected: false };
  if (hasRoundScheduled('Final')) return { index: 8, rejected: false };
  if (hasRoundCompleted('L2')) return { index: 7, rejected: false };
  if (hasRoundScheduled('L2')) return { index: 6, rejected: false };
  if (hasRoundCompleted('L1')) return { index: 5, rejected: false };
  if (hasRoundScheduled('L1') || requirementStatus === 'Interview') return { index: 4, rejected: false };

  if (hasClientSubmissions || requirementStatus === 'Submitted') return { index: 3, rejected: false };
  if (hasLeadSubmissions || hasSubmissions) return { index: 2, rejected: false };
  if (requirementStatus === 'Assigned') return { index: 0, rejected: false };
  if (requirementStatus === 'Open') return { index: 1, rejected: false };

  return { index: 1, rejected: false };
}
