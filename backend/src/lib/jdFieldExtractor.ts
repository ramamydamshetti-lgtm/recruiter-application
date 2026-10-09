/**
 * Rule-based JD → requirement form field extraction (paste or PDF/DOCX text).
 * Mirrors email-ingestion parsers used in internalAutomation.
 */
import { CORE_TECH_KEYWORDS } from '../resume/coreTechKeywords';

export type JdExtractFormFields = {
  jobTitle?: string;
  clientLeadPoc?: string;
  clientPoc?: string;
  location?: string;
  experience?: string;
  experienceLevel?: string;
  noticePeriod?: string;
  skills?: string[];
  technologies?: string[];
  positions?: number;
  employmentType?: 'Full-time' | 'Contract';
  workMode?: string;
  budgetAmountInr?: number;
  budgetCurrency?: string;
  priority?: 'High' | 'Medium' | 'Low';
  demandType?: 'Single' | 'Multiple' | 'Bulk';
  submittingTo?: string;
  jdDescription?: string;
};

const CLIENT_HINTS: { match: RegExp; slug: string }[] = [
  { match: /\bitc\s+infotech\b|\bitcinfotech\b/i, slug: 'itc' },
  { match: /\bkpmg\b/i, slug: 'kpmg' },
  { match: /\bust\s+global\b|\bust\b/i, slug: 'ust' },
  { match: /\bltts\b|\bl&t\s+technology\b|\blnttechservices\b/i, slug: 'ltts' },
  { match: /\baccenture\b/i, slug: 'accenture' },
  { match: /\bqbruenax\b/i, slug: 'qbruenax' },
  { match: /\bbrillio\b/i, slug: 'brillio' },
  { match: /\bhappiest\s+minds\b/i, slug: 'happiest-minds' },
  { match: /\bmetaforge\b/i, slug: 'metaforge' },
];

function escapeRegex(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeExtractedValue(raw: string): string {
  return raw
    .replace(/\u00a0/g, ' ')
    .replace(/^[\s\-•*]+/, '')
    .replace(/[|]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/[;,.]+$/, '')
    .trim();
}

function clipAtNextLabel(raw: string, nextLabels: string[]): string {
  const clean = normalizeExtractedValue(raw);
  if (!clean || nextLabels.length === 0) return clean;
  const token = nextLabels.map((x) => escapeRegex(x)).join('|');
  const rx = new RegExp(`\\b(?:${token})\\b\\s*[:=\\-–]`, 'i');
  const m = rx.exec(clean);
  if (!m || typeof m.index !== 'number') return clean;
  return normalizeExtractedValue(clean.slice(0, m.index));
}

function sanitizeCompactField(raw: string, maxLen = 140): string {
  let out = normalizeExtractedValue(raw);
  if (!out) return '';
  out = out
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  out = clipAtNextLabel(out, [
    'location',
    'job location',
    'overall exp',
    'overall experience',
    'experience',
    'open positions',
    'positions',
    'mandatory skills',
    'skills',
    'bill rate',
    'budget',
    'notice period',
    'key responsibilities',
    'required skills',
    'regards',
  ]);
  const lower = out.toLowerCase();
  for (const marker of ['dear ', 'regards', 'thanks', 'this email may contain']) {
    const idx = lower.indexOf(marker);
    if (idx > 0) {
      out = out.slice(0, idx).trim();
      break;
    }
  }
  if (out.length > maxLen) out = `${out.slice(0, maxLen).trim()}...`;
  return normalizeExtractedValue(out);
}

function extractLabeledValue(text: string, labels: string[]): string {
  if (!text) return '';
  for (const label of labels) {
    const rx = new RegExp(`(?:^|\\n)\\s*${escapeRegex(label)}\\s*[:=-]\\s*([^\\n\\r]+)`, 'i');
    const m = text.match(rx);
    if (m?.[1]) return normalizeExtractedValue(m[1]);
  }
  return '';
}

function extractInlineFieldValue(text: string, labels: string[], nextLabels: string[]): string {
  if (!text) return '';
  for (const label of labels) {
    const rx = new RegExp(`\\b${escapeRegex(label)}\\b\\s*[:=\\-–]\\s*([^\\n\\r]+)`, 'i');
    const m = text.match(rx);
    if (!m?.[1]) continue;
    const clipped = clipAtNextLabel(m[1], nextLabels);
    if (clipped) return clipped;
  }
  return '';
}

function extractLabeledMultilineValue(text: string, labels: string[]): string {
  if (!text) return '';
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] || '';
    for (const label of labels) {
      const rx = new RegExp(`^\\s*${escapeRegex(label)}\\s*[:=-]?\\s*(.*)$`, 'i');
      const m = line.match(rx);
      if (!m) continue;
      const collected: string[] = [];
      const first = clipAtNextLabel(m[1] || '', [
        'location',
        'job location',
        'overall exp',
        'overall experience',
        'experience',
        'open positions',
        'positions',
        'mandatory skills',
        'skills',
        'budget',
        'notice period',
      ]);
      if (first) collected.push(first);
      for (let j = i + 1; j < lines.length; j += 1) {
        const nextLine = normalizeExtractedValue(lines[j] || '');
        if (!nextLine) break;
        if (/^(from|to|cc|subject|thanks|regards)\s*[:\-]/i.test(nextLine)) break;
        if (/^[a-z][a-z\s/]{1,30}\s*[:=-]/i.test(nextLine)) break;
        collected.push(nextLine);
      }
      if (collected.length) return normalizeExtractedValue(collected.join(', '));
    }
  }
  return '';
}

function titleCaseWords(raw: string): string {
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function parseBudget(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = String(raw).trim().replace(/,/g, '');
  if (!s) return null;
  const compact = s.toLowerCase();
  const m = compact.match(/(\d+(?:\.\d+)?)(?:\s*)(lpa|lpm)?/);
  if (m) {
    const base = parseFloat(m[1] ?? '');
    if (!Number.isFinite(base)) return null;
    if (m[2] === 'lpa' || m[2] === 'lpm') return base * 100000;
    if (/[a-z]/i.test(s)) return null;
    return base;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeEmploymentType(raw: unknown): 'Full-time' | 'Contract' | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'full-time' || s === 'full time' || s === 'fulltime' || s === 'permanent') return 'Full-time';
  if (s === 'contract' || s === 'contractual' || s === 'c2c') return 'Contract';
  return null;
}

function normalizeBudgetCurrency(raw: unknown): string {
  const s = String(raw ?? 'INR').trim().toUpperCase().slice(0, 3);
  return /^[A-Z]{3}$/.test(s) ? s : 'INR';
}

function parseSkills(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  const txt = String(raw ?? '').trim();
  if (!txt) return [];
  return txt
    .replace(/\r/g, '\n')
    .split(/[;,\n]|(?:\s+\/\s+)|(?:\s+\|\s+)|(?:\s+\band\b\s+)/i)
    .map((x) => normalizeExtractedValue(x))
    .filter((x) => x.length >= 2)
    .filter((x, idx, arr) => arr.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === idx);
}

function parseSkillsFromText(text: string): { mandatorySkills: string[]; skills: string[] } {
  const mandatorySection = extractLabeledMultilineValue(text, [
    'mandatory skills',
    'must have skills',
    'required skills',
    'must-have skills',
  ]);
  const skillsSection = extractLabeledMultilineValue(text, [
    'skills',
    'core skills',
    'technical skills',
    'primary skills',
    'key skills',
  ]);
  const mandatory = parseSkills(mandatorySection);
  const generic = parseSkills(skillsSection);
  const base = generic.length ? generic : mandatory;
  return {
    mandatorySkills: mandatory.length ? mandatory : base,
    skills: base,
  };
}

function extractTechKeywordsFromBody(text: string, max = 24): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const kw of CORE_TECH_KEYWORDS) {
    if (found.length >= max) break;
    const k = kw.trim();
    if (k.length < 2) continue;
    const rx = new RegExp(`\\b${escapeRegex(k.toLowerCase())}\\b`, 'i');
    if (rx.test(lower) && !found.some((x) => x.toLowerCase() === k.toLowerCase())) {
      found.push(k);
    }
  }
  return found;
}

function parseOpenPositions(text: string): number {
  const labeled = extractLabeledValue(text, [
    'number of positions',
    'open positions',
    'positions',
    'openings',
    'headcount',
    'no of positions',
  ]);
  if (labeled && !Number.isNaN(Number(labeled))) {
    return Math.max(1, parseInt(labeled, 10));
  }
  const m = text.match(/(\d{1,3})\s*(?:positions?|openings?|headcount)/i);
  if (m) return Math.max(1, parseInt(m[1] || '1', 10));
  if (/\b(multiple|bulk|many)\b/i.test(text)) return 2;
  return 1;
}

function parseNoticePeriod(text: string): string {
  const labeled =
    extractInlineFieldValue(text, ['notice period'], ['location', 'skills', 'budget']) ||
    extractLabeledValue(text, ['notice period']);
  if (labeled) return labeled;
  const m = text.match(/\b(immediate|join(?:ing)?\s*immediately|\d{1,3}\s*(?:day|days|month|months))\b/i);
  return m ? titleCaseWords(m[1] || '') : '';
}

function parseWorkMode(text: string): string {
  const labeled = extractLabeledValue(text, ['work mode', 'mode of work']);
  if (labeled) return titleCaseWords(labeled);
  const lower = text.toLowerCase();
  if (/\bhybrid\b/.test(lower)) return 'Hybrid';
  if (/\bremote\b|\bwfh\b|\bwork from home\b/.test(lower)) return 'Remote';
  if (/\bon[\s-]?site\b/.test(lower)) return 'On-site';
  return '';
}

function parseLocation(text: string): string {
  const labeled =
    extractInlineFieldValue(
      text,
      ['location', 'job location', 'work location', 'base location', 'job location/s'],
      ['overall exp', 'experience', 'skills', 'budget', 'notice period'],
    ) ||
    extractLabeledMultilineValue(text, ['location', 'job location', 'work location', 'base location']);
  if (labeled) return labeled;
  const m = text.match(/\blocation\s*[:=-]\s*([A-Za-z][A-Za-z\s,&/.-]{2,60})/i);
  if (m?.[1]) return normalizeExtractedValue(m[1]);
  return '';
}

function parseExperience(text: string): { overall: string; level: string } {
  const labeled =
    extractInlineFieldValue(
      text,
      ['overall experience', 'experience', 'exp', 'experience required', 'overall exp', 'years of experience'],
      ['open positions', 'skills', 'budget', 'location'],
    ) ||
    extractLabeledMultilineValue(text, ['overall experience', 'experience', 'exp', 'experience required']);
  if (labeled) {
    return { overall: labeled, level: inferExperienceLevel(labeled, text) };
  }
  const m =
    text.match(/(\d{1,2}\s*(?:\+)?\s*(?:to|-)\s*\d{1,2}\s*(?:\+)?\s*(?:years?|yrs?))/i) ||
    text.match(/(\d{1,2}\s*(?:\+)?\s*(?:years?|yrs?))/i) ||
    text.match(/(\d{1,2}\s*-\s*\d{1,2}\s*y(?:ea)?rs?)/i);
  const overall = m?.[1] ? m[1].replace(/\s+/g, ' ').trim() : '';
  return { overall, level: inferExperienceLevel(overall || text, text) };
}

function inferExperienceLevel(overall: string, fullText: string): string {
  const labeled = extractLabeledValue(fullText, ['experience level']);
  if (labeled) return mapExperienceLevelLabel(labeled);
  const low = `${overall} ${fullText}`.toLowerCase();
  if (/\bentry[\s-]?level\b/.test(low)) return 'Entry Level';
  if (/\bjunior\b/.test(low)) return 'Junior';
  if (/\bprincipal\b/.test(low)) return 'Principal';
  if (/\bdirector\b/.test(low)) return 'Director';
  if (/\blead\b|\barchitect\b/.test(low)) return 'Lead';
  if (/\bsenior\b|\bsr\.?\b/.test(low)) return 'Senior';
  if (/\bmid[\s-]?senior\b/.test(low)) return 'Mid-Senior';
  const yearMatch = low.match(/(\d{1,2})\s*(?:\+)?\s*(?:to|-)\s*(\d{1,2})/);
  if (yearMatch) {
    const max = parseInt(yearMatch[2] || '0', 10);
    if (max <= 2) return 'Junior';
    if (max <= 5) return 'Mid-Senior';
    if (max <= 10) return 'Senior';
    return 'Lead';
  }
  const singleYear = low.match(/(\d{1,2})\s*(?:\+)?\s*(?:years?|yrs?)/);
  if (singleYear) {
    const y = parseInt(singleYear[1] || '0', 10);
    if (y <= 2) return 'Junior';
    if (y <= 5) return 'Mid-Senior';
    if (y <= 8) return 'Senior';
    return 'Lead';
  }
  return 'Mid-Senior';
}

function mapExperienceLevelLabel(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (s.includes('entry')) return 'Entry Level';
  if (s.includes('junior')) return 'Junior';
  if (s.includes('principal')) return 'Principal';
  if (s.includes('director')) return 'Director';
  if (s.includes('lead')) return 'Lead';
  if (s.includes('senior')) return 'Senior';
  if (s.includes('mid')) return 'Mid-Senior';
  return 'Mid-Senior';
}

function parseEmployment(text: string): 'Full-time' | 'Contract' {
  const labeled = extractLabeledValue(text, ['employment type', 'type of employment']);
  const fromLabel = normalizeEmploymentType(labeled);
  if (fromLabel) return fromLabel;
  const lower = text.toLowerCase();
  if (/\bcontract\b|\bc2c\b|\bcontract-to-hire\b|\bcth\b/.test(lower)) return 'Contract';
  return 'Full-time';
}

function parseCurrency(text: string): string {
  const labeled = extractLabeledValue(text, ['budget currency', 'currency']);
  if (labeled) return normalizeBudgetCurrency(labeled);
  if (/\busd\b|\$/.test(text)) return 'USD';
  if (/\beur\b|€/.test(text)) return 'EUR';
  return 'INR';
}

function parseBudgetFromText(text: string): number | null {
  const labeledBudget =
    extractLabeledValue(text, ['yearly budget', 'monthly budget', 'budget', 'ctc', 'salary', 'bill rate', 'rate']) ||
    '';
  const parsedLabeled = parseBudget(labeledBudget);
  if (parsedLabeled && parsedLabeled > 0) return parsedLabeled;
  const amountLine =
    text.match(/\b(?:budget|ctc|salary|compensation|bill rate)\s*[:=-]?\s*([0-9.,]+)\s*(lpa|lpm|lakhs?)?/i) ||
    text.match(/\b([0-9]+(?:\.[0-9]+)?)\s*(lpa|lpm|lakhs?)\b/i) ||
    text.match(/₹\s*([0-9.,]+)\s*(lpa|lpm|lakhs?)?/i);
  if (!amountLine) return null;
  const n = parseFloat((amountLine[1] || '').replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = String(amountLine[2] || '').toLowerCase();
  if (unit.startsWith('lp') || unit.startsWith('lakh')) return n * 100000;
  return n;
}

function parsePriority(text: string): 'High' | 'Medium' | 'Low' {
  const labeled = extractLabeledValue(text, ['priority']);
  const explicit = String(labeled || '').trim().toLowerCase();
  if (explicit === 'high') return 'High';
  if (explicit === 'low') return 'Low';
  if (explicit === 'medium') return 'Medium';
  const lower = text.toLowerCase();
  if (/\burgent\b|\bcritical\b|\bimmediate\b|\basap\b/.test(lower)) return 'High';
  if (/\blow\s+priority\b/.test(lower)) return 'Low';
  return 'Medium';
}

function parseDemandType(text: string, openPositions: number): 'Single' | 'Multiple' | 'Bulk' {
  const labeled = extractLabeledValue(text, ['type of demand', 'demand type']);
  const explicit = String(labeled || '').trim().toLowerCase();
  if (explicit === 'single') return 'Single';
  if (explicit === 'multiple') return 'Multiple';
  if (explicit === 'bulk') return 'Bulk';
  if (openPositions >= 10) return 'Bulk';
  if (openPositions >= 2) return 'Multiple';
  return 'Single';
}

function parseJobTitle(text: string, subjectHint?: string): string {
  const labeled = extractLabeledMultilineValue(text, [
    'job title',
    'role title',
    'position',
    'designation',
    'role',
    'job role',
  ]);
  if (labeled) return sanitizeCompactField(labeled, 120);
  if (subjectHint) {
    const subj = subjectHint.replace(/^\s*(re|fw|fwd)\s*:\s*/i, '').trim();
    if (subj.length >= 3 && subj.length <= 120) return sanitizeCompactField(subj, 120);
  }
  const roleLine = text.match(
    /(?:^|\n)\s*(?:hiring|opening|requirement)\s*(?:for|of)?\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\s/&().,-]{4,80})/im,
  );
  if (roleLine?.[1]) return sanitizeCompactField(roleLine[1], 120);
  return '';
}

function parseClientPoc(text: string): { lead?: string; poc?: string } {
  const lead =
    extractLabeledValue(text, ['client lead poc', 'client lead', 'hiring manager', 'spoc', 'point of contact']) ||
    extractInlineFieldValue(text, ['poc'], ['location', 'skills']);
  const poc = extractLabeledValue(text, ['client poc', 'secondary poc', 'cc']);
  return {
    lead: lead || undefined,
    poc: poc || undefined,
  };
}

function detectClientSlug(text: string): string | undefined {
  const labeled =
    extractLabeledValue(text, ['client', 'client name', 'company', 'requirement from', 'vendor']) || '';
  const hay = `${labeled}\n${text}`.toLowerCase();
  for (const { match, slug } of CLIENT_HINTS) {
    if (match.test(hay)) return slug;
  }
  if (/\bour client\b/i.test(text)) {
    for (const { match, slug } of CLIENT_HINTS) {
      if (match.test(text)) return slug;
    }
  }
  return undefined;
}

/**
 * Parse plain JD text into form-friendly fields for Create Requirement.
 */
export function parseJdToFormFields(jdText: string, options?: { subjectHint?: string }): JdExtractFormFields {
  const text = String(jdText ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .trim();
  if (text.length < 20) {
    return { jdDescription: text };
  }

  const inferredSkills = parseSkillsFromText(text);
  let skills = inferredSkills.skills;
  let technologies = inferredSkills.mandatorySkills.length
    ? [...inferredSkills.mandatorySkills]
    : [];

  if (skills.length === 0) {
    skills = extractTechKeywordsFromBody(text, 16);
  }
  if (technologies.length === 0) {
    technologies = extractTechKeywordsFromBody(text, 20).filter(
      (t) => !skills.some((s) => s.toLowerCase() === t.toLowerCase()),
    );
  }

  const { overall, level } = parseExperience(text);
  const openPositions = parseOpenPositions(text);
  const pocs = parseClientPoc(text);
  const jobTitle = parseJobTitle(text, options?.subjectHint);
  const location = parseLocation(text);
  const budget = parseBudgetFromText(text);

  const out: JdExtractFormFields = {
    jdDescription: text,
    jobTitle: jobTitle || undefined,
    clientLeadPoc: pocs.lead,
    clientPoc: pocs.poc,
    location: location || undefined,
    experience: overall || undefined,
    experienceLevel: level,
    noticePeriod: parseNoticePeriod(text) || undefined,
    skills: skills.length ? skills : undefined,
    technologies: technologies.length ? technologies : undefined,
    positions: openPositions,
    employmentType: parseEmployment(text),
    workMode: parseWorkMode(text) || undefined,
    budgetAmountInr: budget && budget > 0 ? budget : undefined,
    budgetCurrency: parseCurrency(text),
    priority: parsePriority(text),
    demandType: parseDemandType(text, openPositions),
    submittingTo: detectClientSlug(text),
  };

  return out;
}
