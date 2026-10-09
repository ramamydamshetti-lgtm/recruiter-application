import type { JdExtractFormFields } from '../../lib/jdFieldExtractor';
import type { RequirementData } from './types/requirement';
import { NOT_SPECIFIED } from './jd-utils';

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

function isMissing(value: string | undefined | null): boolean {
  if (!value?.trim()) return true;
  return value.trim() === NOT_SPECIFIED;
}

function detectClientSlug(text: string): string | undefined {
  for (const { match, slug } of CLIENT_HINTS) {
    if (match.test(text)) return slug;
  }
  return undefined;
}

function normalizeEmploymentType(raw: string): 'Full-time' | 'Contract' | undefined {
  const v = raw.trim().toLowerCase();
  if (!v || v === NOT_SPECIFIED.toLowerCase()) return undefined;
  if (/contract|contractor|sub-con|subcon/.test(v)) return 'Contract';
  if (/full[-\s]?time|fte|fts|permanent/.test(v)) return 'Full-time';
  return undefined;
}

function normalizeWorkMode(raw: string): string | undefined {
  const v = raw.trim();
  if (!v || v === NOT_SPECIFIED) return undefined;
  const lower = v.toLowerCase();
  if (lower.includes('remote')) return 'Remote';
  if (lower.includes('hybrid')) return 'Hybrid';
  if (lower.includes('on-site') || lower.includes('onsite') || lower.includes('on site')) {
    return 'On-site';
  }
  return v;
}

function normalizePriority(raw: string): 'High' | 'Medium' | 'Low' | undefined {
  const v = raw.trim().toLowerCase();
  if (!v || v === NOT_SPECIFIED.toLowerCase()) return undefined;
  if (v.includes('high') || v === 'urgent' || v === 'critical') return 'High';
  if (v.includes('low')) return 'Low';
  if (v.includes('medium') || v.includes('med')) return 'Medium';
  return undefined;
}

function normalizeDemandType(raw: string, positions?: number): 'Single' | 'Multiple' | 'Bulk' | undefined {
  const v = raw.trim().toLowerCase();
  if (v.includes('bulk')) return 'Bulk';
  if (v.includes('multiple')) return 'Multiple';
  if (v.includes('single')) return 'Single';
  if (typeof positions === 'number' && positions > 1) return 'Multiple';
  if (typeof positions === 'number' && positions === 1) return 'Single';
  return undefined;
}

function normalizeExperienceLevel(raw: string): string | undefined {
  const v = raw.trim();
  if (!v || v === NOT_SPECIFIED) return undefined;
  const lower = v.toLowerCase();
  if (lower.includes('entry')) return 'Entry Level';
  if (lower.includes('principal')) return 'Principal';
  if (lower.includes('director')) return 'Director';
  if (lower.includes('lead')) return 'Lead';
  if (lower.includes('mid-senior') || lower.includes('mid senior')) return 'Mid-Senior';
  if (lower === 'mid' || lower.startsWith('mid ')) return 'Mid-Senior';
  if (lower.includes('senior')) return 'Senior';
  if (lower.includes('junior')) return 'Junior';
  return v;
}

function parseBudgetAmount(raw: string): number | undefined {
  const s = String(raw ?? '').trim();
  if (!s || s === NOT_SPECIFIED) return undefined;

  const lower = s.toLowerCase();
  const impliesLakhs = /(?:lakh|lpa|l\.?\s*p\.?\s*a\.?)/i.test(lower);
  const withoutCurrency = s.replace(/[₹$€,\s_]/g, ' ');
  const withoutWords = withoutCurrency.replace(
    /(?:lakh?s?|lpa|l\.?\s*p\.?\s*a\.?|inr|usd|eur|rs\.?|rupees?|per\s*month|per\s*annum|p\.?\s*a\.?)/gi,
    ' ',
  );
  const m = withoutWords.match(/(\d+(?:\.\d+)?)/);
  if (!m) return undefined;
  const n = parseFloat(m[1]!);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  if (impliesLakhs && n < 10000) return Math.round(n * 100000);
  return Math.round(n);
}

function pickBudget(data: RequirementData, employmentType?: 'Full-time' | 'Contract'): number | undefined {
  const annual = isMissing(data.annualBudget) ? undefined : data.annualBudget;
  const monthly = isMissing(data.monthlyBudget) ? undefined : data.monthlyBudget;
  const raw =
    employmentType === 'Contract'
      ? monthly ?? annual
      : annual ?? monthly;
  return raw ? parseBudgetAmount(raw) : undefined;
}

function normalizeCurrency(raw: string): 'INR' | 'USD' | 'EUR' | undefined {
  const v = raw.trim().toUpperCase();
  if (!v || v === NOT_SPECIFIED.toUpperCase()) return undefined;
  if (v.includes('USD') || v.includes('$')) return 'USD';
  if (v.includes('EUR') || v.includes('€')) return 'EUR';
  if (v.includes('INR') || v.includes('₹') || v.includes('LPA') || v.includes('LAKH')) return 'INR';
  if (v === 'INR' || v === 'USD' || v === 'EUR') return v as 'INR' | 'USD' | 'EUR';
  return undefined;
}

function resolveSubmittingTo(data: RequirementData): string | undefined {
  if (!isMissing(data.requirementFrom)) {
    const slug = detectClientSlug(data.requirementFrom);
    if (slug) return slug;
    return data.requirementFrom.trim();
  }
  const fromText = [data.clientLeadPocFrom, data.jobDescription].filter(Boolean).join(' ');
  return detectClientSlug(fromText);
}

export function mapRequirementToFormFields(
  data: RequirementData,
  options?: { jdText?: string },
): JdExtractFormFields {
  const employmentType = normalizeEmploymentType(data.employmentType);
  const positions = (() => {
    if (isMissing(data.numberOfPositions)) return undefined;
    const n = parseInt(data.numberOfPositions, 10);
    return Number.isFinite(n) && n >= 1 ? n : undefined;
  })();

  const out: JdExtractFormFields = {};

  if (!isMissing(data.jobTitle)) out.jobTitle = data.jobTitle.trim();
  if (!isMissing(data.clientLeadPocFrom)) out.clientLeadPoc = data.clientLeadPocFrom.trim();
  if (!isMissing(data.clientPocFromCc)) out.clientPoc = data.clientPocFromCc.trim();

  const submittingTo = resolveSubmittingTo(data);
  if (submittingTo) out.submittingTo = submittingTo;

  if (!isMissing(data.location)) out.location = data.location.trim();
  if (!isMissing(data.overallExperience)) out.experience = data.overallExperience.trim();

  const experienceLevel = normalizeExperienceLevel(data.relevantExperience);
  if (experienceLevel) out.experienceLevel = experienceLevel;

  if (positions) out.positions = positions;
  if (employmentType) out.employmentType = employmentType;

  const workMode = normalizeWorkMode(data.workMode);
  if (workMode) out.workMode = workMode;

  const currency = normalizeCurrency(data.budgetCurrency);
  if (currency) out.budgetCurrency = currency;

  const budget = pickBudget(data, employmentType);
  if (budget && budget > 0) out.budgetAmountInr = budget;

  const priority = normalizePriority(data.priority);
  if (priority) out.priority = priority;

  const demandType = normalizeDemandType(data.typeOfDemand, positions);
  if (demandType) out.demandType = demandType;

  if (!isMissing(data.noticePeriod)) out.noticePeriod = data.noticePeriod.trim();

  if (data.mandatorySkills?.length) out.technologies = [...data.mandatorySkills];
  if (data.skills?.length) out.skills = [...data.skills];

  const jdBody = !isMissing(data.jobDescription)
    ? data.jobDescription.trim()
    : options?.jdText?.trim();
  if (jdBody) out.jdDescription = jdBody;

  return out;
}
