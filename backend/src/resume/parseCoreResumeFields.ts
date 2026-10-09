/**
 * Keyword / section-based extraction of core resume fields (name, contact, education, skills).
 * Tuned for common Indian tech resume layouts (header + Education + Technical Skills + Projects).
 */

import {
  isBadCandidateDisplayName,
  isResumeSectionHeadingLine,
  trimJobTitleSuffixFromDisplayName,
} from './candidateNameValidation';
import {
  compactHighestQualification,
  looksLikeJobRolePhrase,
  normalizeSkillToken,
  sanitizeDisplayText,
} from './resumeFieldSanitize';

export type CoreParsedFields = {
  candidateName: string | null;
  email: string | null;
  contactNumber: string | null;
  linkedinUrl: string | null;
  highestQualification: string | null;
  educationRaw: string | null;
  skillsRaw: string | null;
  technologiesRaw: string | null;
  totalExperienceYears: number | null;
  relevantExperience: string | null;
  currentCompany: string | null;
  currentLocation: string | null;
};

/** Next-section boundary (skills / education blocks stop here). */
const SECTION_END = String.raw`(?=\n\s*(?:Education|Educational\s+Qualification|Academic\s+Details|Academic\s+Background|Highest\s+Qualification|Studies|Technical\s+Skills|Technologies|Skills|Core\s+Skills|Key\s+Skills|Skill\s+Set|Domain\s+Proficiency|Technical\s+Expertise|Toolset|Area\s+of\s+Interest|Areas\s+of\s+Interest|Areas\s+of\s+Expertise|IT\s+Skills|Computer\s+Skills|Experience|Professional\s+Experience|Relevant\s+Experience|Work\s+Experience|Employment|Current\s+Company|Projects?|PROJECT(?:-\d+)?|Certifications?|Certification|Additional\s+Information|Interests|Summary|Objective|Synopsis|Declaration|Key\s+Achievements?|Achievements?|Contact|Personal|References|Location)\b)`;

/** Headers that start a “skills / tech” block (case-insensitive). */
const SKILL_SECTION_START = String.raw`(?:Technical\s+Skills|Core\s+Skills|Key\s+Skills|Technologies|Technology\s+Stack|Programming\s+Languages|Programming\s+Skills|Skills\s*(?:&|and)\s*Technologies|Professional\s+Skills|Profession(?:al)?\s+Skills|Relevant\s+Skills|Software\s+Skills|IT\s+Skills|Computer\s+Skills|Functional\s+Skills|Domain\s+Proficiency|Technical\s+Expertise|Technical\s+Competencies|Toolset|Area\s+of\s+Interest|Areas\s+of\s+Interest|Areas\s+of\s+Expertise|Tech\s+Stack|Tools\s+and\s+Technologies|Tools\s*&\s*Technologies|Professional\s+Expertise|Summary\s+of\s+Skills|Skills\s+Profile|Skills?\s+Set|Skill\s+Set)`;

/** Headers that start an education / qualification block. */
const EDUCATION_SECTION_START = String.raw`(?:Education|EDUCATION|Educational\s+Qualification|Educational\s+Qualifications|Academic\s+Qualification|Academic\s+Qualifications|Academic\s+Background|Academic\s+Details|Academic\s+Record|Highest\s+Qualification|Studies|Qualifications?|Educational\s+Background)`;

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\u00a0/g, ' ').replace(/\*\*/g, '').trim());
}

/** Prefer header for contact fields — reduces picking footer / template emails and phones. */
function sliceResumeHeaderForContacts(text: string): string {
  const cut = text.search(
    /\n\s*(?:Professional\s+Experience|Work\s+Experience|Employment\s+History|Organizational\s+Experience|Detailed\s+Experience|Career\s+History)\b/i,
  );
  if (cut > 350 && cut < 80000) return text.slice(0, cut);
  return text.slice(0, Math.min(text.length, 9000));
}

function extractBetweenSections(fullText: string, startNames: RegExp, endBefore: RegExp): string | null {
  const m = fullText.match(
    new RegExp(
      `(?:${startNames.source})\\s*\\n([\\s\\S]*?)(?:${endBefore.source}|$)`,
      'i',
    ),
  );
  return m?.[1]?.trim() ?? null;
}

/** Block from "Education" (or synonym) until next major section. */
function sliceEducationBlock(text: string): string | null {
  const re = new RegExp(
    `(?:^|\\n)\\s*(?:${EDUCATION_SECTION_START})\\s*:?\\s*\\n([\\s\\S]*?)${SECTION_END}`,
    'i',
  );
  let m = text.match(re);
  if (m?.[1]) return m[1].trim();
  m = text.match(
    new RegExp(
      `(?:^|\\n)\\s*(?:${EDUCATION_SECTION_START})\\s*:?\\s*\\n([\\s\\S]*?)(?=\\n\\s*(?:${SKILL_SECTION_START}|Technical\\s+Skills|Experience|Projects|Certifications?)\\b)`,
      'i',
    ),
  );
  if (m?.[1]) return m[1].trim();
  return extractBetweenSections(
    text,
    new RegExp(`(?:^|\\n)\\s*(?:${EDUCATION_SECTION_START})\\s*:?\\s*\\n`, 'i'),
    new RegExp(
      `\\n\\s*(?:${SKILL_SECTION_START}|Technical\\s+Skills|Core\\s+Skills|Skills|Experience|Projects|Certifications?)\\b`,
      'i',
    ),
  );
}

/** Block for Technical Skills-style section (multiline or same-line heading). */
function sliceTechnicalSkillsBlock(text: string): string | null {
  const re = new RegExp(
    `(?:^|\\n)\\s*(?:${SKILL_SECTION_START}|Skills)\\s*:?\\s*\\n([\\s\\S]*?)${SECTION_END}`,
    'i',
  );
  let m = text.match(re);
  if (m?.[1]) return m[1].trim();

  // Same line: "TECHNICAL SKILLS: …", "Programming Languages: …", "Skills: …"
  const inline = text.match(
    new RegExp(
      `(?:^|\\n)\\s*(?:${SKILL_SECTION_START}|Skills)\\s*:\\s*([^\\n]+)`,
      'i',
    ),
  );
  if (inline?.[1]?.trim()) return inline[1].trim();

  m = text.match(
    new RegExp(
      `(?:^|\\n)\\s*Skills\\s*:?\\s*\\n([\\s\\S]*?)${SECTION_END}`,
      'i',
    ),
  );
  if (m?.[1]) return m[1].trim();

  return extractBetweenSections(
    text,
    new RegExp(`(?:^|\\n)\\s*(?:${SKILL_SECTION_START}|Technical\\s+Skills|Core\\s+Skills|Skills)\\s*:?\\s*\\n`, 'i'),
    /\n\s*(?:Projects|Experience|Professional\s+Experience|Education|Certifications?|Additional\s+Information)\b/i,
  );
}

function extractEmailFromChunk(chunk: string): string | null {
  const labeled: RegExp[] = [
    /(?:email|e-?mail|contact\s+email)\s*[:\-]\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi,
    /(?:email|e-?mail|mail)\s*[:\-]?\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi,
  ];
  for (const pattern of labeled) {
    let m: RegExpExecArray | null;
    const re = new RegExp(pattern.source, pattern.flags);
    while ((m = re.exec(chunk)) !== null) {
      const clean = (m[1] ?? '')
        .replace(/^mailto:/i, '')
        .trim();
      if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(clean)) continue;
      if (/(?:example|test|sample|dummy|resume|candidate)\.(?:com|org|net)$/i.test(clean)) continue;
      return clean.toLowerCase();
    }
  }
  const any = chunk.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  if (any) {
    for (const raw of any) {
      const clean = raw.replace(/^mailto:/i, '').trim();
      if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(clean)) continue;
      if (/(?:example|test|sample|dummy|resume|candidate)\.(?:com|org|net)$/i.test(clean)) continue;
      return clean.toLowerCase();
    }
  }
  return null;
}

function extractEmail(text: string): string | null {
  const head = sliceResumeHeaderForContacts(text);
  return extractEmailFromChunk(head) ?? extractEmailFromChunk(text);
}

function extractPhoneFromChunk(chunk: string): string | null {
  const patterns: RegExp[] = [
    /(?:\+91[-\s.]?)?[6-9]\d{9}\b/g,
    /\(\+91\)\s*[6-9]\d{9}\b/g,
    /\(\s*\+91\s*\)\s*[6-9]\d{9}\b/g,
    /\b\+1[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    /\b\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
    /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g,
    /\+\d{1,3}[-\s]?\d[\d\s().-]{8,14}\d/g,
    /(?:phone|phone\s*no\.?|mobile|mob|tel|cell|contact|contact\s*number|ph\.?\s*no\.?)\s*[:\-]?\s*([+\d\s().-]{10,})/gi,
  ];
  for (const pattern of patterns) {
    const matches = chunk.match(pattern);
    if (!matches) continue;
    for (const phone of matches) {
      let clean = phone
        .replace(/^(?:phone|phone\s*no\.?|mobile|mob|tel|cell|contact|contact\s*number|ph\.?\s*no\.?)\s*[:\-]?\s*/i, '')
        .trim();
      clean = clean.replace(/[^\d+]/g, '');
      if (clean.length >= 10 && clean.length <= 15) {
        if (clean.length === 10 && /^[6-9]/.test(clean)) {
          return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
        }
        if (clean.startsWith('91') && clean.length === 12) {
          return `+${clean.slice(0, 2)} ${clean.slice(2, 7)} ${clean.slice(7)}`;
        }
        if (clean.startsWith('+')) return clean;
        if (clean.length === 10) return clean;
      }
    }
  }
  return null;
}

function extractPhone(text: string): string | null {
  const head = sliceResumeHeaderForContacts(text);
  return extractPhoneFromChunk(head) ?? extractPhoneFromChunk(text);
}

/** Normalize a matched fragment into https://www.linkedin.com/in/... */
function normalizeLinkedInProfileUrl(raw: string): string | null {
  let s = raw.trim().replace(/\s+/g, '');
  s = (s.split('?')[0] ?? '').split('#')[0] ?? '';
  s = s.replace(/\/+$/, '');
  s = s.replace(/[.,;:)]+$/g, '');
  if (!/linkedin\.com\/(?:in|pub)\//i.test(s)) return null;
  if (!/^https?:\/\//i.test(s)) {
    s = s.replace(/^\/\//, '');
    s = 'https://www.' + s.replace(/^www\./i, '');
  } else if (/^https:\/\/linkedin\.com/i.test(s)) {
    s = s.replace(/^https:\/\/linkedin\.com/i, 'https://www.linkedin.com');
  }
  return s;
}

/**
 * LinkedIn profile URLs — PDFs often break or space tokens; "in" is the path segment for profiles.
 * Handles: full https URL, regional subdomains, spaced "linkedin . com / in / user",
 * and lines like "LinkedIn: linkedin.com/in/..."
 */
function extractLinkedIn(text: string): string | null {
  const collapsed = text
    .replace(/(https?):\/\/+\s*/gi, '$1://')
    .replace(/[\u00a0\t]/g, ' ')
    .replace(/\s+/g, ' ');

  const uid = String.raw`[a-zA-Z0-9_%\-]{1,200}`;
  const hits: { url: string; idx: number }[] = [];

  const tryPush = (fragment: string, idx: number) => {
    const n = normalizeLinkedInProfileUrl(fragment);
    if (n) hits.push({ url: n, idx });
  };

  const patterns: RegExp[] = [
    new RegExp(`https?://(?:[a-z]{2}\\.)?(?:www\\.)?linkedin\\.com/(?:in|pub)/${uid}`, 'gi'),
    new RegExp(`(?:^|\\s)www\\.linkedin\\.com/(?:in|pub)/${uid}`, 'gi'),
    new RegExp(`(?:^|\\s)linkedin\\.com/(?:in|pub)/${uid}`, 'gi'),
    new RegExp(`linkedin\\s*\\.\\s*com\\s*/\\s*(?:in|pub)\\s*/\\s*${uid}`, 'gi'),
  ];

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    while ((m = r.exec(collapsed)) !== null) {
      const rawMatch = m[0] ?? '';
      let frag = rawMatch.trim();
      if (/^linkedin\s*\./i.test(frag)) frag = frag.replace(/\s+/g, '');
      else if (/^\s/.test(rawMatch)) frag = frag.trimStart();
      if (!/^https?:\/\//i.test(frag)) {
        if (/^www\.linkedin\.com/i.test(frag)) frag = `https://${frag}`;
        else if (/^linkedin\.com/i.test(frag)) frag = `https://www.${frag}`;
      }
      tryPush(frag, m.index);
    }
  }

  const labeled = collapsed.match(
    new RegExp(
      `(?:^|\\s)(?:linkedin|linked\\s*in)\\s*[:\\-]\\s*(https?://[^\\s]+|(?:www\\.)?linkedin\\.com/(?:in|pub)/${uid})`,
      'i',
    ),
  );
  if (labeled?.[1]) {
    let frag = labeled[1].trim();
    if (!/^https?:\/\//i.test(frag)) {
      frag = frag.replace(/^www\./i, '');
      frag = `https://www.${frag}`;
    }
    tryPush(frag, labeled.index ?? 0);
  }

  /**
   * Word/Canva resumes: hyperlink text is often just `in/username` (icon + "in/slug").
   * Plain-text export has no linkedin.com — map to full profile URL.
   */
  const slugPart = String.raw`[a-zA-Z0-9](?:[a-zA-Z0-9_-]{1,98}[a-zA-Z0-9])`;
  const looksLikeLiSlug = (s: string) => {
    const t = s.replace(/[.,;:)]+$/g, '');
    if (t.length < 3 || t.length > 100) return false;
    if (/^\d+$/.test(t)) return false;
    return /^[a-zA-Z0-9](?:[a-zA-Z0-9_-]*[a-zA-Z0-9])?$/.test(t);
  };
  const pushSlug = (slug: string, idx: number) => {
    const t = slug.trim().replace(/[.,;:)]+$/g, '');
    if (!looksLikeLiSlug(t)) return;
    hits.push({ url: `https://www.linkedin.com/in/${t}`, idx });
  };

  const shortLabeled = new RegExp(
    `(?:^|\\s)(?:linkedin|linked\\s*in|profile)\\s*[:\\s-]*\\s*in\\s*/\\s*(${slugPart})`,
    'gi',
  );
  let sm: RegExpExecArray | null;
  while ((sm = shortLabeled.exec(collapsed)) !== null) {
    const g = sm[1];
    if (g) pushSlug(g, sm.index);
  }

  const bareInPath = new RegExp(`(?:^|\\s)in\\s*/\\s*(${slugPart})(?=[\\s.,;)|]|$)`, 'gi');
  while ((sm = bareInPath.exec(collapsed)) !== null) {
    const g = sm[1];
    if (g) pushSlug(g, sm.index);
  }

  if (hits.length === 0) return null;
  hits.sort((a, b) => a.idx - b.idx);
  const seen = new Set<string>();
  for (const { url } of hits) {
    const k = url.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      return url;
    }
  }
  return hits[0]?.url ?? null;
}

function finalizeCandidateName(candidate: string | null): string | null {
  if (!candidate) return null;
  const trimmed = sanitizeDisplayText(trimJobTitleSuffixFromDisplayName(candidate) ?? candidate.trim());
  if (isBadCandidateDisplayName(trimmed)) return null;
  return trimmed;
}

/** Normalize "Name : RAHUL KUMAR" / "Name- John Doe" into a display name. */
function cleanExtractedName(raw: string): string | null {
  let s = raw.replace(/^[\s:–—\-]+/, '').trim();
  s = (s.split('|')[0] ?? '').trim();
  s = s.replace(/\s*[,;]\s*.*$/, '');
  s = s.replace(/\s+/g, ' ');
  if (!s || s.length > 90) return null;
  if (isBadCandidateDisplayName(s)) return null;
  if (
    /\b(?:key skills|technical skills|professional summary|career objective|core strengths?|key\s+achievements?)\b/i.test(s)
  ) {
    return null;
  }
  if (/^[A-Z][A-Z\s.'-]{2,80}$/.test(s)) {
    return finalizeCandidateName(
      s
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase()),
    );
  }
  if (/^[A-Za-z][A-Za-z.'-]*(?:\s+(?:[A-Za-z][A-Za-z.'-]*|[A-Za-z]\.)){0,6}$/.test(s)) {
    return finalizeCandidateName(s);
  }
  return null;
}

function extractNameFromLabeledFields(fullText: string): string | null {
  const patterns = [
    /(?:^|\n)\s*(?:Name|Candidate\s*Name|Full\s*Name)\s*[:]\s*([^\n]+)/i,
    /(?:^|\n)\s*(?:Name|Candidate\s*Name|Full\s*Name)\s*[-–—]\s*([^\n]+)/i,
    /(?:^|\n)\s*(?:Name|Candidate\s*Name|Full\s*Name)\s*\*?\s*(?:[:\-–—]\s*)?([A-Z][^\n]{1,80})/i,
  ];
  for (const re of patterns) {
    const m = fullText.match(re);
    if (m?.[1]) {
      const cleaned = cleanExtractedName(m[1].split(/\t/)[0] ?? m[1]);
      if (cleaned) return cleaned;
    }
  }
  return null;
}

/** Name: labeled fields + first plausible title-case line in header (before Objective/Education/skills). */
function extractName(lines: string[], fullText: string): string | null {
  const fromLabels = extractNameFromLabeledFields(fullText);
  if (fromLabels) return fromLabels;

  const headerStop =
    /^(objective|summary|career\s+summary|experience\s+summary|work\s+summary|curriculum\s+vitae|curriculum|vitae|education|work\s+experience|professional\s+experience|organizations?\s+experience|experience|skills|technical|projects|contact|personal|profile|core\s+strengths?|career\s+objective|key\s+achievements?|achievements?|synopsis|declaration|about\s+me|strengths|technical\s+competency|biodata|resume)$/i;
  const skipLine =
    /[@/:]|linkedin|github\.com|\.com\/in\/|^\d[\d\s().+-]{8,}$|^[+()]/i;
  const locationOnly =
    /^(hyderabad|bengaluru|bangalore|chennai|mumbai|delhi|pune|kolkata|india)\b/i;

  for (let i = 0; i < Math.min(28, lines.length); i++) {
    const rawLine = lines[i];
    if (rawLine === undefined) continue;
    const line = rawLine.replace(/^[\s•\-–—]+/, '').trim();
    if (!line || line.length > 90) continue;
    if (skipLine.test(line) || headerStop.test(line)) continue;
    if (locationOnly.test(line) && /,\s*india/i.test(line)) continue;

    const labeled = line.match(
      /^(?:name|candidate|full\s*name)\s*[:\-]\s*(.+)$/i,
    );
    if (labeled?.[1]) {
      const n = cleanExtractedName(labeled[1]);
      if (n) return n;
    }

    if (
      /^[A-Z][a-z]+(?:\s+(?:[A-Z][a-z]+|[A-Z]\.)){1,4}$/.test(line) &&
      line.length >= 4 &&
      line.length <= 60
    ) {
      const name = finalizeCandidateName(line);
      if (name) return name;
    }

    if (
      /^[A-Z][A-Z.\s]{2,50}$/.test(line) &&
      /[A-Z]{2,}/.test(line) &&
      line.split(/\s+/).length >= 2 &&
      line.split(/\s+/).length <= 5 &&
      line.length <= 60
    ) {
      if (!isResumeSectionHeadingLine(line)) {
        const name = finalizeCandidateName(
          line
            .toLowerCase()
            .replace(/\b\w/g, (c) => c.toUpperCase()),
        );
        if (name) return name;
      }
    }
  }

  const emailLineIdx = lines.findIndex((l) =>
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(l),
  );
  if (emailLineIdx > 0) {
    const prevRaw = lines[emailLineIdx - 1];
    if (prevRaw !== undefined) {
      const prev = prevRaw.replace(/^[\s•\-–—]+/, '').trim();
      if (
        prev &&
        prev.length >= 2 &&
        prev.length <= 80 &&
        !skipLine.test(prev) &&
        !headerStop.test(prev)
      ) {
        if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4}$/.test(prev) && !isResumeSectionHeadingLine(prev)) {
          const name = finalizeCandidateName(prev);
          if (name) return name;
        }
        if (
          /^[A-Z][A-Z\s]{2,50}$/.test(prev) &&
          prev.split(/\s+/).length >= 2 &&
          prev.split(/\s+/).length <= 5 &&
          !isResumeSectionHeadingLine(prev)
        ) {
          const name = finalizeCandidateName(
            prev
              .toLowerCase()
              .replace(/\b\w/g, (c) => c.toUpperCase()),
          );
          if (name) return name;
        }
      }
    }
  }

  const m = fullText.match(/(?:^|\n)\s*(?:name|full\s*name)\s*[:\-]\s*([^\n]+)/i);
  if (m?.[1]) {
    const c = cleanExtractedName(m[1]);
    if (c) return c;
  }
  return null;
}

/**
 * Rank a line by highest degree mentioned (10th < 12th < diploma < UG < PG < PhD).
 * Used to pick e.g. B.Tech over 10th/12th when all appear under Education.
 */
function rankLineForDegree(line: string): number {
  const L = line;
  const tiers: Array<{ re: RegExp; rank: number }> = [
    { re: /\b(ph\.?\s*d|phd|doctorate|doctoral|doctor\s+of\s+philosophy)\b/i, rank: 100 },
    { re: /\b(m\.?\s*phil|m\.?\s*philosophy)\b/i, rank: 88 },
    {
      re: /\b(m\.?\s*tech|m\.?\s*e\.?|m\.?\s*sc|m\.?\s*com|mca|mba|master'?s?|post\s*graduate|post-?grad|pgdm|msc|m\.?\s*sc\.|ms\s+in)\b/i,
      rank: 75,
    },
    {
      re: /\b(b\.?\s*tech|b\.?\s*e\.?|b\.?\s*e\b|bachelor|b\.?\s*sc|b\.?\s*com\.?|b\.?\s*com\b|bca|bba|b\.?\s*ba|b\.?\s*arch|b\.?\s*pharm|under\s*graduate|undergraduate|u\.?g\.?)\b/i,
      rank: 55,
    },
    { re: /\b(diploma|polytechnic|d\.?\s*tech\s*\(diploma\)|associate)\b/i, rank: 42 },
    {
      re: /\b(12\s*th|twelfth|hsc|h\.?\s*s\.?\s*c|intermediate|\+2|plus\s*two|puc|senior\s*secondary|class\s*xii|class\s*12)\b/i,
      rank: 32,
    },
    {
      re: /\b(10\s*th|tenth|ssc|s\.?\s*s\.?\s*c|matric|matriculation|sslc|class\s*10|class\s*x\b)\b/i,
      rank: 22,
    },
  ];
  let max = 0;
  for (const { re, rank } of tiers) {
    if (re.test(L)) max = Math.max(max, rank);
  }
  return max;
}

/** Remove marks / scores from education lines (UI + DB should not show these). */
function stripMarksFromEducationText(s: string): string {
  let t = s.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  t = t.replace(/\b(?:cgpa|sgpa|gpa)\s*[:\-]?\s*[\d.]+\s*(?:\/\s*\d+)?\b/gi, ' ');
  t = t.replace(/\b(?:percentage|aggregate|marks?|scores?)\s*[:\-]?\s*[\d.]+\s*%?\b/gi, ' ');
  t = t.replace(/\b\d+(?:\.\d+)?\s*%\b/g, ' ');
  t = t.replace(/\b(?:distinction|first\s*class|second\s*class|with\s+honou?rs)\b/gi, ' ');
  t = t.replace(/\s*[,;]?\s*(?:19|20)\d{2}\s*[-–]\s*(?:19|20)\d{2}\b/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

/**
 * One highest tier line (PG > UG > …); append college line when it follows the degree line.
 * `educationItems` is kept minimal (usually one string) for DB/UI.
 */
function pickBestEducationFromBlock(educationBlock: string | null): {
  highestQualification: string | null;
  educationItems: string[];
} {
  if (!educationBlock?.trim()) return { highestQualification: null, educationItems: [] };
  const rawLines = educationBlock
    .split(/\n/)
    .map((l) => l.replace(/^[\s•\-–—]+/, '').trim())
    .filter(Boolean)
    .filter((l) => !/^(project(?:-\d+)?|description|roles?|team\s*size)\b/i.test(l));
  if (rawLines.length === 0) return { highestQualification: null, educationItems: [] };

  const stripped = rawLines.map((l) => stripMarksFromEducationText(l));
  let maxR = 0;
  for (const line of stripped) {
    maxR = Math.max(maxR, rankLineForDegree(line));
  }
  if (maxR <= 0) {
    const m = educationBlock.match(
      /\b(Bachelor|Master|B\.?\s*Tech|M\.?\s*Tech|B\.?\s*E|MCA|MBA|Ph\.?\s*D|Diploma|Graduate)\b[^.\n]{5,160}/i,
    );
    const one = m?.[0] ? compactHighestQualification(stripMarksFromEducationText(m[0])) : null;
    return one ? { highestQualification: one, educationItems: [one] } : { highestQualification: null, educationItems: [] };
  }

  const tierRows = stripped
    .map((line, idx) => ({ line, idx, r: rankLineForDegree(line) }))
    .filter((x) => x.r === maxR);
  let pick = tierRows[0];
  for (const row of tierRows) {
    if (pick && row.line.length > pick.line.length) pick = row;
  }
  if (!pick) return { highestQualification: null, educationItems: [] };

  let merged = pick.line;
  const nextRaw = rawLines[pick.idx + 1];
  if (
    nextRaw &&
    rankLineForDegree(stripMarksFromEducationText(nextRaw)) === 0 &&
    /\b(university|college|institute|school|academy|polytechnic)\b/i.test(nextRaw) &&
    nextRaw.length < 180
  ) {
    merged = `${merged} · ${stripMarksFromEducationText(nextRaw)}`;
  }
  merged = compactHighestQualification(stripMarksFromEducationText(merged)) ?? '';
  return merged
    ? { highestQualification: merged, educationItems: [merged] }
    : { highestQualification: null, educationItems: [] };
}

/** Prefer header / education-adjacent text so degree mentions in job history are not picked as HQ. */
function sliceResumeHeadForEducationFallback(fullText: string): string {
  const markers = [
    /\n\s*(?:Professional\s+Experience|Work\s+Experience|Employment\s+History|Career\s+Snapshot|Organizational\s+Experience|Detailed\s+Experience|Experience\s*[\|:])/i,
    /\n\s*(?:PROJECT|Project)[\s_-]?\d/i,
  ];
  let cut = fullText.length;
  for (const rx of markers) {
    const m = rx.exec(fullText);
    if (m && m.index >= 200 && m.index < cut) cut = m.index;
  }
  if (cut !== fullText.length) return fullText.slice(0, cut);
  return fullText.slice(0, Math.min(fullText.length, 4800));
}

function extractHighestQualificationFromAnyText(text: string): string | null {
  const lines = text
    .split(/\n/)
    .map((l) => l.replace(/^[\s•\-–—]+/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((l) => l.length < 180);
  let best: { rank: number; value: string } | null = null;
  for (const line of lines) {
    const r = rankLineForDegree(line);
    if (r <= 0) continue;
    if (/\b(responsible|managed|leading\s+a|team\s+of|delivered|implemented|designed|client:|stakeholder)\b/i.test(line)) {
      continue;
    }
    if (
      line.length > 95 &&
      !/\b(university|college|institute|polytechnic|school|board|cgpa|gpa|graduation|aggregate|%\b|\d{4})\b/i.test(line)
    ) {
      continue;
    }
    if (!best || r > best.rank || (r === best.rank && line.length > best.value.length)) {
      best = { rank: r, value: line };
    }
  }
  if (!best?.value) return null;
  return compactHighestQualification(stripMarksFromEducationText(best.value));
}

function looksLikeEducationRow(line: string): boolean {
  if (rankLineForDegree(line) > 0) return true;
  if (
    /\b(university|college|institute|polytechnic|school|board|cgpa|gpa|\d{1,2}\.\d\s*cgpa|%\s*\d|graduation|year\s+of\s+passing)\b/i.test(
      line,
    )
  ) {
    return true;
  }
  if (/\b(?:19|20)\d{2}\b/.test(line) && line.length < 130) return true;
  if (/\b(distinction|first\s*class|second\s*class|honours|honors|aggregate)\b/i.test(line)) return true;
  return false;
}

function extractEducationItems(educationBlock: string | null): string[] {
  if (!educationBlock) return [];
  return Array.from(
    new Set(
      educationBlock
        .split(/\n|[;•]/)
        .map((line) => line.replace(/^[\s•\-–—]+/, '').replace(/\s+/g, ' ').trim())
        .filter((line) => line.length > 2 && line.length < 180)
        .filter(
          (line) =>
            !/^(project(?:-\d+)?|description|roles?|team\s*size|duration|customer|tools?)\b/i.test(line),
        )
        .filter((line) => looksLikeEducationRow(line))
        .map((line) => compactHighestQualification(stripMarksFromEducationText(line)) ?? '')
        .filter((line) => line.length > 2 && line.length < 180),
    ),
  ).slice(0, 2);
}

function parseYearsToRoundedInt(raw: string): number | null {
  const m = raw.match(/(\d+(?:\.\d+)?)/);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

function extractTotalExperience(text: string): number | null {
  const scores: number[] = [];

  const totalPatterns: RegExp[] = [
    /(?:total|overall)\s+experience\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/gi,
    /total\s+years?\s+of\s+experience\s*\*?\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/gi,
    /\b([0-9]+(?:\.[0-9]+)?)\s*(?:\+|plus)\s+years?\s+of\s+experience\b/gi,
    /(?:totally|approx(?:imately)?)\s*(?:around\s*)?([0-9]+(?:\.[0-9]+)?)\s*(?:\+)?\s*(?:years?|yrs?)\s+experience/gi,
    /(?:approx(?:imately)?\.?\s*)?([0-9]+(?:\.[0-9]+)?)\s*(?:\+)?\s*(?:years?|yrs?)\s+of\s+(?:specialized|professional|overall|total)?\s*experience/gi,
    /([0-9]+(?:\.[0-9]+)?)\s*(?:\+)?\s*(?:years?|yrs?)\s+of\s+specialized\s+experience/gi,
    /([0-9]+(?:\.[0-9]+)?)\s*(?:\+)?\s*(?:years?|yrs?)\s+experience\s+in\s+it/gi,
    /([0-9]+(?:\.[0-9]+)?)\s*(?:\+)?\s*(?:years?|yrs?)\s+of\s+(?:total|overall)\s+experience/gi,
  ];

  for (const re of totalPatterns) {
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(text)) !== null) {
      const n = parseYearsToRoundedInt(m[1] ?? '');
      if (n != null) scores.push(n);
    }
  }

  if (scores.length === 0) return null;
  // Prefer highest detected overall/total experience marker.
  return Math.max(...scores);
}

function extractRelevantExperience(text: string): string | null {
  const m =
    text.match(
      /(?:relevant|domain|hands[-\s]?on)\s+experience\s*[:\-]\s*([^\n]{2,80})/i,
    ) ??
    text.match(/(?:experience\s+in\s+current\s+domain)\s*[:\-]\s*([^\n]{2,80})/i);
  const out = m?.[1]?.replace(/\s+/g, ' ').trim();
  return out || null;
}

function extractCurrentCompany(text: string): string | null {
  const labeled = text.match(
    /(?:current\s+company|present\s+company|currently\s+working\s+at)\s*[:\-]\s*([^\n]{2,120})/i,
  );
  const v = labeled?.[1]?.replace(/\s+/g, ' ').trim();
  if (v) return v;
  const inPhrase =
    text.match(/currently\s+i\s+am\s+working\s+as\s+[^.\n]{0,40}\s+in\s+([A-Za-z][A-Za-z0-9&.\- ]{2,80})/i) ??
    text.match(/currently\s+working\s+(?:as\s+[^.\n]{0,40}\s+)?at\s+([A-Za-z][A-Za-z0-9&.\- ]{2,80})/i) ??
    text.match(/presently\s+working\s+with\s+([A-Za-z][A-Za-z0-9&.\- ]{2,80})/i);
  return inPhrase?.[1]?.replace(/\s+/g, ' ').trim().replace(/[.,;:]+$/, '') || null;
}

function extractCurrentLocation(text: string): string | null {
  const labeled = text.match(
    /(?:current\s+location|location|based\s+in)\s*[:\-]\s*([^\n]{2,120})/i,
  );
  const v = labeled?.[1]?.replace(/\s+/g, ' ').trim();
  if (v) return v;

  const cityState = text.match(
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s*,\s*(Maharashtra|Karnataka|Tamil Nadu|Telangana|Andhra Pradesh|Kerala|Gujarat|Delhi|Uttar Pradesh|Madhya Pradesh|Rajasthan|West Bengal|Odisha|Punjab|Haryana|Bihar|Chhattisgarh|Jharkhand|Assam|Goa)\b/i,
  );
  if (cityState?.[1] && cityState?.[2]) {
    const city = cityState[1].replace(/\s+/g, ' ').trim();
    const state = cityState[2].replace(/\s+/g, ' ').trim();
    return `${city}, ${state}`;
  }

  return null;
}

/** Role/domain phrase for "technologies" summary (not a skills dump). */
const TECH_DOMAIN_ROLE_RE =
  /\b(?:cyber\s*security|information\s*security|network\s*security|cloud\s*security|devops|data\s*science|data\s*engineering|sap(?:\s+successfactors)?|successfactors|sf\s+ec|employee\s+central|time\s+off|qa|quality\s*assurance|full\s*stack|backend|frontend|software|web|mobile|ai\/?ml|machine\s*learning|boomi|integration|hardware|electronics|embedded|tosca|material\s+management|fico|abap|mm\b|sd\b|pp\b|salesforce|servicenow|java|\.net|python|react|angular|azure|aws|gcp|mulesoft|pega|workday|power\s*bi|tableau)\b[\w\s/&-]{0,58}\b(?:consultant|engineer|developer|architect|analyst|specialist|lead|manager|tester)\b/i;

function extractRoleFromSummaryBlocks(text: string): string | null {
  const heading =
    '(?:Professional\\s+Summary|Profile\\s+Summary|Career\\s+Summary|Personal\\s+Summary|Executive\\s+Summary|Summary(?:\\s+Profile)?|Career\\s+Objective|Objective|Professional\\s+Objective)';
  const re = new RegExp(
    `(?:^|\\n)\\s*${heading}\\s*:?\\s*\\n([\\s\\S]{20,2200}?)(?=\\n\\s*(?:Education|Work\\s+Experience|Professional\\s+Experience|Employment|Technical\\s+Skills|Skills|Key\\s+Skills|Experience|Projects?|Certifications?|Academic|Internship)\\b)`,
    'gi',
  );
  let best: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const chunk = m[1]?.replace(/\s+/g, ' ').trim() ?? '';
    if (chunk.length < 25) continue;
    const take = chunk.slice(0, 700);
    const hit = take.match(TECH_DOMAIN_ROLE_RE);
    if (hit?.[0]) {
      const v = hit[0].replace(/\s+/g, ' ').trim().slice(0, 140);
      if (!best || v.length > best.length) best = v;
    }
  }
  return best;
}

function extractRoleFromWorkExperienceHead(text: string): string | null {
  const m = text.match(
    /\n\s*(?:Professional\s+Experience|Work\s+Experience|Employment\s+History)\s*:?\s*\n([\s\S]{25,2500}?)(?=\n\s*(?:Education|Technical\s+Skills|Skills|Projects?|Certifications?)\b)/i,
  );
  const chunk = m?.[1]?.replace(/\s+/g, ' ').trim().slice(0, 800) ?? '';
  if (chunk.length < 30) return null;
  const hit = chunk.match(TECH_DOMAIN_ROLE_RE);
  return hit?.[0]?.replace(/\s+/g, ' ').trim().slice(0, 140) ?? null;
}

function extractRolesFromWorkExperience(text: string, maxRoles: number): string[] {
  const section =
    text.match(
      /\n\s*(?:Professional\s+Experience|Work\s+Experience|Employment\s+History|Career\s+Profile)\s*:?\s*\n([\s\S]{40,5000}?)(?=\n\s*(?:Education|Technical\s+Skills|Skills|Projects?|Certifications?)\b)/i,
    )?.[1] ?? '';
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string | null | undefined) => {
    const v = sanitizeDisplayText(raw?.replace(/\s+/g, ' ').trim() ?? '');
    if (!v || v.length < 6 || /@|https?:\/\//i.test(v)) return;
    const k = v.toLowerCase();
    if (seen.has(k)) return;
    if (!TECH_DOMAIN_ROLE_RE.test(v) && !looksLikeJobRolePhrase(v)) return;
    seen.add(k);
    out.push(v);
  };

  for (const line of section.split(/\n/).slice(0, 45)) {
    const hit = line.match(TECH_DOMAIN_ROLE_RE);
    if (hit?.[0]) add(hit[0]);
    if (out.length >= maxRoles) break;
  }

  if (out.length < maxRoles) {
    let m: RegExpExecArray | null;
    const titleLine = /\b(?:as\s+)?([A-Z][^\n]{8,90}(?:Consultant|Engineer|Developer|Architect|Analyst|Specialist|Lead|Manager))\b/gi;
    while ((m = titleLine.exec(section)) !== null && out.length < maxRoles) {
      add(m[1]);
    }
  }
  return out.slice(0, maxRoles);
}

function extractTechnologySummary(text: string, skillTokens: string[]): string | null {
  const roles: string[] = [];
  const seen = new Set<string>();
  const addRole = (raw: string | null | undefined) => {
    const v = sanitizeDisplayText(raw ?? '');
    if (!v || v.length < 6) return;
    const k = v.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    roles.push(v);
  };

  addRole(extractRoleFromSummaryBlocks(text));
  for (const r of extractRolesFromWorkExperience(text, 2)) addRole(r);

  const labeledRes = [
    /(?:^|\n)\s*(?:designation|current\s+role|role|position|job\s+title|title)\s*[:\-]\s*([^\n]+)/gi,
    /(?:^|\n)\s*(?:profile|professional\s+title)\s*[:\-]\s*([^\n]+)/gi,
  ];
  for (const re of labeledRes) {
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(text)) !== null && roles.length < 2) {
      const v = m[1];
      if (v && (TECH_DOMAIN_ROLE_RE.test(v) || looksLikeJobRolePhrase(v))) addRole(v);
    }
  }

  if (roles.length === 0) {
    const fromWork = extractRoleFromWorkExperienceHead(text);
    if (fromWork) addRole(fromWork);
  }

  if (roles.length === 0) {
    for (const raw of splitLines(text).slice(0, 80)) {
      const line = sanitizeDisplayText(raw);
      if (!line || line.length < 8 || line.length > 140) continue;
      const hit = line.match(TECH_DOMAIN_ROLE_RE);
      if (hit?.[0]) {
        addRole(hit[0]);
        if (roles.length >= 2) break;
      }
    }
  }

  if (roles.length > 0) {
    return roles.slice(0, 2).join(' · ').slice(0, 280);
  }

  // Do not copy skill tokens into technology; keep technology empty if no role found.
  void skillTokens;
  return null;
}

const EXTRA_SKILL_PATTERNS: RegExp[] = [
  /\bTech\s*Stack\s*[:\-]\s*([^\n]+)/gi,
  /\bSkills?\s+Set\s*[:\-]\s*([^\n]+)/gi,
  /\b(?:Technical|Professional|Core|Key|Relevant|Functional)\s+Skills?\s*[:\-]\s*([^\n]+)/gi,
  /\b(?:Programming|AI\s*&?\s*ML|Frameworks?\s*&?\s*Libraries|Tools\s*&?\s*Platforms|Soft\s*Skills)\s*[:\-]\s*([^\n]+)/gi,
  /\b(?:Area\s+of\s+Interest|Areas\s+of\s+Interest|Programming\s+Languages)\s*[:\-]\s*([^\n]+)/gi,
];

function isLikelySkillToken(token: string): boolean {
  const t = normalizeSkillToken(token);
  if (!t || t.length < 2 || t.length > 48) return false;
  if (looksLikeJobRolePhrase(t)) return false;
  if (/^\d+$/.test(t)) return false;
  if (/:$/.test(t)) return false;
  if (/\b(?:designed|developed|implemented|managed|collaborated|responsible|experience)\b/i.test(t)) {
    return false;
  }
  if (
    /\b(?:description|roles?|team\s*size|duration|customer|tools?|educational qualifications|key\s+achievements?|achievements?|responsibilities?)\b/i.test(
      t,
    )
  ) {
    return false;
  }
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 8) return false;
  if (/^(technical|functional|skills profile)$/i.test(t)) return false;
  return true;
}

function parseCategoryLines(skillsBlock: string): string[] {
  const found: string[] = [];
  const lines = skillsBlock.split(/\n/);
  const skipCategoryLhs =
    /^(key\s+achievements?|achievements?|awards?|certificates?|declaration|synopsis|summary|objective|work\s+history|employment|accomplishments?|projects?|core\s+skills?|key\s+skills?|technical\s+skills?)$/i;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 200) continue;
    // "Programming:", "AI & ML:", "Frameworks & Libraries:", etc.
    const m = trimmed.match(
      /^\s*(?:\*\*)?([A-Za-z0-9][A-Za-z0-9\s&'.+/()-]{0,52})\s*[:\-–—]\s*(.+)$/,
    );
    if (m?.[1] && skipCategoryLhs.test(m[1].trim())) continue;
    if (m?.[2]) {
      const rhs = m[2]
        .split(/[,;|•]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 1 && s.length < 80);
      found.push(...rhs);
    }
  }
  return found;
}

function parseTabularSkillRows(skillsBlock: string): string[] {
  const out: string[] = [];
  const lines = skillsBlock.split(/\n/);
  const labelPatterns: RegExp[] = [
    /^integration tool\b/i,
    /^programming languages?\b/i,
    /^database\b/i,
    /^operating systems?\b/i,
    /^other tech concepts?\b/i,
    /^tools?\b/i,
    /^frameworks?\b/i,
    /^platforms?\b/i,
  ];
  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
    if (!line || line.length > 220) continue;
    if (/^(technical|functional|skills profile)$/i.test(line)) continue;

    let rhs = '';
    for (const labelRx of labelPatterns) {
      if (labelRx.test(line)) {
        rhs = line.replace(labelRx, '').replace(/^\s*[:\-]?\s*/, '').trim();
        break;
      }
    }
    if (!rhs) continue;

    rhs.split(/[,;|]/).forEach((part) => {
      const token = part.replace(/\s+/g, ' ').trim();
      if (token.length > 1 && token.length < 90) out.push(token);
    });
  }
  return out;
}

/** Unlabeled lines: "Python, Java, C++" or bullet lines. */
function parseUnlabeledSkillLines(skillsBlock: string): string[] {
  const found: string[] = [];
  const lines = skillsBlock.split(/\n/);
  const labeled = /^\s*(?:\*\*)?[A-Za-z0-9][A-Za-z0-9\s&'.+/()-]{0,52}\s*[:\-–—]\s*.+$/;
  const tabularLabelStart =
    /^(integration tool|programming languages?|database|operating systems?|other tech concepts?|management and leadership skills|training\s*&\s*development)\b/i;
  for (const line of lines) {
    const trimmed = line.trim().replace(/^[\s•\-–—]+/, '');
    if (!trimmed || trimmed.length > 220) continue;
    if (labeled.test(trimmed)) continue;
    if (tabularLabelStart.test(trimmed)) continue;
    if (/[,;|]/.test(trimmed)) {
      trimmed.split(/[,;|]/).forEach((p) => {
        const t = p.trim();
        if (t.length > 1 && t.length < 120) found.push(t);
      });
    } else if (/\s[|\/]\s/.test(trimmed)) {
      trimmed.split(/\s*[|\/]\s*/).forEach((p) => {
        const t = p.trim();
        if (t.length > 1 && t.length < 120) found.push(t);
      });
    } else if (trimmed.length < 90) {
      found.push(trimmed);
    }
  }
  return found;
}

/**
 * Table-style skill sections (common in DOC resumes):
 *   Languages
 *   C#.NET, .NET Core, ASP.NET Core MVC, ...
 */
function parseTableStyleSkillLines(skillsBlock: string): string[] {
  const out: string[] = [];
  const lines = skillsBlock
    .split(/\n/)
    .map((l) => l.replace(/^[\s•\-–—]+/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const headingLike = /^(operating system|environment|database|internet tools|languages|other|tools|frameworks?|cloud|testing tools|monitoring|version control|methodologies)$/i;

  for (let i = 0; i < lines.length; i += 1) {
    const cur = lines[i];
    if (!cur) continue;
    if (!headingLike.test(cur)) continue;
    for (let j = i + 1; j <= i + 3 && j < lines.length; j += 1) {
      const next = lines[j];
      if (!next) continue;
      if (headingLike.test(next)) break;
      if (next.length > 220) continue;
      next.split(/[,;|]/).forEach((part) => {
        const token = part.replace(/\s+/g, ' ').trim();
        if (token.length > 1 && token.length < 90) out.push(token);
      });
    }
  }
  return out;
}

function extractSkillsCombined(fullText: string, technicalBlock: string | null): string[] {
  const found: string[] = [];

  if (technicalBlock) {
    found.push(...parseCategoryLines(technicalBlock));
    found.push(...parseUnlabeledSkillLines(technicalBlock));
    found.push(...parseTableStyleSkillLines(technicalBlock));
    found.push(...parseTabularSkillRows(technicalBlock));
  }

  for (const pattern of EXTRA_SKILL_PATTERNS) {
    let m: RegExpExecArray | null;
    const re = new RegExp(pattern.source, pattern.flags);
    while ((m = re.exec(fullText)) !== null) {
      const chunk = m[1];
      if (chunk === undefined) continue;
      chunk.split(/[,;|]/).forEach((p) => {
        const t = p.trim();
        if (t.length > 1 && t.length < 120) found.push(t);
      });
    }
  }
  const normalized = found
    .map((f) =>
      normalizeSkillToken(
        f.replace(/^(?:good\s+knowledge(?:\s+in)?|knowledge\s+on|knowledge\s+in|experience\s+on)\s+/i, ''),
      ),
    )
    .filter((f) => isLikelySkillToken(f));

  return Array.from(new Set(normalized)).slice(0, 15);
}

/**
 * Single entry: plain resume text (from PDF/DOCX) → core fields.
 */
export function parseCoreFieldsFromResumeText(rawText: string): CoreParsedFields {
  const text = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');
  const lines = splitLines(text);

  const email = extractEmail(text);
  const phone = extractPhone(text);
  const linkedin = extractLinkedIn(text);
  const name = extractName(lines, text);

  const eduBlock = sliceEducationBlock(text);
  const eduFallbackSlice = sliceResumeHeadForEducationFallback(text);
  const eduPick = pickBestEducationFromBlock(eduBlock);
  let highestQualification = eduPick.highestQualification;
  if (!highestQualification) {
    highestQualification = extractHighestQualificationFromAnyText(eduFallbackSlice);
  }
  if (
    highestQualification &&
    /^(description|roles?|team\s*size|duration|customer|tools?)\b/i.test(highestQualification)
  ) {
    highestQualification = null;
  }
  let educationItems = eduPick.educationItems;
  if (!highestQualification) {
    const sparse = extractEducationItems(eduBlock);
    const degreeLine = sparse.find((e) =>
      /\b(bachelor|master|b\.?\s*tech|m\.?\s*tech|b\.?\s*e\.?|mca|mba|ph\.?\s*d|diploma|graduate)\b/i.test(e),
    );
    if (degreeLine) {
      highestQualification =
        compactHighestQualification(stripMarksFromEducationText(degreeLine)) ?? null;
      if (educationItems.length === 0 && highestQualification) educationItems = [highestQualification];
    }
  }
  if (educationItems.length === 0) {
    educationItems = extractEducationItems(eduBlock)
      .map((e) => compactHighestQualification(e) ?? sanitizeDisplayText(e))
      .filter(Boolean)
      .slice(0, 1) as string[];
  }
  if (highestQualification) {
    highestQualification = compactHighestQualification(highestQualification) ?? highestQualification;
  }
  const educationRaw = educationItems.length
    ? educationItems
        .map((e) => sanitizeDisplayText(e))
        .filter(Boolean)
        .slice(0, 2)
        .join(', ')
    : null;

  const techBlock = sliceTechnicalSkillsBlock(text);
  const skillList = extractSkillsCombined(text, techBlock);
  const skillsRaw = skillList.length ? skillList.join(', ') : null;
  const technologiesRaw = extractTechnologySummary(text, skillList);
  const totalExperienceYears = extractTotalExperience(text);
  const relevantExperience = extractRelevantExperience(text);
  const currentCompany = extractCurrentCompany(text);
  const currentLocation = extractCurrentLocation(text);

  return {
    candidateName: name ? sanitizeDisplayText(name) : null,
    email,
    contactNumber: phone,
    linkedinUrl: linkedin,
    highestQualification: highestQualification
      ? sanitizeDisplayText(highestQualification)
      : null,
    educationRaw,
    skillsRaw,
    technologiesRaw: technologiesRaw ? sanitizeDisplayText(technologiesRaw) : null,
    totalExperienceYears,
    relevantExperience: relevantExperience ? sanitizeDisplayText(relevantExperience) : null,
    currentCompany: currentCompany ? sanitizeDisplayText(currentCompany) : null,
    currentLocation: currentLocation ? sanitizeDisplayText(currentLocation) : null,
  };
}
