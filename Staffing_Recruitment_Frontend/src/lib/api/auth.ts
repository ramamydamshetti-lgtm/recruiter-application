// API functions for authentication
import type { Recruiter } from '@/lib/domain/requirements/types';
import { getPublicApiBase } from '@/lib/publicOrigin';
import {
  AUTH_TOKEN_KEY,
  beginAuthSession,
  clearClientSessionStorage,
} from '@/lib/auth/session';
import { normalizeAppRole } from '@/lib/auth/roles';

/**
 * Base URL for the Express API (no trailing slash).
 * Uses `NEXT_PUBLIC_APP_URL` or `NEXT_PUBLIC_API_URL` when set (e.g. https://www.example.com).
 * When unset in the browser, empty string → same-origin `/api` (Next rewrites to the backend).
 */
export function getApiBaseUrl(): string {
  return getPublicApiBase();
}

function apiBase(): string {
  return getApiBaseUrl();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeAuthUser(raw: Record<string, unknown> | null | undefined): Recruiter | null {
  if (!raw || typeof raw.id !== 'string') return null;
  const firstName = typeof raw.firstName === 'string' ? raw.firstName : '';
  const lastName = typeof raw.lastName === 'string' ? raw.lastName : '';
  const name =
    (typeof raw.name === 'string' && raw.name.trim()) ||
    [firstName, lastName].filter(Boolean).join(' ').trim() ||
    (typeof raw.email === 'string' ? raw.email : '');
  const dbRole = typeof raw.role === 'string' ? raw.role : '';
  const role = normalizeAppRole(dbRole);
  return {
    ...raw,
    id: raw.id,
    name,
    email: typeof raw.email === 'string' ? raw.email : '',
    // `title` mirrors app role for legacy UI; must come from DB role, not a hardcoded default.
    title: role,
    role,
    submittingTo: typeof raw.submittingTo === 'string' ? raw.submittingTo : raw.submittingTo ?? null,
  } as Recruiter;
}

function retryAfterMs(response: Response, fallbackMs: number): number {
  const raw = response.headers.get('retry-after');
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return Math.min(10000, n * 1000);
  return fallbackMs;
}

export async function getCurrentUser(): Promise<Recruiter | null> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
    
    if (!token) {
      return null;
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${apiBase()}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired or invalid, clear it
          if (typeof window !== 'undefined') {
            localStorage.removeItem(AUTH_TOKEN_KEY);
          }
          return null;
        }
        if (response.status === 429 && attempt < 2) {
          await sleep(retryAfterMs(response, 500 * (attempt + 1)));
          continue;
        }
        throw new Error(`Failed to fetch current user: ${response.statusText}`);
      }

      const data = await response.json();
      return normalizeAuthUser(data.data);
    }
    return null;
  } catch (error) {
    console.error('Error fetching current user:', error);
    return null;
  }
}

export async function login(email: string, password: string): Promise<{ user: Recruiter; token: string }> {
  if (typeof window !== 'undefined') {
    clearClientSessionStorage();
  }
  try {
    const response = await fetch(`${apiBase()}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Login failed: ${response.statusText}`);
    }

    const data = await response.json();
    const { user: rawUser, token } = data.data;
    const user = normalizeAuthUser(rawUser)!;

    if (typeof window !== 'undefined') {
      beginAuthSession(user, token);
    }

    return { user, token };
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}

export async function logout(): Promise<void> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
    
    if (token) {
      // Call backend logout endpoint if available
      await fetch(`${apiBase()}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      }).catch(() => {
        // Ignore logout API errors, just clear local storage
      });
    }

    if (typeof window !== 'undefined') {
      clearClientSessionStorage();
    }
  } catch (error) {
    console.error('Logout error:', error);
    if (typeof window !== 'undefined') {
      clearClientSessionStorage();
    }
  }
}

export async function register(userData: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: string;
}): Promise<{ user: Recruiter; token: string }> {
  if (typeof window !== 'undefined') {
    clearClientSessionStorage();
  }
  try {
    const response = await fetch(`${apiBase()}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const fieldErrors = Array.isArray(errorData.data)
        ? errorData.data
            .map((item: { message?: string }) => item.message)
            .filter(Boolean)
            .join(' ')
        : '';
      throw new Error(
        fieldErrors || errorData.message || `Registration failed: ${response.statusText}`,
      );
    }

    const data = await response.json();
    const { user: rawUser, token } = data.data;
    const user = normalizeAuthUser(rawUser)!;

    if (typeof window !== 'undefined') {
      beginAuthSession(user, token);
    }

    return { user, token };
  } catch (error) {
    console.error('Registration error:', error);
    throw error;
  }
}

export async function sendLoginOtp(email: string): Promise<void> {
  const response = await fetch(`${apiBase()}/api/auth/send-login-code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { message?: string }).message || `Failed to send sign-in code: ${response.statusText}`,
    );
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  const response = await fetch(`${apiBase()}/api/auth/forgot-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { message?: string }).message || `Password reset request failed: ${response.statusText}`,
    );
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const response = await fetch(`${apiBase()}/api/auth/reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token, newPassword }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { message?: string }).message || `Password reset failed: ${response.statusText}`,
    );
  }
}

export async function verifyLoginOtp(email: string, code: string): Promise<{ user: Recruiter; token: string }> {
  if (typeof window !== 'undefined') {
    clearClientSessionStorage();
  }
  const response = await fetch(`${apiBase()}/api/auth/login-with-code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, code }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { message?: string }).message || `Sign-in failed: ${response.statusText}`,
    );
  }

  const data = await response.json();
  const { user: rawUser, token } = data.data;
  const user = normalizeAuthUser(rawUser)!;

  if (typeof window !== 'undefined') {
    beginAuthSession(user, token);
  }

  return { user, token };
}
