import type { SubmissionStatus, UserRole } from '@prisma/client';

export type FrontendSubmissionStatus =
  | 'Submitted to Lead'
  | 'Submitted to Client'
  | 'Submitted'
  | 'Interview'
  | 'Selected'
  | 'Rejected';

export function isClientSubmittedStatus(status: string): boolean {
  const u = status.toUpperCase();
  return (
    u === 'SUBMITTED_TO_CLIENT' ||
    u === 'SUBMITTED' ||
    u === 'INTERVIEW' ||
    u === 'SELECTED' ||
    u === 'REJECTED'
  );
}

export function isLeadReviewStatus(status: string): boolean {
  return status.toUpperCase() === 'SUBMITTED_TO_LEAD';
}

export function toFrontendSubmissionStatus(status: string): FrontendSubmissionStatus {
  const u = status.toUpperCase();
  if (u === 'SUBMITTED_TO_LEAD') return 'Submitted to Lead';
  if (u === 'SUBMITTED_TO_CLIENT' || u === 'SUBMITTED') return 'Submitted to Client';
  if (u === 'INTERVIEW') return 'Interview';
  if (u === 'SELECTED') return 'Selected';
  if (u === 'REJECTED') return 'Rejected';
  return 'Submitted to Lead';
}

export function normalizeSubmissionStatus(status: string | undefined): SubmissionStatus {
  const s = (status ?? 'SUBMITTED_TO_LEAD').toString().trim().toUpperCase();
  if (s === 'SUBMITTED_TO_LEAD' || s === 'SUBMITTED TO LEAD') return 'SUBMITTED_TO_LEAD';
  if (s === 'SUBMITTED_TO_CLIENT' || s === 'SUBMITTED TO CLIENT') return 'SUBMITTED_TO_CLIENT';
  if (s === 'SUBMITTED') return 'SUBMITTED_TO_CLIENT';
  if (s === 'INTERVIEW') return 'INTERVIEW';
  if (s === 'SELECTED') return 'SELECTED';
  if (s === 'REJECTED') return 'REJECTED';
  return 'SUBMITTED_TO_LEAD';
}

export function parseSubmissionStage(body: Record<string, unknown>): 'lead' | 'client' {
  const raw =
    body.submissionStage ??
    body.submissionDestination ??
    body.submission_destination;
  return raw === 'client' ? 'client' : 'lead';
}

export function resolveInitialSubmissionStatus(input: {
  role: UserRole | string | undefined;
  stage: 'lead' | 'client';
  explicitStatus?: string;
}): SubmissionStatus {
  if (input.explicitStatus) {
    const normalized = normalizeSubmissionStatus(input.explicitStatus);
    if (input.role === 'RECRUITER' && normalized === 'SUBMITTED_TO_CLIENT') {
      return 'SUBMITTED_TO_LEAD';
    }
    return normalized;
  }
  if (input.role === 'RECRUITER') return 'SUBMITTED_TO_LEAD';
  return input.stage === 'client' ? 'SUBMITTED_TO_CLIENT' : 'SUBMITTED_TO_LEAD';
}

export function toRequirementStatusFromSubmission(status: SubmissionStatus): string {
  if (status === 'SUBMITTED_TO_LEAD' || status === 'SUBMITTED_TO_CLIENT' || status === 'SUBMITTED') {
    return 'SUBMITTED';
  }
  return status;
}
