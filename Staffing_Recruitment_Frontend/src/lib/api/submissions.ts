// API functions for submissions
import type { Submission } from '@/lib/domain/submissions/types';
import { dedupeSubmissionsByCandidateRequirement } from '@/lib/domain/submissions/dedupe';
import { getPublicApiBase } from '@/lib/publicOrigin';

export type SubmissionsQueryFilters = {
  status?: string;
  submittedById?: string;
  requirementId?: string;
  candidate?: string;
  /** When `team`, returns all recruiters' submissions (used by Submissions + Reports pages). */
  scope?: 'team';
  limit?: number;
};

export async function getSubmissions(filters?: SubmissionsQueryFilters): Promise<Submission[]> {
  const qs = new URLSearchParams();
  if (filters?.status) qs.set('status', filters.status);
  if (filters?.submittedById) qs.set('submittedById', filters.submittedById);
  if (filters?.requirementId) qs.set('requirementId', filters.requirementId);
  if (filters?.candidate) qs.set('candidate', filters.candidate);
  if (filters?.scope === 'team') qs.set('scope', 'team');
  if (filters?.limit != null && Number.isFinite(filters.limit)) {
    qs.set('limit', String(Math.min(500, Math.max(1, filters.limit))));
  }
  const query = qs.toString();
  const url = `${getPublicApiBase()}/api/submissions${query ? `?${query}` : ''}`;

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch submissions: ${response.statusText}`);
  }

  const result = await response.json();
  const list: any[] = result.data?.submissions || [];
  const normalized = list.map((s) => ({
    ...s,
    rejectionReason: s?.rejectionReason ?? s?.rejection_reason ?? null,
    emailSent: s?.emailSent ?? s?.email_sent ?? false,
    emailSentDate: s?.emailSentDate ?? s?.email_sent_date ?? null,
  }));
  return dedupeSubmissionsByCandidateRequirement(normalized);
}

export type PatchSubmissionBody = {
  status: string;
  rejectionReason?: string | null;
  comments?: string | null;
};

export async function patchSubmission(submissionId: string, body: PatchSubmissionBody): Promise<Submission> {
  const response = await fetch(`${getPublicApiBase()}/api/submissions/${encodeURIComponent(submissionId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to update submission: ${response.statusText}`);
  }

  const result = await response.json();
  const s = result.data?.submission;
  if (!s) throw new Error('Invalid submission response');
  return {
    ...s,
    rejectionReason: s?.rejectionReason ?? s?.rejection_reason ?? null,
    emailSent: s?.emailSent ?? s?.email_sent ?? false,
    emailSentDate: s?.emailSentDate ?? s?.email_sent_date ?? null,
  };
}

export type StatusHistoryRow = {
  id: string;
  submissionId: string;
  oldStatus: string | null;
  newStatus: string;
  reason: string | null;
  metadata: unknown;
  createdAt: string;
  changedBy: { id: string; name: string; email: string } | null;
};

export async function getSubmissionStatusHistory(submissionId: string): Promise<StatusHistoryRow[]> {
  const response = await fetch(
    `${getPublicApiBase()}/api/submissions/${encodeURIComponent(submissionId)}/status-history`,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to load status history: ${response.statusText}`);
  }

  const result = await response.json();
  return (result.data?.rows ?? []) as StatusHistoryRow[];
}

export async function forwardSubmissionToClient(submissionId: string): Promise<Submission> {
  const response = await fetch(
    `${getPublicApiBase()}/api/submissions/${encodeURIComponent(submissionId)}/forward-to-client`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to forward submission: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data?.submission;
}

export async function addSubmission(input: any): Promise<Submission> {
  const response = await fetch(`${getPublicApiBase()}/api/submissions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to add submission: ${response.statusText}`);
  }

  const result = await response.json();
  const s = result.data?.submission;
  if (!s) return s;
  return {
    ...s,
    rejectionReason: s?.rejectionReason ?? s?.rejection_reason ?? null,
  };
}
