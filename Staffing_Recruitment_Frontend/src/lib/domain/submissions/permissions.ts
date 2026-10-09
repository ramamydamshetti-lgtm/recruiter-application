import type { Submission } from '@/lib/domain/submissions/types';
import { isLeadReviewStatus } from '@/lib/domain/submissions/status';
import { isLeadRole } from '@/lib/auth/roles';

type Viewer = { id?: string; role?: string } | null | undefined;

/** Phase 1: recruiters may act only on their own submissions. */
export function canActOnSubmission(
  submission: Pick<Submission, 'submittedBy'> | null | undefined,
  viewer: Viewer,
): boolean {
  if (!submission || !viewer?.id) return false;
  return submission.submittedBy?.id === viewer.id;
}

/** Leads may forward any candidate in lead-review to the client thread. */
export function canForwardLeadSubmission(
  submission: Pick<Submission, 'status' | 'submittedBy'> | null | undefined,
  viewer: Viewer,
): boolean {
  if (!submission || !viewer?.id) return false;
  if (!isLeadRole(viewer.role)) return false;
  return isLeadReviewStatus(submission.status);
}

export function canPerformSubmissionPipelineAction(
  submission: Pick<Submission, 'status' | 'submittedBy'> | null | undefined,
  viewer: Viewer,
): boolean {
  return canActOnSubmission(submission, viewer) || canForwardLeadSubmission(submission, viewer);
}
