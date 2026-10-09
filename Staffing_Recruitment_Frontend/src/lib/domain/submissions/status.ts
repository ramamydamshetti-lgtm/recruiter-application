/** Normalize frontend/API submission status strings for comparisons. */
export function normalizeSubmissionStatusKey(status: string | undefined | null): string {
  return String(status ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ');
}

export function isLeadReviewStatus(status: string | undefined | null): boolean {
  const s = normalizeSubmissionStatusKey(status);
  return s === 'submitted to lead';
}

export function isClientSubmittedStatus(status: string | undefined | null): boolean {
  const s = normalizeSubmissionStatusKey(status);
  return (
    s === 'submitted to client' ||
    s === 'submitted' ||
    s === 'interview' ||
    s === 'selected' ||
    s === 'rejected'
  );
}

export function isAnySubmittedStatus(status: string | undefined | null): boolean {
  return isLeadReviewStatus(status) || isClientSubmittedStatus(status);
}

export function submissionStageFromStatus(status: string | undefined | null): 'none' | 'lead' | 'client' {
  if (isLeadReviewStatus(status)) return 'lead';
  if (isClientSubmittedStatus(status)) return 'client';
  return 'none';
}

export function canScheduleInterviewForStatus(status: string | undefined | null): boolean {
  const s = normalizeSubmissionStatusKey(status);
  return s === 'submitted to client' || s === 'submitted' || s === 'interview';
}

export function isSubmittedToClientLaneStatus(status: string | undefined | null): boolean {
  const s = normalizeSubmissionStatusKey(status);
  return s === 'submitted to client' || s === 'submitted';
}
