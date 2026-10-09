export type ParsedCandidateExperience = {
  years: number;
  months: number;
  displayLabel: string;
  /** Whole years for DB integer column; null when experience is months-only. */
  storageYears: number | null;
};

const RE_YEARS_MONTHS =
  /^(\d{1,2})\s*(?:years?|yrs?)\s+(\d{1,2})\s*(?:months?|mos?\.?)$/i;
const RE_YEARS_ONLY = /^(\d{1,2})\s*(?:years?|yrs?)$/i;
const RE_MONTHS_ONLY = /^(\d{1,3})\s*(?:months?|mos?\.?)$/i;
/** e.g. 3.5 Years → 3 years 5 months (decimal digit = months, not fractional years). */
const RE_DECIMAL_YEARS = /^(\d{1,2})\.(\d{1,2})\s*(?:years?|yrs?)?$/i;

function formatExperienceLabel(years: number, months: number): string {
  if (years > 0 && months > 0) {
    return `${years} Year${years === 1 ? '' : 's'} ${months} Month${months === 1 ? '' : 's'}`;
  }
  if (years > 0) {
    return `${years} Year${years === 1 ? '' : 's'}`;
  }
  if (months > 0) {
    return `${months} Month${months === 1 ? '' : 's'}`;
  }
  return '0 Years';
}

function parseYearsMonthsPair(years: number, months: number): ParsedCandidateExperience | null {
  if (!Number.isFinite(years) || !Number.isFinite(months)) return null;
  if (years < 0 || months < 0) return null;
  if (years > 50) return null;
  if (months > 11) return null;
  if (years === 0 && months === 0) return null;

  const displayLabel = formatExperienceLabel(years, months);
  const storageYears = years > 0 ? years : null;

  return { years, months, displayLabel, storageYears };
}

/**
 * Parse flexible experience: years only, months only, years + months, or decimal years
 * (e.g. 3.5 Years → 3 Years 5 Months).
 */
export function parseFlexibleExperienceInput(raw: string): ParsedCandidateExperience | null {
  const normalized = raw.trim().replace(/\s+/g, ' ');
  if (!normalized) return null;

  const ym = normalized.match(RE_YEARS_MONTHS);
  if (ym) {
    return parseYearsMonthsPair(
      Number.parseInt(ym[1] ?? '0', 10),
      Number.parseInt(ym[2] ?? '0', 10),
    );
  }

  const decimalYears = normalized.match(RE_DECIMAL_YEARS);
  if (decimalYears) {
    return parseYearsMonthsPair(
      Number.parseInt(decimalYears[1] ?? '0', 10),
      Number.parseInt(decimalYears[2] ?? '0', 10),
    );
  }

  const y = normalized.match(RE_YEARS_ONLY);
  if (y) {
    return parseYearsMonthsPair(Number.parseInt(y[1] ?? '0', 10), 0);
  }

  const m = normalized.match(RE_MONTHS_ONLY);
  if (m) {
    return parseYearsMonthsPair(0, Number.parseInt(m[1] ?? '0', 10));
  }

  return null;
}

/** Canonical display label, or null when input is not recognized. */
export function normalizeFlexibleExperienceInput(raw: string): string | null {
  return parseFlexibleExperienceInput(raw)?.displayLabel ?? null;
}

export function isValidFlexibleExperienceInput(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  return parseFlexibleExperienceInput(trimmed) != null;
}

export const FLEXIBLE_EXPERIENCE_ERROR =
  'Enter experience as years, months, years + months, or decimal years (e.g. 3 Years, 8 Months, 4 Years 6 Months, 3.5 Years).';

/** Format recognized input on blur (e.g. 3.5 Years → 3 Years 5 Months). */
export function formatExperienceInputOnBlur(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return normalizeFlexibleExperienceInput(trimmed) ?? trimmed;
}

export function displayFlexibleExperienceValue(value?: string | null): string {
  const trimmed = value?.trim();
  if (!trimmed) return '—';
  const parsed = parseFlexibleExperienceInput(trimmed);
  return parsed?.displayLabel ?? trimmed;
}

/** Display label from stored candidate fields (profile / repository). */
export function displayCandidateTotalExperience(candidate: {
  totalExperience?: number | null;
  experienceLabel?: string | null;
}): string {
  const label = candidate.experienceLabel?.trim();
  if (label) {
    const parsed = parseFlexibleExperienceInput(label);
    if (parsed) return parsed.displayLabel;
    if (!/^\d+(?:\.\d+)?$/.test(label)) return label;
  }

  const n = candidate.totalExperience;
  if (n != null && Number.isFinite(Number(n)) && Number(n) > 0) {
    const y = Math.trunc(Number(n));
    return formatExperienceLabel(y, 0);
  }
  if (label) return label;
  return '—';
}
