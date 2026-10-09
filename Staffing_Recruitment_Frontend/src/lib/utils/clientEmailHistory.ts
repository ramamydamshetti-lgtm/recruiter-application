const STORAGE_KEY = 'submission_client_email_history';
const MAX_HISTORY = 40;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidClientEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function loadClientEmailHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is string => typeof entry === 'string' && isValidClientEmail(entry))
      .slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

/** Merge new emails into history (most recent first) and persist. Returns updated list. */
export function rememberClientEmails(emails: string[]): string[] {
  if (typeof window === 'undefined') return loadClientEmailHistory();

  const incoming = emails.map((e) => e.trim()).filter((e) => isValidClientEmail(e));
  const previous = loadClientEmailHistory();
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const email of [...incoming, ...previous]) {
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(email);
  }

  const next = merged.slice(0, MAX_HISTORY);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
