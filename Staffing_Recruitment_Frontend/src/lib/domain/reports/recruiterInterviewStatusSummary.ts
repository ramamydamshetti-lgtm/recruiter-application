import type { InterviewRecord } from '@/lib/api/interviews';
import type { Submission } from '@/lib/domain/submissions/types';
import {
  buildInterviewReportDrillDownHref,
  buildSubmissionInterviewDrillDownHref,
} from '@/lib/navigation/interviewReportDrillDown';

export type InterviewRoundKey = 'L1' | 'L2' | 'Final';

export type RoundInterviewCounts = {
  selected: number;
  rejected: number;
  scheduled: number;
  completed: number;
  rescheduled: number;
  cancelled: number;
  other: number;
};

export type InterviewStatusLinkItem = {
  key: string;
  label: string;
  count: number;
  href: string;
};

export type RecruiterInterviewStatusSummary = {
  /** Submissions that entered the interview pipeline (source of truth for total). */
  submissionTotal: number;
  submissionTotalHref: string;
  /** Scheduled interview rows for this recruiter. */
  interviewRecordTotal: number;
  interviewTotalHref: string;
  byRound: Record<InterviewRoundKey, RoundInterviewCounts>;
  /** Clickable status rows with counts and drill-down links. */
  linkItems: InterviewStatusLinkItem[];
};

const EMPTY_ROUND: RoundInterviewCounts = {
  selected: 0,
  rejected: 0,
  scheduled: 0,
  completed: 0,
  rescheduled: 0,
  cancelled: 0,
  other: 0,
};

function emptyByRound(): Record<InterviewRoundKey, RoundInterviewCounts> {
  return {
    L1: { ...EMPTY_ROUND },
    L2: { ...EMPTY_ROUND },
    Final: { ...EMPTY_ROUND },
  };
}

export function normalizeInterviewRound(round: string): InterviewRoundKey {
  const r = (round ?? '').trim().toUpperCase();
  if (r === 'L1' || r.startsWith('L1')) return 'L1';
  if (r === 'L2' || r.startsWith('L2')) return 'L2';
  if (r === 'FINAL' || r.includes('FINAL')) return 'Final';
  return 'L1';
}

function normalizeInterviewStatus(status: string): keyof RoundInterviewCounts {
  const s = (status ?? '').trim().toUpperCase();
  if (s === 'SCHEDULED') return 'scheduled';
  if (s === 'COMPLETED') return 'completed';
  if (s === 'RESCHEDULED') return 'rescheduled';
  if (s === 'CANCELLED' || s === 'CANCELED') return 'cancelled';
  return 'other';
}

function normalizeFinalDecision(
  decision: string | null | undefined,
): 'selected' | 'rejected' | null {
  const d = (decision ?? '').trim().toUpperCase();
  if (d === 'SELECTED') return 'selected';
  if (d === 'REJECTED') return 'rejected';
  return null;
}

function countSubmissionInterviewPipeline(submissions: Submission[], recruiterId: string): number {
  return submissions.filter((s) => {
    if (s.submittedBy.id !== recruiterId) return false;
    return (
      s.status === 'Interview' ||
      s.status === 'Selected' ||
      (s.status === 'Rejected' && Boolean(s.interviewDate))
    );
  }).length;
}

type MetricDef = {
  key: keyof RoundInterviewCounts;
  label: string;
  decision?: 'selected' | 'rejected';
  status?: 'Scheduled' | 'Completed' | 'Cancelled' | 'Rescheduled';
};

const METRICS: MetricDef[] = [
  { key: 'selected', label: 'Sel', decision: 'selected' },
  { key: 'rejected', label: 'Rej', decision: 'rejected' },
  { key: 'scheduled', label: 'Sch', status: 'Scheduled' },
  { key: 'completed', label: 'Done', status: 'Completed' },
  { key: 'rescheduled', label: 'Rsch', status: 'Rescheduled' },
  { key: 'cancelled', label: 'Canc', status: 'Cancelled' },
];

export function summarizeRecruiterInterviews(
  interviews: InterviewRecord[],
  submissions: Submission[],
  recruiterId: string,
): RecruiterInterviewStatusSummary {
  const byRound = emptyByRound();
  const recruiterSubmissionIds = new Set(
    submissions.filter((s) => s.submittedBy.id === recruiterId).map((s) => s.id),
  );

  const rows = interviews.filter(
    (i) =>
      i.recruiterId === recruiterId ||
      (i.submissionId && recruiterSubmissionIds.has(i.submissionId)),
  );

  for (const row of rows) {
    const round = normalizeInterviewRound(row.round);
    const bucket = byRound[round];
    const decision = normalizeFinalDecision(row.finalDecision);
    if (decision === 'selected') {
      bucket.selected += 1;
      continue;
    }
    if (decision === 'rejected') {
      bucket.rejected += 1;
      continue;
    }
    const statusKey = normalizeInterviewStatus(row.status);
    bucket[statusKey] += 1;
  }

  const linkItems: InterviewStatusLinkItem[] = [];
  for (const round of ['L1', 'L2', 'Final'] as InterviewRoundKey[]) {
    const counts = byRound[round];
    for (const metric of METRICS) {
      const count = counts[metric.key];
      if (!count) continue;
      linkItems.push({
        key: `${round}-${metric.key}`,
        label: `${round} ${metric.label}`,
        count,
        href: buildInterviewReportDrillDownHref({
          recruiterId,
          round,
          ...(metric.decision ? { decision: metric.decision } : {}),
          ...(metric.status ? { status: metric.status } : {}),
        }),
      });
    }
  }

  const submissionTotal = countSubmissionInterviewPipeline(submissions, recruiterId);

  return {
    submissionTotal,
    submissionTotalHref: buildSubmissionInterviewDrillDownHref(recruiterId),
    interviewRecordTotal: rows.length,
    interviewTotalHref: buildInterviewReportDrillDownHref({ recruiterId }),
    byRound,
    linkItems,
  };
}
