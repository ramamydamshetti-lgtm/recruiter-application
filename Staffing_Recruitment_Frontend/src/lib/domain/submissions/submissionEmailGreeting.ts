export const DEFAULT_SUBMISSION_EMAIL_INTRODUCTION = `I hope you are doing well.

Please find below the candidate profile submitted for your review against the discussed requirement.

Kindly review the profile and share your feedback. We will be happy to coordinate the next steps based on your evaluation.`;

export function deriveNameFromEmail(email: string): string {
  const local = (email.split('@')[0] ?? '').trim();
  if (!local) return '';
  return local
    .replace(/[._-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function resolveRecipientFirstName(email: string, nameByEmail?: Record<string, string>): string {
  const key = email.trim().toLowerCase();
  const mapped = nameByEmail?.[key]?.trim();
  const display = mapped || deriveNameFromEmail(email);
  const first = display.split(/\s+/).filter(Boolean)[0];
  return first || 'Team';
}

export function buildSubmissionEmailGreeting(
  toEmails: string[],
  nameByEmail?: Record<string, string>,
): string {
  const emails = [...new Set(toEmails.map((e) => e.trim()).filter(Boolean))];
  if (emails.length === 0) return 'Dear Team,';
  if (emails.length >= 3) return 'Dear Team,';

  const names = emails.map((e) => resolveRecipientFirstName(e, nameByEmail));
  if (emails.length === 1) return `Dear ${names[0]},`;
  return `Dear ${names[0]} and ${names[1]},`;
}
