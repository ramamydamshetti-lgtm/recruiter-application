import { getPublicApiBase } from '@/lib/publicOrigin';

export type InterviewRoundApiRow = {
  id: string;
  submissionId: string;
  legacyInterviewId: string | null;
  roundType: 'L1' | 'L2' | 'FINAL';
  timezone: string | null;
  interviewerName: string | null;
  interviewerEmail: string | null;
  mode: string;
  status: string;
  scheduledAt: string;
  location: string | null;
  meetingLink: string | null;
  rescheduleCount: number;
  candidateName?: string;
};

export async function getInterviewRoundsForRequirement(requirementInternalId: string): Promise<InterviewRoundApiRow[]> {
  const qs = new URLSearchParams();
  qs.set('requirementId', requirementInternalId);
  const response = await fetch(`${getPublicApiBase()}/api/interview-rounds?${qs.toString()}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to load interview rounds: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data?.interviewRounds ?? [];
}
