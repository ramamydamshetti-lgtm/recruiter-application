/** Client-side auth session helpers — prevent cross-user data bleed on login/logout. */

import { clearAllFormDrafts } from '@/lib/formDrafts';

export const AUTH_TOKEN_KEY = 'token';
export const AUTH_USER_KEY = 'authUser';

/** Legacy global keys (cleared on session change; prefer per-user keys below). */
const LEGACY_PROFILE_KEYS = ['profile_editable', 'profile_photo'] as const;

export const AUTH_SESSION_CHANGED = 'auth-session-changed';
export const AUTH_SESSION_CLEARED = 'auth-session-cleared';

export function profileStorageKey(userId: string): string {
  return `profile_editable_${userId}`;
}

export function profilePhotoStorageKey(userId: string): string {
  return `profile_photo_${userId}`;
}

/** Remove cached auth/profile data from the previous user. */
export function clearClientSessionStorage(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  for (const key of LEGACY_PROFILE_KEYS) {
    localStorage.removeItem(key);
  }
  clearAllFormDrafts();
  sessionStorage.clear();
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_CLEARED));
}

export function persistAuthSession(user: unknown, token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_CHANGED));
}

/** Wipe prior session, then store the new user token (call after successful login/register). */
export function beginAuthSession(user: unknown, token: string): void {
  clearClientSessionStorage();
  persistAuthSession(user, token);
}
