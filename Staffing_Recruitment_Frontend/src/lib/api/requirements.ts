// API functions for requirements
import type { Requirement, RequirementStatus, Recruiter } from '@/lib/domain/requirements/types';
import {
  normalizeRequirementAssignment,
  normalizeRequirementStatus,
} from '@/lib/domain/requirements/logic';
import { getPublicApiBase } from '@/lib/publicOrigin';

function normalizeRequirementFromApi(raw: Record<string, unknown>): Requirement {
  const ownerRaw = raw.owner as Record<string, unknown> | undefined;
  const activeAssigneeId =
    typeof raw.activeAssigneeId === 'string' ? raw.activeAssigneeId.trim() : '';
  const primaryOwnerId =
    (typeof raw.primaryOwnerId === 'string' && raw.primaryOwnerId.trim()) ||
    activeAssigneeId ||
    '';
  const ownerId =
    (typeof ownerRaw?.id === 'string' && ownerRaw.id.trim()) ||
    primaryOwnerId ||
    '';
  const ownerName =
    (typeof ownerRaw?.name === 'string' && ownerRaw.name.trim()) ||
    (typeof raw.assignedToRecruiterName === 'string' ? raw.assignedToRecruiterName.trim() : '') ||
    '';
  const ownerEmail = typeof ownerRaw?.email === 'string' ? ownerRaw.email : '';
  const ownerTitle =
    (typeof ownerRaw?.title === 'string' && ownerRaw.title) || 'Recruiter';

  const assignedRecruitersRaw = raw.assignedRecruiters;
  const assignedRecruiters = Array.isArray(assignedRecruitersRaw)
    ? assignedRecruitersRaw
        .map((rec) => {
          const row = rec as Record<string, unknown>;
          const id = typeof row.id === 'string' ? row.id.trim() : '';
          const name = typeof row.name === 'string' ? row.name.trim() : '';
          if (!id && !name) return null;
          return {
            id,
            name,
            email: typeof row.email === 'string' ? row.email : '',
            title: typeof row.title === 'string' ? row.title : 'Recruiter',
          } as Recruiter;
        })
        .filter((r): r is Recruiter => r != null)
    : undefined;

  const activeAssigneeIdsRaw = raw.activeAssigneeIds;
  const activeAssigneeIds = Array.isArray(activeAssigneeIdsRaw)
    ? activeAssigneeIdsRaw
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .filter((v) => v.length > 0)
    : assignedRecruiters?.map((rec) => rec.id).filter((v) => v.length > 0);

  const assignedOnRaw = raw.assignedOn;
  const assignedOn =
    typeof assignedOnRaw === 'string' && assignedOnRaw.trim()
      ? assignedOnRaw.trim()
      : assignedOnRaw === null
        ? null
        : undefined;

  return {
    ...(raw as unknown as Requirement),
    assignment: normalizeRequirementAssignment(raw.assignment),
    status: normalizeRequirementStatus(raw.status),
    assignedOn,
    activeAssigneeId: activeAssigneeId || primaryOwnerId || ownerId || null,
    primaryOwnerId: primaryOwnerId || ownerId || null,
    owner: {
      id: ownerId,
      name: ownerName,
      email: ownerEmail,
      title: ownerTitle,
    },
    assignedRecruiters,
    activeAssigneeIds,
  } as Requirement;
}

export type RequirementsQueryFilters = {
  status?: string;
  recruiterId?: string;
  client?: string;
  /** Filter by `clients.id` (FK on requirements). */
  clientId?: string;
  requirementId?: string;
  role?: string;
  owner?: string;
  limit?: number;
  offset?: number;
  today?: boolean;
  source?: 'email' | 'manual' | 'all';
};

function requireToken(): string {
  const token = localStorage.getItem('token');
  if (!token || token === 'null' || token === 'undefined') {
    throw new Error('Not authenticated. Please log in again.');
  }
  return token;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(response: Response, fallbackMs: number): number {
  const raw = response.headers.get('retry-after');
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return Math.min(12000, n * 1000);
  return fallbackMs;
}

async function throwIfUnauthorized(res: Response): Promise<void> {
  if (res.status !== 401) return;
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('authUser');
  } catch {
    // ignore
  }
  const body = await res.json().catch(() => ({} as any));
  const msg =
    typeof (body as any)?.message === 'string' && (body as any).message
      ? (body as any).message
      : 'Unauthorized';
  throw new Error(`${msg}. Please log in again.`);
}

export async function getRequirements(filters?: RequirementsQueryFilters): Promise<Requirement[]> {
  try {
    const qs = new URLSearchParams();
    if (filters?.status) qs.set('status', filters.status);
    if (filters?.recruiterId) qs.set('recruiterId', filters.recruiterId);
    if (filters?.client) qs.set('client', filters.client);
    if (filters?.clientId) qs.set('clientId', filters.clientId);
    if (filters?.requirementId) qs.set('requirementId', filters.requirementId);
    if (filters?.role) qs.set('role', filters.role);
    if (filters?.owner) qs.set('owner', filters.owner);
    if (typeof filters?.limit === 'number' && Number.isFinite(filters.limit)) {
      qs.set('limit', String(Math.max(1, Math.floor(filters.limit))));
    }
    if (typeof filters?.offset === 'number' && Number.isFinite(filters.offset)) {
      qs.set('offset', String(Math.max(0, Math.floor(filters.offset))));
    }
    if (filters?.today) qs.set('today', 'true');
    if (filters?.source && filters.source !== 'all') qs.set('source', filters.source);
    const query = qs.toString();
    const url = `${getPublicApiBase()}/api/requirements${query ? `?${query}` : ''}`;

    const token = requireToken();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      await throwIfUnauthorized(response);
      if (!response.ok) {
        if (response.status === 429 && attempt < 2) {
          await sleep(retryAfterMs(response, 700 * (attempt + 1)));
          continue;
        }
        const errorData = await response.json().catch(() => ({}));
        const detail =
          typeof errorData.message === 'string' && errorData.message
            ? errorData.message
            : response.statusText;
        throw new Error(`Failed to fetch requirements: ${detail}`);
      }

      const data = await response.json();
      const rows = (data.data?.requirements || []) as Record<string, unknown>[];
      return rows.map((row) => normalizeRequirementFromApi(row));
    }
    return [];
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === 'Failed to fetch' || msg.includes('NetworkError')) {
      console.error(
        'Cannot reach backend API. Ensure the backend is running: cd backend && npm run dev',
        error,
      );
      throw new Error(
        'Backend server is not reachable. Start it with: cd backend && npm run dev',
      );
    }
    console.error('Error fetching requirements:', error);
    throw error;
  }
}

export async function createRequirement(input: any, updatedBy: string): Promise<Requirement> {
  try {
    const token = requireToken();
    const response = await fetch(`${getPublicApiBase()}/api/requirements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...input, updatedBy }),
    });

    await throwIfUnauthorized(response);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to create requirement: ${response.statusText}`);
    }

    const data = await response.json();
    return normalizeRequirementFromApi((data.data ?? {}) as Record<string, unknown>);
  } catch (error) {
    console.error('Error creating requirement:', error);
    throw error;
  }
}

export async function getRequirement(id: string): Promise<Requirement> {
  const token = requireToken();
  const response = await fetch(`${getPublicApiBase()}/api/requirements/${id}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  await throwIfUnauthorized(response);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to load requirement: ${response.statusText}`);
  }

  const data = await response.json();
  return normalizeRequirementFromApi((data.data ?? {}) as Record<string, unknown>);
}

export async function updateRequirement(
  id: string,
  input: Record<string, unknown>,
  updatedBy: string,
): Promise<Requirement> {
  const token = requireToken();
  const response = await fetch(`${getPublicApiBase()}/api/requirements/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...input, updatedBy }),
  });

  await throwIfUnauthorized(response);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to update requirement: ${response.statusText}`);
  }

  const data = await response.json();
  return normalizeRequirementFromApi((data.data ?? {}) as Record<string, unknown>);
}

export async function updateRequirementStatus(id: string, status: RequirementStatus, updatedBy: string): Promise<Requirement> {
  // TODO: Replace with actual API call
  throw new Error('API not implemented');
}

export async function assignRequirement(id: string, owner: Recruiter, updatedBy: string): Promise<Requirement> {
  try {
    const response = await fetch(`${getPublicApiBase()}/api/requirements/${id}/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({ owner }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to assign requirement: ${response.statusText}`);
    }

    const data = await response.json();
    return normalizeRequirementFromApi((data.data ?? {}) as Record<string, unknown>);
  } catch (error) {
    console.error('Error assigning requirement:', error);
    throw error;
  }
}

export type RequirementAssignmentRow = {
  id: string;
  requirementId: string;
  recruiterId: string;
  assignedBy: string;
  assignedOn: string;
  status: string;
  notes: string | null;
  recruiterName: string;
  recruiterEmail: string;
  assignerName: string;
};

export type RequirementActivityRow = {
  id: string;
  requirementId: string;
  action: string;
  summary: string;
  metadata: unknown;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
};

export async function getRequirementActivities(requirementId: string): Promise<RequirementActivityRow[]> {
  const res = await fetch(`${getPublicApiBase()}/api/requirements/${requirementId}/activity`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to load activity (${res.status})`);
  }
  const body = await res.json();
  return body.data?.activities ?? [];
}

export async function addRequirementActivity(
  requirementId: string,
  input: { action: string; summary: string; metadata?: unknown },
): Promise<void> {
  const res = await fetch(`${getPublicApiBase()}/api/requirements/${requirementId}/activity`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to log activity (${res.status})`);
  }
}

export type CommunicationLogRow = {
  id: string;
  type: string;
  recipient: string;
  subject: string | null;
  status: string;
  providerMessageId: string | null;
  submissionId: string | null;
  createdAt: string;
  bodyPreview: string | null;
};

export async function getRequirementCommunications(requirementId: string): Promise<CommunicationLogRow[]> {
  const res = await fetch(
    `${getPublicApiBase()}/api/requirements/${encodeURIComponent(requirementId)}/communications`,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to load communications (${res.status})`);
  }
  const body = await res.json();
  return body.data?.communications ?? [];
}

export async function getRequirementAssignments(
  requirementId: string,
  options?: { limit?: number; offset?: number },
): Promise<RequirementAssignmentRow[]> {
  const qs = new URLSearchParams();
  if (typeof options?.limit === 'number' && Number.isFinite(options.limit)) {
    qs.set('limit', String(Math.max(1, Math.floor(options.limit))));
  }
  if (typeof options?.offset === 'number' && Number.isFinite(options.offset)) {
    qs.set('offset', String(Math.max(0, Math.floor(options.offset))));
  }
  const url = `${getPublicApiBase()}/api/requirements/${requirementId}/assignments${
    qs.toString() ? `?${qs.toString()}` : ''
  }`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to load assignments (${res.status})`);
  }
  const body = await res.json();
  return body.data?.assignments ?? [];
}

export async function downloadRequirementSourceEmailPdf(requirementInternalId: string): Promise<void> {
  const token = requireToken();
  const res = await fetch(
    `${getPublicApiBase()}/api/requirements/${encodeURIComponent(requirementInternalId)}/source-email-pdf`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  await throwIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({} as { message?: string }));
    throw new Error(
      typeof err.message === 'string' && err.message
        ? err.message
        : `Failed to download source email PDF (${res.status})`,
    );
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = `source-email-${requirementInternalId}.pdf`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type RevokeRequirementOptions = {
  recruiterIds?: string[];
  assignmentIds?: string[];
};

export async function revokeRequirement(
  id: string,
  _updatedBy: string,
  options?: RevokeRequirementOptions,
): Promise<Requirement> {
  try {
    const response = await fetch(`${getPublicApiBase()}/api/requirements/${id}/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({
        ...(options?.recruiterIds?.length ? { recruiterIds: options.recruiterIds } : {}),
        ...(options?.assignmentIds?.length ? { assignmentIds: options.assignmentIds } : {}),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to revoke requirement: ${response.statusText}`);
    }

    const data = await response.json();
    return normalizeRequirementFromApi((data.data ?? {}) as Record<string, unknown>);
  } catch (error) {
    console.error('Error revoking requirement:', error);
    throw error;
  }
}

export type RequirementEmailThreadParticipants = {
  subject: string;
  to: string[];
  /** To recipients with Graph display names when available. */
  toParticipants?: Array<{ address: string; name?: string }>;
  cc: string[];
  bcc: string[];
  graphMessageId: string | null;
  mailbox: string | null;
};

export async function getRequirementEmailThreadParticipants(
  requirementId: string,
  options?: { sourceEmailSubject?: string },
): Promise<RequirementEmailThreadParticipants> {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('Not authenticated. Please log in again.');

  const qs = new URLSearchParams();
  const subject = options?.sourceEmailSubject?.trim();
  if (subject) qs.set('sourceEmailSubject', subject);
  const query = qs.toString();

  const response = await fetch(
    `${getPublicApiBase()}/api/requirements/${encodeURIComponent(requirementId)}/email-thread-participants${query ? `?${query}` : ''}`,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      typeof (body as { message?: string }).message === 'string'
        ? (body as { message: string }).message
        : 'Failed to load email thread participants',
    );
  }
  const data = await response.json();
  const row = (data.data ?? {}) as RequirementEmailThreadParticipants;
  return {
    subject: String(row.subject ?? ''),
    to: Array.isArray(row.to) ? row.to.map(String) : [],
    toParticipants: Array.isArray(row.toParticipants)
      ? row.toParticipants.map((p) => ({
          address: String((p as { address?: string }).address ?? ''),
          name: (p as { name?: string }).name ? String((p as { name?: string }).name) : undefined,
        }))
      : undefined,
    cc: Array.isArray(row.cc) ? row.cc.map(String) : [],
    bcc: Array.isArray(row.bcc) ? row.bcc.map(String) : [],
    graphMessageId: row.graphMessageId ?? null,
    mailbox: row.mailbox ?? null,
  };
}
