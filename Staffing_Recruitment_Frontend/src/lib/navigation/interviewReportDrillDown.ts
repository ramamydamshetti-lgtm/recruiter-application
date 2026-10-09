export type InterviewDrillDownFilter = {
  recruiterId: string;
  round?: 'L1' | 'L2' | 'Final';
  /** Interview row status: Scheduled, Completed, etc. */
  status?: 'Scheduled' | 'Completed' | 'Cancelled' | 'Rescheduled';
  /** Outcome from final decision */
  decision?: 'selected' | 'rejected';
};

export function buildInterviewReportDrillDownHref(filter: InterviewDrillDownFilter): string {
  const params = new URLSearchParams();
  params.set('recruiter', filter.recruiterId.trim());
  if (filter.round) params.set('round', filter.round);
  if (filter.status) params.set('status', filter.status);
  if (filter.decision) params.set('decision', filter.decision);
  return `/interviews?${params.toString()}`;
}

export function buildSubmissionInterviewDrillDownHref(recruiterId: string): string {
  const params = new URLSearchParams();
  params.set('submittedById', recruiterId.trim());
  params.set('interviews', '1');
  return `/submissions?${params.toString()}`;
}
