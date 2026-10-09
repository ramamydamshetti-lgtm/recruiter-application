import { getPublicApiBase } from '@/lib/publicOrigin';

export type MyActiveAssignment = {
  id: string;
  requirementInternalId: string;
  requirementId: string;
  jobTitle: string;
  assignerId: string;
  assignerName: string;
  assignedOn: string;
};

function requireToken(): string {
  const token = localStorage.getItem('token');
  if (!token || token === 'null' || token === 'undefined') {
    throw new Error('Not authenticated. Please log in again.');
  }
  return token;
}

export async function fetchMyActiveAssignments(): Promise<MyActiveAssignment[]> {
  const token = requireToken();
  const res = await fetch(`${getPublicApiBase()}/api/requirements/my-active-assignments`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { message?: string }).message || `Failed to load assignments (${res.status})`,
    );
  }

  const body = (await res.json()) as { data?: { assignments?: MyActiveAssignment[] } };
  return body.data?.assignments ?? [];
}
