import { getPublicApiBase } from '@/lib/publicOrigin';

export type ClientRecord = {
  id: string;
  clientCode?: string | null;
  name: string;
  pocName: string;
  pocEmail: string;
  pocPhone: string | null;
  industry: string | null;
  location: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
  };
}

export async function getClients(search?: string): Promise<ClientRecord[]> {
  const qs = new URLSearchParams();
  if (search?.trim()) qs.set('search', search.trim());
  const q = qs.toString();
  const res = await fetch(`${getPublicApiBase()}/api/clients${q ? `?${q}` : ''}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to load clients (${res.status})`);
  }
  const body = await res.json();
  return body.data?.clients ?? [];
}

export async function getClient(id: string): Promise<{
  client: ClientRecord;
  counts: { requirements: number; submissions: number; selectedSubmissions: number };
}> {
  const res = await fetch(`${getPublicApiBase()}/api/clients/${id}`, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to load client (${res.status})`);
  }
  const body = await res.json();
  return body.data;
}

export async function createClient(input: {
  name: string;
  pocName: string;
  pocEmail: string;
  pocPhone?: string;
  industry?: string;
  location?: string;
}): Promise<ClientRecord> {
  const res = await fetch(`${getPublicApiBase()}/api/clients`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to create client (${res.status})`);
  }
  const body = await res.json();
  return body.data.client;
}

export async function updateClient(
  id: string,
  input: Partial<{
    name: string;
    pocName: string;
    pocEmail: string;
    pocPhone: string | null;
    industry: string | null;
    location: string | null;
    isActive: boolean;
  }>,
): Promise<ClientRecord> {
  const res = await fetch(`${getPublicApiBase()}/api/clients/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to update client (${res.status})`);
  }
  const body = await res.json();
  return body.data.client;
}
