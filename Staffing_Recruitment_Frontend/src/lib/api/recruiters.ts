// API functions for recruiters
import type { Recruiter } from '@/lib/domain/requirements/types';
import { normalizeAppRole } from '@/lib/auth/roles';
import { getPublicApiBase } from '@/lib/publicOrigin';

function normalizeRecruiter(raw: Record<string, unknown>): Recruiter {
  const firstName = String(raw.firstName ?? '').trim();
  const lastName = String(raw.lastName ?? '').trim();
  const email = String(raw.email ?? '').trim();
  const name =
    String(raw.name ?? '').trim() ||
    [firstName, lastName].filter(Boolean).join(' ') ||
    email;
  const role = normalizeAppRole(String(raw.role ?? '').trim());
  const title = String(raw.title ?? '').trim() || role;
  return {
    ...raw,
    id: String(raw.id ?? ''),
    email,
    name,
    title,
    role,
  } as Recruiter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(response: Response, fallbackMs: number): number {
  const raw = response.headers.get('retry-after');
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return Math.min(10000, n * 1000);
  return fallbackMs;
}

export async function getRecruiters(): Promise<Recruiter[]> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${getPublicApiBase()}/api/recruiters?limit=100`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        if (response.status === 429 && attempt < 2) {
          await sleep(retryAfterMs(response, 600 * (attempt + 1)));
          continue;
        }
        throw new Error(`Failed to fetch recruiters: ${response.statusText}`);
      }

      const data = await response.json();
      const rows = data.data?.recruiters;
      if (!Array.isArray(rows)) return [];
      return rows.map((row: Record<string, unknown>) => normalizeRecruiter(row));
    }
    return [];
  } catch (error) {
    console.error('Error fetching recruiters:', error);
    throw error;
  }
}

export async function getRecruiterById(id: string): Promise<Recruiter | null> {
  try {
    const response = await fetch(`${getPublicApiBase()}/api/recruiters/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Failed to fetch recruiter: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || null;
  } catch (error) {
    console.error('Error fetching recruiter:', error);
    throw error;
  }
}

export async function updateRecruiterProfile(id: string, profileData: Partial<Recruiter>): Promise<Recruiter> {
  try {
    const response = await fetch(`${getPublicApiBase()}/api/recruiters/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify(profileData),
    });

    if (!response.ok) {
      throw new Error(`Failed to update recruiter profile: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('Error updating recruiter profile:', error);
    throw error;
  }
}
