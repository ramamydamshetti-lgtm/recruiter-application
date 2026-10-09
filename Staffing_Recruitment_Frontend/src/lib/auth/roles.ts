/**
 * Phase 1: recruiters are the default app role; Admin / Lead retain elevated access.
 */

export type AppRole = 'Recruiter' | 'Admin' | 'Lead';

export const APP_ROLE: AppRole = 'Recruiter';

/** Normalize API role strings to app roles. */
export function normalizeAppRole(role?: string | null): AppRole {
  const r = String(role ?? '').trim().toUpperCase();
  if (r === 'ADMIN' || r === 'SUPERADMIN' || r === 'SUPER_ADMIN') return 'Admin';
  if (r === 'LEAD') return 'Lead';
  return APP_ROLE;
}

/** All signed-in staff can view team-level reports and metrics. */
export function canViewTeamData(_role?: string | null): boolean {
  return true;
}

/** All signed-in staff can drill down from recruiter report counts. */
export function canDrillDownReports(_role?: string | null): boolean {
  return true;
}

/** Signed-in staff can drill down from client performance counts (Reports page). */
export function canDrillDownClientReports(_role?: string | null): boolean {
  return true;
}

export function isLeadRole(role?: string | null): boolean {
  return normalizeAppRole(role) === 'Lead' || normalizeAppRole(role) === 'Admin';
}

export function isRecruiterOnlyRole(role?: string | null): boolean {
  return normalizeAppRole(role) === 'Recruiter';
}
