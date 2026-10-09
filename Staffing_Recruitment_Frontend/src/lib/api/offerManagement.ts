import { getPublicApiBase } from '@/lib/publicOrigin';

export type OfferManagementApiRow = {
  id: string;
  submissionId: string;
  status: string;
  offeredCtc: string | null;
  currency: string | null;
  hrNotes: string | null;
  offerExpiryDate: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  compensation: string | null;
  joiningDate: string | null;
  candidateName?: string;
};

export async function getOfferManagementForRequirement(requirementInternalId: string): Promise<OfferManagementApiRow[]> {
  const qs = new URLSearchParams();
  qs.set('requirementId', requirementInternalId);
  const response = await fetch(`${getPublicApiBase()}/api/offer-management?${qs.toString()}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to load offer management rows: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data?.offers ?? [];
}
