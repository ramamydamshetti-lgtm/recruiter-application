import type { CandidateSubmission } from '@/lib/domain/candidates/types';
export {
  canScheduleInterviewForStatus,
  isAnySubmittedStatus,
  isClientSubmittedStatus,
  isLeadReviewStatus,
  isSubmittedToClientLaneStatus,
  submissionStageFromStatus,
} from './status';

export function findSubmissionForJd(
  submissions: CandidateSubmission[],
  candidateId: string,
  jdId: string,
  matchIdentity?: (candidateId: string) => boolean,
): CandidateSubmission | undefined {
  return submissions.find((submission) => {
    if (submission.jdId !== jdId) return false;
    if (submission.candidateId === candidateId) return true;
    return matchIdentity ? matchIdentity(submission.candidateId) : false;
  });
}
