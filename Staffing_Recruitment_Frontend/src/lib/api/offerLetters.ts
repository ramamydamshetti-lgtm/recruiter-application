import { getPublicApiBase } from '@/lib/publicOrigin';

export type OfferLetterStatus = 'DRAFT' | 'RELEASED' | 'ACCEPTED' | 'DECLINED';

export type OfferLetterRecord = {
  id: string;
  submissionId: string;
  status: OfferLetterStatus;
  positionTitle: string | null;
  compensation: string | null;
  joiningDate: string | null;
  validUntil: string | null;
  terms: string | null;
  letterContent: string | null;
  releasedAt: string | null;
  /** Agreed joining date after the candidate accepts (internal). */
  acceptedJoiningDate: string | null;
  declineReason: string | null;
  releasedBy: { id: string; name: string; email: string } | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type OfferLetterInput = {
  positionTitle?: string | null;
  compensation?: string | null;
  joiningDate?: string | null;
  validUntil?: string | null;
  terms?: string | null;
  letterContent?: string | null;
};

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  };
}

export async function getOfferLetterBySubmission(
  submissionId: string,
): Promise<OfferLetterRecord | null> {
  const response = await fetch(
    `${getPublicApiBase()}/api/offer-letters/by-submission/${encodeURIComponent(submissionId)}`,
    { headers: authHeaders() },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to load offer letter: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data?.offerLetter ?? null;
}

export async function saveOfferLetterDraft(
  submissionId: string,
  input: OfferLetterInput,
): Promise<OfferLetterRecord> {
  const response = await fetch(
    `${getPublicApiBase()}/api/offer-letters/by-submission/${encodeURIComponent(submissionId)}`,
    {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(input),
    },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to save offer letter: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data.offerLetter as OfferLetterRecord;
}

export type ReleaseOfferLetterResult = {
  offerLetter: OfferLetterRecord;
  emailSent: boolean;
  emailError?: string;
};

export async function releaseOfferLetter(
  submissionId: string,
  input: OfferLetterInput,
): Promise<ReleaseOfferLetterResult> {
  const response = await fetch(
    `${getPublicApiBase()}/api/offer-letters/by-submission/${encodeURIComponent(submissionId)}/release`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(input),
    },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to release offer letter: ${response.statusText}`);
  }

  const result = await response.json();
  const data = result.data ?? {};
  return {
    offerLetter: data.offerLetter as OfferLetterRecord,
    emailSent: Boolean(data.emailSent),
    emailError: typeof data.emailError === 'string' ? data.emailError : undefined,
  };
}

export async function batchGetOfferLettersBySubmissions(
  submissionIds: string[],
): Promise<Record<string, OfferLetterRecord>> {
  const response = await fetch(`${getPublicApiBase()}/api/offer-letters/batch-by-submissions`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ submissionIds }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to load offer letters: ${response.statusText}`);
  }

  const result = await response.json();
  return (result.data?.offers ?? {}) as Record<string, OfferLetterRecord>;
}

export async function recordOfferLetterResponse(
  submissionId: string,
  input:
    | { decision: 'accept'; acceptedJoiningDate: string }
    | { decision: 'decline'; declineReason: string },
): Promise<OfferLetterRecord> {
  const body =
    input.decision === 'accept'
      ? { decision: 'accept', acceptedJoiningDate: input.acceptedJoiningDate }
      : { decision: 'decline', declineReason: input.declineReason };

  const response = await fetch(
    `${getPublicApiBase()}/api/offer-letters/by-submission/${encodeURIComponent(submissionId)}/record-response`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to save offer response: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data.offerLetter as OfferLetterRecord;
}
