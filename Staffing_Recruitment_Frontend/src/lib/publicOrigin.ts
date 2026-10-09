/**
 * Base URL segment for browser API calls (no trailing slash). Empty string means same-origin
 * `/api/...`, which Next.js `rewrites` forward to the Express API (`next.config.js` → :8080 in dev).
 *
 * **Always prefer same-origin in the browser** so sign-up, OTP, and login use one backend and one
 * `DATABASE_URL`. Using `NEXT_PUBLIC_APP_URL` as an absolute fetch target on a custom host often
 * breaks that (e.g. `http://` in env vs `https://` in the address bar → mixed content, or a proxy
 * that only forwards same-origin `/api`).
 *
 * Set `NEXT_PUBLIC_USE_REMOTE_API=true` and `NEXT_PUBLIC_APP_URL` or `NEXT_PUBLIC_API_URL` only when
 * the API truly lives on another origin than this Next app.
 */
export function getPublicApiBase(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_API_URL || '')
    .trim()
    .replace(/\/+$/, '');

  if (typeof window !== 'undefined') {
    const forceRemote = process.env.NEXT_PUBLIC_USE_REMOTE_API === 'true';
    if (!forceRemote) {
      return '';
    }
    return raw;
  }

  // SSR / server-side: no relative origin; talk to API directly (local or configured).
  if (!raw) {
    return 'http://localhost:8080';
  }
  return raw;
}
