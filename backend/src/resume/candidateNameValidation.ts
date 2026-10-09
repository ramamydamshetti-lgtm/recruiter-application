/**
 * Reject résumé section titles / role lines mistaken for person names.
 * Used by parseCoreResumeFields and resume import fallbacks.
 */

const BAD_NAME_EXACT =
  /^(?:career summary|core strengths?|core competencies?|core\s+skills?|key\s+achievements?|achievements?|key\s+accomplishments?|software architecture|key responsibilities handled|of\s+the\s+company|summary|objective|professional summary|personal summary|executive summary|work experience|professional experience|organizations?\s+experience|organizational experience|detailed\s+experience|technical competency|skills|key skills|technical skills|profile summary|career objective|synopsis|declaration|about\s+me|strengths|candidate assessment sheet|st peters engineering college|curriculum\s+vitae|curriculum|vitae|experience\s+summary|work\s+summary|employment\s+summary|professional\s+profile|personal\s+profile|resume|biodata|resume\s+summary|contact\s+details?|personal\s+details?)$/i;

const BAD_ROLE_TITLE_LINE =
  /^(?:salesforce|java|\.net|python|react|angular|boomi|mulesoft|full\s*stack|integration|network|cloud|cyber|data|machine\s*learning|technical|senior|lead|staff|principal)\s+[a-z0-9][a-z0-9\s]+(developer|engineer|consultant|analyst|architect|tester)\b$/i;

/** Words that indicate the “name” is really a section heading or job line. */
const SECTION_OR_ROLE_WORD =
  /\b(?:curriculum|vitae|experience\s+summary|work\s+summary|professional\s+summary|career\s+summary|profile\s+summary|key\s+skills?|technical\s+skills?)\b/i;

const JOB_TITLE_WORDS = new Set(
  [
    'assistant',
    'manager',
    'engineer',
    'developer',
    'consultant',
    'analyst',
    'architect',
    'tester',
    'specialist',
    'lead',
    'senior',
    'junior',
    'employee',
    'central',
    'time',
    'off',
    'instrumentation',
    'instrument',
    'automation',
    'qa',
    'qc',
    'data',
    'azure',
    'cloud',
    'sap',
    'fico',
    'abap',
    'administrator',
    'associate',
    'executive',
    'recruiter',
    'trainer',
    'intern',
    'trainee',
    'officer',
    'supervisor',
    'director',
    'head',
    'vp',
    'professional',
    'technician',
    'programmer',
    'designer',
    'scientist',
  ].map((w) => w.toLowerCase()),
);

export function isBadCandidateDisplayName(name: string | null | undefined): boolean {
  const n = String(name || '').trim();
  if (!n || n.length < 2) return true;
  if (BAD_NAME_EXACT.test(n)) return true;
  if (BAD_ROLE_TITLE_LINE.test(n)) return true;
  if (SECTION_OR_ROLE_WORD.test(n)) return true;
  if (/^\b(?:resume|curriculum vitae|cv)\b/i.test(n)) return true;
  if (/\b(?:resume|curriculum vitae)\s*$/i.test(n)) return true;

  const words = n.split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  // Entire line is only job-title vocabulary (e.g. "Employee Central Time").
  const lowerWords = words.map((w) => w.replace(/[.,]+$/, '').toLowerCase());
  if (words.length >= 2 && lowerWords.every((w) => JOB_TITLE_WORDS.has(w))) return true;

  // Trailing job-title run: "Mohammed Junaid Employee Central" / "Nagalakshmi Assistant Manager".
  if (words.length >= 3) {
    let jobTail = 0;
    for (let i = lowerWords.length - 1; i >= 0; i -= 1) {
      if (JOB_TITLE_WORDS.has(lowerWords[i] ?? '')) jobTail += 1;
      else break;
    }
    if (jobTail >= 2 && jobTail >= Math.floor(words.length / 2)) return true;
  }

  return false;
}

/** Drop trailing role tokens mistakenly parsed as part of the name. */
export function trimJobTitleSuffixFromDisplayName(name: string): string | null {
  const tokens = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return null;

  const lower = tokens.map((t) => t.replace(/[.,]+$/, '').toLowerCase());
  while (tokens.length > 1 && JOB_TITLE_WORDS.has(lower[lower.length - 1] ?? '')) {
    tokens.pop();
    lower.pop();
  }
  const out = tokens.join(' ').trim();
  if (!out || isBadCandidateDisplayName(out)) return null;
  return out;
}

export function isResumeSectionHeadingLine(line: string): boolean {
  const s = line.replace(/^[\s•\-–—]+/, '').trim();
  if (!s || s.length > 90) return true;
  if (isBadCandidateDisplayName(s)) return true;
  return /^(key\s+achievements?|achievements?|key\s+accomplishments?|core\s+competencies?|core\s+skills?|core\s+strengths?|professional\s+summary|career\s+summary|career\s+objective|technical\s+summary|executive\s+summary|personal\s+summary|synopsis|declaration|about\s+me|profile\s+summary|summary|objective|strengths|awards?|certifications?|projects?|work\s+history|employment\s+history|organizations?\s+experience|organizational\s+experience|detailed\s+experience|technical\s+competency|professional\s+experience|work\s+experience|experience|education|skills|technical\s+skills|key\s+skills|of\s+the\s+company|curriculum\s+vitae|experience\s+summary|work\s+summary|biodata|resume|contact\s+details?)$/i.test(
    s,
  );
}
