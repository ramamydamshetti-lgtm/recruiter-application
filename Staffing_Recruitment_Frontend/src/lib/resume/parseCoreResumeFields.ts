/**
 * Keyword / section-based extraction of core resume fields (name, contact, education, skills).
 * Tuned for common Indian tech resume layouts (header + Education + Technical Skills + Projects).
 */

import { CORE_TECH_KEYWORDS } from '@/lib/resume/coreTechKeywords';

export type CoreParsedFields = {
  candidateName: string | null;
  email: string | null;
  contactNumber: string | null;
  linkedinUrl: string | null;
  highestQualification: string | null;
  technologiesRaw: string | null;
};

/** Next-section boundary (skills / education blocks stop here). */
const SECTION_END = String.raw`(?=\n\s*(?:Education|Educational\s+Qualification|Academic\s+Details|Technical\s+Skills|Technologies|Programming\s+Languages|Skills|Core\s+Skills|Key\s+Skills|Area\s+of\s+Interest|Areas\s+of\s+Interest|Areas\s+of\s+Expertise|IT\s+Skills|Computer\s+Skills|Experience|Work\s+Experience|Employment|Projects|Certifications?|Certification|Additional\s+Information|Languages|Interests|Summary|Objective|Contact|Personal|References)\b)`;

/** Headers that start a “skills / tech” block (case-insensitive). */
const SKILL_SECTION_START = String.raw`(?:Technical\s+Skills|Core\s+Skills|Key\s+Skills|Technologies|Technology\s+Stack|Programming\s+Languages|Programming\s+Skills|Skills\s*(?:&|and)\s*Technologies|Professional\s+Skills|Relevant\s+Skills|Software\s+Skills|IT\s+Skills|Computer\s+Skills|Area\s+of\s+Interest|Areas\s+of\s+Interest|Areas\s+of\s+Expertise|Tech\s+Stack|Tools\s+and\s+Technologies|Tools\s*&\s*Technologies|Technical\s+Expertise|Professional\s+Expertise|Competencies|Summary\s+of\s+Skills)`;

/** Headers that start an education / qualification block. */
const EDUCATION_SECTION_START = String.raw`(?:Education|EDUCATION|Educational\s+Qualification|Educational\s+Qualifications|Academic\s+Qualification|Academic\s+Qualifications|Academic\s+Background|Academic\s+Details|Academic\s+Record|Qualifications?|Educational\s+Background)`;

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\u00a0/g, ' ').replace(/\*\*/g, '').trim());
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
    /\n\s*(?:Projects|Experience|Education|Certifications?|Additional\s+Information)\b/i,
  );
}

function extractEmail(text: string): string | null {
  const labeled: RegExp[] = [
    /(?:email|e-?mail|contact\s+email)\s*[:\-]\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi,
    /(?:email|e-?mail|mail)\s*[:\-]?\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi,
  ];
  for (const pattern of labeled) {
    let m: RegExpExecArray | null;
    const re = new RegExp(pattern.source, pattern.flags);
    while ((m = re.exec(text)) !== null) {
      const clean = (m[1] ?? '')
        .replace(/^mailto:/i, '')
        .trim();
      if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(clean)) continue;
      if (/(?:example|test|sample|dummy|resume|candidate)\.(?:com|org|net)$/i.test(clean)) continue;
      return clean.toLowerCase();
    }
  }
  const any = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
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

function extractPhone(text: string): string | null {
  const patterns: RegExp[] = [
    /(?:\+91[-\s.]?)?[6-9]\d{9}\b/g,
    /\(\+91\)\s*[6-9]\d{9}\b/g,
    /\(\s*\+91\s*\)\s*[6-9]\d{9}\b/g,
    /\b\+1[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    /\b\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
    /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g,
    /\+\d{1,3}[-\s]?\d[\d\s().-]{8,14}\d/g,
    /(?:phone|mobile|mob|tel|cell|contact)\s*[:\-]?\s*([+\d\s().-]{10,})/gi,
  ];
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (!matches) continue;
    for (const phone of matches) {
      let clean = phone
        .replace(/^(?:phone|mobile|mob|tel|cell|contact)\s*[:\-]?\s*/i, '')
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
 * Handles: full https URL, regional subdomains (e.g. in.linkedin.com), spaced "linkedin . com / in / user",
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

/** Normalize "Name : RAHUL KUMAR" / "Name- John Doe" into a display name. */
function cleanExtractedName(raw: string): string | null {
  let s = raw.replace(/^[\s:–—\-]+/, '').trim();
  s = s.split('|')[0].trim();
  s = s.replace(/\s*[,;]\s*.*$/, '');
  s = s.replace(/\s+/g, ' ');
  if (!s || s.length > 90) return null;
  if (/^[A-Z][A-Z\s.'-]{2,80}$/.test(s)) {
    return s
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  if (/^[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,6}$/.test(s)) {
    return s;
  }
  return null;
}

function extractNameFromLabeledFields(fullText: string): string | null {
  const patterns = [
    /(?:^|\n)\s*(?:Name|Candidate\s*Name|Full\s*Name)\s*[:]\s*([^\n]+)/i,
    /(?:^|\n)\s*(?:Name|Candidate\s*Name|Full\s*Name)\s*[-–—]\s*([^\n]+)/i,
  ];
  for (const re of patterns) {
    const m = fullText.match(re);
    if (m?.[1]) {
      const cleaned = cleanExtractedName(m[1]);
      if (cleaned) return cleaned;
    }
  }
  return null;
}

/** Name: labeled fields + first plausible title-case line in header (before Objective/Education/skills). */
function extractName(lines: string[], fullText: string): string | null {
  const fromLabels = extractNameFromLabeledFields(fullText);
  if (fromLabels) return fromLabels;

  const headerStop = /^(objective|summary|education|experience|skills|technical|projects|contact|personal)/i;
  const skipLine =
    /[@/:]|linkedin|github\.com|\.com\/in\/|^\d[\d\s().+-]{8,}$|^[+()]/i;
  const locationOnly =
    /^(hyderabad|bengaluru|bangalore|chennai|mumbai|delhi|pune|kolkata|india)\b/i;

  for (let i = 0; i < Math.min(28, lines.length); i++) {
    const line = lines[i].replace(/^[\s•\-–—]+/, '').trim();
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

    if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/.test(line) && line.length >= 4 && line.length <= 60) {
      return line;
    }

    if (
      /^[A-Z][A-Z\s]{2,50}$/.test(line) &&
      /[A-Z]{2,}/.test(line) &&
      line.split(/\s+/).length >= 2 &&
      line.split(/\s+/).length <= 5 &&
      line.length <= 60
    ) {
      return line
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }

  const emailLineIdx = lines.findIndex((l) =>
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(l),
  );
  if (emailLineIdx > 0) {
    const prev = lines[emailLineIdx - 1].replace(/^[\s•\-–—]+/, '').trim();
    if (
      prev &&
      prev.length >= 2 &&
      prev.length <= 80 &&
      !skipLine.test(prev) &&
      !headerStop.test(prev)
    ) {
      if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4}$/.test(prev)) return prev;
      if (
        /^[A-Z][A-Z\s]{2,50}$/.test(prev) &&
        prev.split(/\s+/).length >= 2 &&
        prev.split(/\s+/).length <= 5
      ) {
        return prev
          .toLowerCase()
          .replace(/\b\w/g, (c) => c.toUpperCase());
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
      re: /\b(b\.?\s*tech|b\.?\s*e\.?|b\.?\s*e\b|bachelor|b\.?\s*sc|b\.?\s*com|bca|bba|b\.?\s*ba|b\.?\s*arch|b\.?\s*pharm|under\s*graduate|undergraduate|u\.?g\.?)\b/i,
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

/** Pick the education line(s) that mention the highest qualification tier. */
function extractHighestQualification(educationBlock: string): string | null {
  if (!educationBlock.trim()) return null;

  const lines = educationBlock
    .split(/\n/)
    .map((l) => l.replace(/^[\s•\-–—]+/, '').trim())
    .filter(Boolean);

  let bestIdx = -1;
  let bestRank = -1;
  for (let i = 0; i < lines.length; i++) {
    const r = rankLineForDegree(lines[i]);
    if (r > bestRank) {
      bestRank = r;
      bestIdx = i;
    } else if (r === bestRank && r > 0 && bestIdx >= 0) {
      if (lines[i].length > lines[bestIdx].length) bestIdx = i;
    }
  }

  if (bestRank <= 0) {
    const fallback = educationBlock.match(
      /\b(Bachelor|Master|B\.?\s*Tech|M\.?\s*Tech|B\.?\s*E|MCA|MBA|Ph\.?\s*D|Diploma|SSC|HSC|12\s*th|10\s*th|Intermediate|Graduate)[^\n]{5,120}/i,
    );
    return fallback?.[0]?.trim().slice(0, 280) ?? null;
  }

  const parts: string[] = [lines[bestIdx]];
  if (bestIdx + 1 < lines.length) {
    const next = lines[bestIdx + 1];
    if (
      rankLineForDegree(next) === 0 &&
      next.length < 140 &&
      !/^(technical\s+skills|skills|experience|projects|certification)/i.test(next)
    ) {
      parts.push(next);
    }
  }
  return parts.join(' · ').replace(/\s+/g, ' ').trim().slice(0, 280) || null;
}

const EXTRA_SKILL_PATTERNS: RegExp[] = [
  /\bTech\s*Stack\s*[:\-]\s*([^\n]+)/gi,
  /\b(?:Programming|AI\s*&?\s*ML|Frameworks?\s*&?\s*Libraries|Tools\s*&?\s*Platforms|Soft\s*Skills)\s*[:\-]\s*([^\n]+)/gi,
  /\b(?:Area\s+of\s+Interest|Areas\s+of\s+Interest|Programming\s+Languages|Technologies|Technology)\s*[:\-]\s*([^\n]+)/gi,
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Match curated keywords from `coreTechKeywords` against full resume text (longest phrases first). */
function scanCoreTechKeywords(fullText: string): string[] {
  const found: string[] = [];
  const lower = fullText.toLowerCase();
  for (const kw of CORE_TECH_KEYWORDS) {
    const k = kw.trim();
    if (k.length < 2) continue;
    if (k.length >= 4 || k.includes(' ')) {
      if (lower.includes(k.toLowerCase())) found.push(kw);
    } else if (/[+.#]/.test(k)) {
      const re = new RegExp(
        `(^|[^a-z0-9+.#])${escapeRegExp(k)}([^a-z0-9+.#]|$)`,
        'i',
      );
      if (re.test(fullText)) found.push(kw);
    } else {
      const re = new RegExp(`\\b${escapeRegExp(k)}\\b`, 'i');
      if (re.test(fullText)) found.push(kw);
    }
  }
  return found;
}

function parseCategoryLines(skillsBlock: string): string[] {
  const found: string[] = [];
  const lines = skillsBlock.split(/\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 200) continue;
    // "Programming:", "AI & ML:", "Frameworks & Libraries:", etc.
    const m = trimmed.match(
      /^\s*(?:\*\*)?([A-Za-z0-9][A-Za-z0-9\s&'.+/()-]{0,52})\s*[:\-–—]\s*(.+)$/,
    );
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

/** Unlabeled lines: "Python, Java, C++" or bullet lines. */
function parseUnlabeledSkillLines(skillsBlock: string): string[] {
  const found: string[] = [];
  const lines = skillsBlock.split(/\n/);
  const labeled = /^\s*(?:\*\*)?[A-Za-z0-9][A-Za-z0-9\s&'.+/()-]{0,52}\s*[:\-–—]\s*.+$/;
  for (const line of lines) {
    const trimmed = line.trim().replace(/^[\s•\-–—]+/, '');
    if (!trimmed || trimmed.length > 220) continue;
    if (labeled.test(trimmed)) continue;
    if (/[,;|]/.test(trimmed)) {
      trimmed.split(/[,;|]/).forEach((p) => {
        const t = p.trim();
        if (t.length > 1 && t.length < 120) found.push(t);
      });
    } else if (trimmed.length < 90) {
      found.push(trimmed);
    }
  }
  return found;
}

function extractSkillsCombined(fullText: string, technicalBlock: string | null): string[] {
  const found: string[] = [];

  if (technicalBlock) {
    found.push(...parseCategoryLines(technicalBlock));
    found.push(...parseUnlabeledSkillLines(technicalBlock));
  }

  for (const pattern of EXTRA_SKILL_PATTERNS) {
    let m: RegExpExecArray | null;
    const re = new RegExp(pattern.source, pattern.flags);
    while ((m = re.exec(fullText)) !== null) {
      const chunk = m[1];
      chunk.split(/[,;|]/).forEach((p) => {
        const t = p.trim();
        if (t.length > 1 && t.length < 120) found.push(t);
      });
    }
  }

  const dedupeLower = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  for (const kw of scanCoreTechKeywords(fullText)) {
    if (!found.some((f) => dedupeLower(f, kw))) found.push(kw);
  }

  return Array.from(
    new Set(
      found.map((f) => f.replace(/\s+/g, ' ').trim()).filter((f) => f.length > 1),
    ),
  );
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
  const highestQualification = eduBlock ? extractHighestQualification(eduBlock) : null;

  const techBlock = sliceTechnicalSkillsBlock(text);
  const skillList = extractSkillsCombined(text, techBlock);
  const technologiesRaw = skillList.length ? skillList.sort((a, b) => a.localeCompare(b)).join(', ') : null;

  return {
    candidateName: name,
    email,
    contactNumber: phone,
    linkedinUrl: linkedin,
    highestQualification,
    technologiesRaw,
  };
}
