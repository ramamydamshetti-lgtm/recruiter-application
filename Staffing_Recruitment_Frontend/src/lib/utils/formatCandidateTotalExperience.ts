/**
 * Show **total years of experience** (career), not skill-specific tenure.
 * Prefers numeric `totalExperience` from the API; falls back to `experienceLabel` for legacy rows.
 */
import {
  displayCandidateTotalExperience,
  parseFlexibleExperienceInput,
} from '@/lib/utils/candidateExperienceInput';

export function formatCandidateTotalYears(candidate: {
  totalExperience?: number | null;
  experienceLabel?: string | null;
}): string {
  return displayCandidateTotalExperience(candidate);
}

/** Numeric years for filters/sorting (API field first, then experience label). */
export function parseCandidateTotalExperienceYears(candidate: {
  totalExperience?: number | null;
  experienceLabel?: string | null;
}): number | null {
  const n = candidate.totalExperience;
  if (n != null && Number.isFinite(Number(n))) {
    return Math.max(0, Math.trunc(Number(n)));
  }
  const label = candidate.experienceLabel?.trim();
  if (!label) return null;
  const parsedFlexible = parseFlexibleExperienceInput(label);
  if (parsedFlexible) return parsedFlexible.years;
  const m = label.match(/(\d+(?:\.\d+)?)/);
  if (!m?.[1]) return null;
  const parsed = Number(m[1]);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round(parsed));
}

export type ExperienceRangeFilter = '' | 'custom' | '0-2' | '2-5' | '5-8' | '8-10' | '10+';

export type CustomExperienceBounds = {
  minYears: number | null;
  maxYears: number | null;
};

export function parseCustomExperienceBound(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.trunc(n);
}

export function isCustomExperienceFilterActive(bounds: CustomExperienceBounds): boolean {
  return bounds.minYears != null || bounds.maxYears != null;
}

export function experienceYearsMatchRange(
  years: number | null,
  range: ExperienceRangeFilter,
  customBounds?: CustomExperienceBounds,
): boolean {
  if (!range) return true;
  if (years == null) return false;
  if (range === 'custom') {
    const min = customBounds?.minYears ?? null;
    const max = customBounds?.maxYears ?? null;
    if (min == null && max == null) return true;
    if (min != null && years < min) return false;
    if (max != null && years > max) return false;
    return true;
  }
  switch (range) {
    case '0-2':
      return years <= 2;
    case '2-5':
      return years >= 2 && years <= 5;
    case '5-8':
      return years >= 5 && years <= 8;
    case '8-10':
      return years >= 8 && years <= 10;
    case '10+':
      return years >= 10;
    default:
      return true;
  }
}

export function candidateMatchesExperienceRange(
  candidate: { totalExperience?: number | null; experienceLabel?: string | null },
  range: ExperienceRangeFilter,
  customBounds?: CustomExperienceBounds,
): boolean {
  return experienceYearsMatchRange(parseCandidateTotalExperienceYears(candidate), range, customBounds);
}

export type IndexedCandidateExperience = {
  candidate: { totalExperience?: number | null; experienceLabel?: string | null; id: string };
  experienceYears: number | null;
};

export function indexCandidatesByExperience<T extends IndexedCandidateExperience['candidate']>(
  list: T[],
): Array<IndexedCandidateExperience & { candidate: T }> {
  return list.map((candidate) => ({
    candidate,
    experienceYears: parseCandidateTotalExperienceYears(candidate),
  }));
}

export function filterIndexedCandidatesByExperience<T extends IndexedCandidateExperience['candidate']>(
  indexed: Array<IndexedCandidateExperience & { candidate: T }>,
  range: ExperienceRangeFilter,
  customBounds?: CustomExperienceBounds,
): T[] {
  if (!range) return indexed.map((row) => row.candidate);
  const out: T[] = [];
  for (const row of indexed) {
    if (experienceYearsMatchRange(row.experienceYears, range, customBounds)) {
      out.push(row.candidate);
    }
  }
  return out;
}
