/** Normalize parsed résumé field text for DB/UI (no stray periods, clean education). */

const MONTH =
  'january|february|march|april|may|june|july|august|september|october|november|december';

/** Strip trailing punctuation and dangling prepositions from any display field. */
export function sanitizeDisplayText(raw: string | null | undefined): string {
  let t = String(raw ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';
  t = t.replace(/[.!?;:]+$/g, '').trim();
  // Dangling preposition only (keep "in April 2021" intact for education compaction).
  t = t.replace(/\s+in\s*$/i, '').replace(/\s+from\s*$/i, '').replace(/\s+at\s*$/i, '');
  return t.replace(/\s+/g, ' ').trim();
}

export function normalizeSkillToken(raw: string): string {
  let t = sanitizeDisplayText(raw);
  if (!t) return '';
  t = t.replace(/^[\s•\-–—]+/, '');
  if (/[.!?]/.test(t.replace(/\b[A-Z]\./g, ''))) return '';
  return t;
}

const DEGREE_RE =
  /\b(?:B\.?\s*Tech|M\.?\s*Tech|B\.?\s*E\.?|M\.?\s*E\.?|B\.?\s*Com\.?|B\.?\s*COM|B\.?\s*Sc|M\.?\s*Sc|B\.?\s*A|B\.?\s*Arch|MCA|MBA|BBA|BCA|B\.?\s*Pharm|Diploma|Ph\.?\s*D|Bachelor(?:'s)?|Master(?:'s)?|Graduate)\b(?:\s*\([^)]{1,40}\))?/i;

/** One concise HQ line: degree · university · year (no narrative / trailing "in"). */
export function compactHighestQualification(raw: string | null | undefined): string | null {
  let t = sanitizeDisplayText(raw);
  if (!t) return null;

  t = t.replace(
    /^(?:completed\s+)?(?:degree\s+in|qualification\s+in|graduation\s+in|graduated\s+from|pursuing\s+(?:a\s+)?|completed\s+)\s*/i,
    '',
  );

  const degreeM = t.match(DEGREE_RE);
  const uniM = t.match(
    /\b(?:from|at)\s+([A-Z][A-Za-z0-9&.'\s-]{4,90}?)(?=\s+in\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|(?:19|20)\d{2})|\s+(?:19|20)\d{2}\b|\s*$)/i,
  );
  const yearM = t.match(/\b(19|20)\d{2}\b/);

  const parts: string[] = [];
  if (degreeM?.[0]) {
    parts.push(
      degreeM[0].replace(/\s+/g, ' ').trim(),
    );
  }
  if (uniM?.[1]) {
    const uni = sanitizeDisplayText(uniM[1]);
    if (uni && uni.length > 3) parts.push(uni);
  }
  if (yearM?.[0]) parts.push(yearM[0]);

  if (parts.length > 0) {
    return parts.join(' · ').slice(0, 280);
  }

  return t.slice(0, 280) || null;
}

/** Whole phrase reads as a job title / domain role, not a discrete skill. */
export function looksLikeJobRolePhrase(token: string): boolean {
  const t = token.trim();
  if (!t || t.length < 8) return false;
  if (
    /\b(?:consultant|engineer|developer|architect|analyst|specialist|manager|lead)\b/i.test(t) &&
    t.split(/\s+/).length >= 2 &&
    t.split(/\s+/).length <= 8
  ) {
    return true;
  }
  if (/\bsap\s+successfactors\b/i.test(t) && /\bconsultant\b/i.test(t)) return true;
  return false;
}
