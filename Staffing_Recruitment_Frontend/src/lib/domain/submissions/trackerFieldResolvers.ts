import type { Candidate, CandidateSubmission } from '@/lib/domain/candidates/types';
import type { Requirement } from '@/lib/domain/requirements/types';
import { pickCandidateCurrentLocation } from '@/lib/domain/submissions/trackerRowSync';
import { formatCandidateTotalYears } from '@/lib/utils/formatCandidateTotalExperience';

/** Display placeholder for missing tracker cell values. */
export const TRACKER_EMPTY = '—';

export function trackerCellValue(value: string | number | null | undefined): string {
  if (value == null) return TRACKER_EMPTY;
  const s = typeof value === 'number' ? String(value) : value;
  return s === '' ? TRACKER_EMPTY : s;
}

function firstPresent(...values: Array<string | null | undefined>): string {
  for (const v of values) {
    if (v == null) continue;
    if (v === '') continue;
    return v;
  }
  return TRACKER_EMPTY;
}

/** Full candidate skill set: skills[] + technologies[], deduped, candidate-only. */
export function resolveTrackerCandidateSkills(candidate: Candidate): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const list of [candidate.skills ?? [], candidate.technologies ?? []]) {
    for (const item of list) {
      const s = String(item);
      if (!s) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      parts.push(s);
    }
  }
  return parts.length ? parts.join(', ') : TRACKER_EMPTY;
}

/** JD mandatory skills (UST-style columns only). */
export function resolveTrackerRequirementSkills(requirement: Requirement): string {
  const parts = (requirement.skills ?? []).map((s) => String(s)).filter(Boolean);
  return parts.length ? parts.join(', ') : TRACKER_EMPTY;
}

export function resolveTrackerCandidateName(candidate: Candidate): string {
  return trackerCellValue(candidate.name);
}

export function resolveTrackerCandidateEmail(candidate: Candidate): string {
  return trackerCellValue(candidate.email);
}

export function resolveTrackerCandidatePhone(candidate: Candidate): string {
  return trackerCellValue(candidate.phone);
}

export function resolveTrackerCurrentOrganization(candidate: Candidate): string {
  const raw =
    candidate.currentEmployer ??
    (candidate as Candidate & { currentCompany?: string | null }).currentCompany ??
    '';
  return trackerCellValue(raw);
}

export function resolveTrackerPositionTitle(requirement: Requirement): string {
  return trackerCellValue(requirement.roleTitle);
}

export function resolveTrackerJobLocation(requirement: Requirement): string {
  return trackerCellValue(requirement.location);
}

export function resolveTrackerPreferredLocation(
  candidate: Candidate,
  sub?: CandidateSubmission,
): string {
  return firstPresent(sub?.preferredLocation, candidate.preferredLocation);
}

export function resolveTrackerCurrentLocation(
  candidate: Candidate,
  sub?: CandidateSubmission,
): string {
  const loc = pickCandidateCurrentLocation(candidate, sub);
  return loc === '' ? TRACKER_EMPTY : loc;
}

export function resolveTrackerQualification(
  candidate: Candidate,
  sub?: CandidateSubmission,
): string {
  const fromSub = sub?.highestQualification;
  if (fromSub != null && fromSub !== '') return fromSub;
  const h = candidate.highestQualification;
  if (h != null && h !== '') return h;
  const edu = (candidate.education ?? []).map((x) => String(x)).filter(Boolean);
  return edu.length ? edu.join(', ') : TRACKER_EMPTY;
}

export function resolveTrackerTotalExperience(
  candidate: Candidate,
  sub?: CandidateSubmission,
): string {
  const fromSub = sub?.totalExperience;
  if (fromSub != null && fromSub !== '') return fromSub;
  const formatted = formatCandidateTotalYears(candidate);
  return formatted === '' ? TRACKER_EMPTY : formatted;
}

export function resolveTrackerRelevantExperience(
  candidate: Candidate,
  sub?: CandidateSubmission,
): string {
  return firstPresent(sub?.relevantExperience, candidate.relevantExperience);
}

export function resolveTrackerCurrentCtc(
  candidate: Candidate,
  sub?: CandidateSubmission,
): string {
  return firstPresent(sub?.currentCtc, candidate.currentSalary);
}

export function resolveTrackerExpectedCtc(
  candidate: Candidate,
  sub?: CandidateSubmission,
): string {
  return firstPresent(sub?.expectedCtc, candidate.expectedSalary);
}

export function resolveTrackerNoticePeriod(
  candidate: Candidate,
  sub?: CandidateSubmission,
): string {
  return firstPresent(sub?.noticePeriod, candidate.noticePeriod);
}

const MONTH_NAME_TO_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function daysUntilDate(target: Date, ref: Date): number {
  const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
}

function parseLwdDateFromNoticeText(text: string): Date | null {
  const ordinal = text.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/i);
  if (ordinal) {
    const day = Number(ordinal[1]);
    const month = MONTH_NAME_TO_INDEX[ordinal[2]!.toLowerCase()];
    const year = Number(ordinal[3]);
    if (month != null && day >= 1 && day <= 31) {
      const d = new Date(year, month, day);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }

  const slash = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]) - 1;
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
}

/** NP (Days) columns: parse notice period from candidate/submission profile. */
export function resolveTrackerNoticePeriodDays(
  candidate: Candidate,
  sub?: CandidateSubmission,
): string {
  const raw = firstPresent(sub?.noticePeriod, candidate.noticePeriod);
  if (raw === TRACKER_EMPTY) return TRACKER_EMPTY;

  const text = raw.trim();
  const lower = text.toLowerCase();
  const ref = sub?.submittedOn ? new Date(sub.submittedOn) : new Date();
  const lwd = parseLwdDateFromNoticeText(text);
  const isImmediate = /\b(immediate|asap)\b/i.test(lower) || /\bjoiner\b/i.test(lower);

  if (isImmediate) {
    if (lwd) {
      const diff = daysUntilDate(lwd, ref);
      return diff <= 0 ? '0' : String(diff);
    }
    return '0';
  }

  if (lwd) {
    const diff = daysUntilDate(lwd, ref);
    return diff <= 0 ? '0' : String(diff);
  }

  const daysMatch = lower.match(/(\d+)\s*(?:day|days|d)\b/);
  if (daysMatch) return daysMatch[1]!;

  const weeksMatch = lower.match(/(\d+)\s*(?:week|weeks|wk)\b/);
  if (weeksMatch) return String(Number(weeksMatch[1]) * 7);

  const monthsMatch = lower.match(/(\d+)\s*(?:month|months|mon)\b/);
  if (monthsMatch) return String(Number(monthsMatch[1]) * 30);

  if (/^\d{1,3}$/.test(text)) return text;

  return text;
}

export function resolveTrackerRatePerMonth(
  candidate: Candidate,
  requirement: Requirement,
  sub?: CandidateSubmission,
): string {
  const fromComp = firstPresent(sub?.expectedCtc, candidate.expectedSalary);
  if (fromComp !== TRACKER_EMPTY) return fromComp;
  if (requirement.monthlyBudget != null && Number.isFinite(requirement.monthlyBudget)) {
    const cur = requirement.budgetCurrency ?? 'INR';
    return `${requirement.monthlyBudget} ${cur}/month`;
  }
  return TRACKER_EMPTY;
}

export function formatTrackerResumeSentDateDdMmYy(sub?: CandidateSubmission): string {
  const d = sub?.submittedOn ? new Date(sub.submittedOn) : new Date();
  if (Number.isNaN(d.getTime())) return TRACKER_EMPTY;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

export function formatTrackerSubmissionDate(sub?: CandidateSubmission): string {
  const d = sub?.submittedOn ? new Date(sub.submittedOn) : new Date();
  if (Number.isNaN(d.getTime())) return TRACKER_EMPTY;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function resolveTrackerLinkedin(
  candidate: Candidate,
  sub?: CandidateSubmission,
): string {
  return firstPresent(sub?.linkedinUrl, candidate.linkedinUrl);
}

export function resolveTrackerAvailability(
  candidate: Candidate,
  sub?: CandidateSubmission,
): string {
  const fromCand = candidate.availableForInterview;
  if (fromCand != null && fromCand !== '') return fromCand;
  if (sub?.availableForInterview === true) return 'Yes';
  if (sub?.availableForInterview === false) return 'No';
  return TRACKER_EMPTY;
}

export function resolveTrackerReasonForChange(
  candidate: Candidate,
  sub?: CandidateSubmission,
): string {
  return firstPresent(sub?.reasonForJobChange, candidate.reasonForJobChange);
}

export function resolveTrackerNotes(candidate: Candidate): string {
  return trackerCellValue(candidate.notes);
}

export function resolveTrackerCandidateRef(candidate: Candidate): string {
  return firstPresent(candidate.candidateRef, candidate.candidateCode);
}

/** Skill-related column keys that should always refresh from latest candidate data on row sync. */
export const TRACKER_SKILL_COLUMN_KEYS = new Set([
  'Skill',
  'Skillset',
  'Skills / Technologies',
  'Hiring skill',
  'Skill combinations',
]);

/** Profile columns that should always refresh from the latest candidate record on row sync. */
export const TRACKER_PROFILE_COLUMN_KEYS = new Set([
  'Current Location',
  'Current location',
  'Location',
  'Current Company',
  'Current company',
  'Current Organization',
  'Organization',
  'NP (Days)',
  'NP(Days)',
  'Resume Sent Date (DDMMYY)',
  'Resumes sent Date (DDMMYY)',
]);
