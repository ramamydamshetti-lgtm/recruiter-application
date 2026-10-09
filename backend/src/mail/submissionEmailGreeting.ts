/**
 * Client submission email greeting + intro helpers (recipient-aware).
 */

export const DEFAULT_SUBMISSION_EMAIL_INTRODUCTION = `I hope you are doing well.

Please find below the candidate profile submitted for your review against the discussed requirement.

Kindly review the profile and share your feedback. We will be happy to coordinate the next steps based on your evaluation.`;

export const DEFAULT_SUBMISSION_EMAIL_CLOSING = `Thank you for your time and consideration.

We look forward to your feedback.`;

/** Derive a readable name from an email local part (vinaya.kumar → Vinaya Kumar). */
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

function resolveDisplayName(email: string, nameByEmail?: Record<string, string>): string {
  const key = email.trim().toLowerCase();
  const mapped = nameByEmail?.[key]?.trim();
  if (mapped) return mapped;
  return deriveNameFromEmail(email);
}

/** First given name for greeting (display name or derived). */
export function resolveRecipientFirstName(email: string, nameByEmail?: Record<string, string>): string {
  const display = resolveDisplayName(email, nameByEmail);
  const first = display.split(/\s+/).filter(Boolean)[0];
  return first || 'Team';
}

/**
 * Build greeting from To recipients.
 * 1 recipient → Dear Vinaya,
 * 2 recipients → Dear Vinaya and Praneeth,
 * 3+ → Dear Team,
 */
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

export function parseThreadToRecipientNames(body: Record<string, unknown>): Record<string, string> {
  const raw = body.threadToRecipientNames;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const email = String(key ?? '').trim().toLowerCase();
    const name = typeof value === 'string' ? value.trim() : '';
    if (email && name) out[email] = name;
  }
  return out;
}

export function buildNameMapFromParticipants(
  rows: Array<{ address?: string; name?: string }> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows ?? []) {
    const address = String(row.address ?? '').trim().toLowerCase();
    const name = String(row.name ?? '').trim();
    if (address && name) out[address] = name;
  }
  return out;
}
