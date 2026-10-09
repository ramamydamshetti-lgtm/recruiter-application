export type ParsedCandidateExperience = {
  years: number;
  months: number;
  displayLabel: string;
  storageYears: number | null;
};

const RE_YEARS_MONTHS =
  /^(\d{1,2})\s*(?:years?|yrs?)\s+(\d{1,2})\s*(?:months?|mos?\.?)$/i;
const RE_YEARS_ONLY = /^(\d{1,2})\s*(?:years?|yrs?)$/i;
const RE_MONTHS_ONLY = /^(\d{1,3})\s*(?:months?|mos?\.?)$/i;
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

  return {
    years,
    months,
    displayLabel: formatExperienceLabel(years, months),
    storageYears: years > 0 ? years : null,
  };
}

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

/** Integer years for DB column; null for months-only or unrecognized legacy text. */
export function parseTotalExperienceYears(raw: unknown): number | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;

  const parsed = parseFlexibleExperienceInput(s);
  if (parsed) return parsed.storageYears;

  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = parseInt(m[1] ?? '0', 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function normalizeExperienceLabel(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  return parseFlexibleExperienceInput(s)?.displayLabel ?? s;
}
