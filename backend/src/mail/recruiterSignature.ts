/**
 * Display title for outbound mail signatures (no per-user job title in DB; role is the source of truth).
 */
export function userRoleToRecruiterTitle(role: string): string {
  switch (role) {
    case 'ADMIN':
      return 'Administrator';
    case 'LEAD':
      return 'Lead Recruiter';
    case 'RECRUITER':
      return 'Recruiter';
    default:
      return 'Recruiter';
  }
}
