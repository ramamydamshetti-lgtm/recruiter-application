import { getPublicApiBase } from '@/lib/publicOrigin';

export type InterviewRecord = {
  id: string;
  submissionId: string;
  recruiterId: string;
  round: string;
  mode: string;
  status: string;
  scheduledAt: string;
  location: string | null;
  meetingLink: string | null;
  notes: string | null;
  feedback: string | null;
  rating: number | null;
  /** API may return Prisma enum strings (e.g. SELECTED) or frontend labels (Selected). */
  finalDecision: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  candidate: { id: string; name: string; email: string; phone: string | null };
  requirement: { id: string; requirementId: string | null; roleTitle: string; clientName: string };
};

export async function getInterviews(filters?: {
  submissionId?: string;
  recruiterId?: string;
  requirementId?: string;
  limit?: number;
}): Promise<InterviewRecord[]> {
  const qs = new URLSearchParams();
  if (filters?.submissionId) qs.set('submissionId', filters.submissionId);
  if (filters?.recruiterId) qs.set('recruiterId', filters.recruiterId);
  if (filters?.requirementId) qs.set('requirementId', filters.requirementId);
  if (typeof filters?.limit === 'number') qs.set('limit', String(filters.limit));
  const query = qs.toString();
  const url = `${getPublicApiBase()}/api/interviews${query ? `?${query}` : ''}`;

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
  });

  if (!response.ok) {
    // Several screens (MyWorkPage, TeamWorkPage, InterviewTrackingPage stats
    // tile) only need a coarse interview count for dashboard cards. A
    // transient 429 from the global API rate-limiter — typically caused by
    // dashboard auto-refresh polling colliding with hot-reload re-mounts —
    // should NOT crash the rendering of those screens. We therefore degrade
    // gracefully on 429 by returning an empty list and logging a warning,
    // letting the next render cycle (or page load) try again on its own.
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') ?? response.headers.get('RateLimit-Reset');
      console.warn(
        `[interviews] /api/interviews rate-limited (429). Returning empty list for this call.${
          retryAfter ? ` Retry-After=${retryAfter}` : ''
        } Consider raising RATE_LIMIT_MAX on the backend or reducing the dashboard auto-refresh frequency.`,
      );
      return [];
    }
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to fetch interviews: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data?.interviews || [];
}

export async function createInterview(input: {
  submissionId: string;
  round: string;
  mode: string;
  status: string;
  scheduledAt: string;
  location?: string | null;
  meetingLink?: string | null;
  notes?: string | null;
  timezone?: string | null;
  interviewerName?: string | null;
  interviewerEmail?: string | null;
}): Promise<InterviewRecord> {
  const response = await fetch(`${getPublicApiBase()}/api/interviews`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to create interview: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data as InterviewRecord;
}

export async function updateInterview(
  id: string,
  input: {
    round?: string;
    mode?: string;
    status?: string;
    scheduledAt?: string;
    location?: string | null;
    meetingLink?: string | null;
    notes?: string | null;
    feedback?: string;
    rating?: number | null;
    finalDecision?: string | null;
  },
): Promise<void> {
  const response = await fetch(`${getPublicApiBase()}/api/interviews/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to update interview: ${response.statusText}`);
  }
}

export async function deleteInterview(id: string): Promise<void> {
  const response = await fetch(`${getPublicApiBase()}/api/interviews/${id}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to delete interview: ${response.statusText}`);
  }
}

