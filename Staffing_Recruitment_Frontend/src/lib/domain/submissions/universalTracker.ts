import type { Candidate, CandidateSubmission } from '@/lib/domain/candidates/types';
import type { Requirement } from '@/lib/domain/requirements/types';
import {
  formatTrackerResumeSentDateDdMmYy,
  resolveTrackerCandidateEmail,
  resolveTrackerCandidateName,
  resolveTrackerCandidatePhone,
  resolveTrackerCandidateSkills,
  resolveTrackerCurrentCtc,
  resolveTrackerCurrentLocation,
  resolveTrackerCurrentOrganization,
  resolveTrackerExpectedCtc,
  resolveTrackerJobLocation,
  resolveTrackerNoticePeriodDays,
  resolveTrackerPositionTitle,
  resolveTrackerQualification,
  resolveTrackerRatePerMonth,
  resolveTrackerRelevantExperience,
  resolveTrackerTotalExperience,
  TRACKER_EMPTY,
} from '@/lib/domain/submissions/trackerFieldResolvers';

/** Must match backend `UNIVERSAL_TRACKER_HEADERS` exactly. */
export const UNIVERSAL_TRACKER_HEADERS = [
  'Sl.No',
  'Vendor Name',
  'Position / Title',
  'Skill',
  'Resume Sent Date (DDMMYY)',
  'Full Name',
  'Last Full Time Qualification',
  'Mobile No',
  'Mail ID',
  'NP (Days)',
  'Total Exp',
  'Relevant Exp',
  'Current Location',
  'Job Location',
  'Current Organization',
  'Current CTC',
  'Expected CTC',
  'Rate per Month',
] as const;

export type UniversalTrackerHeader = (typeof UNIVERSAL_TRACKER_HEADERS)[number];

export type UniversalTrackerRowPayload = Record<UniversalTrackerHeader, string>;

export type UniversalTrackerRowState = UniversalTrackerRowPayload & {
  candidateId: string;
};

export const UNIVERSAL_VENDOR_DEFAULT = 'MetaForge';

export function buildUniversalTrackerRow(
  candidate: Candidate,
  requirement: Requirement,
  submission: CandidateSubmission | undefined,
  index: number,
): UniversalTrackerRowState {
  const sub = submission;
  return {
    candidateId: candidate.id,
    'Sl.No': String(index + 1),
    'Vendor Name': UNIVERSAL_VENDOR_DEFAULT,
    'Position / Title': resolveTrackerPositionTitle(requirement),
    Skill: resolveTrackerCandidateSkills(candidate),
    'Resume Sent Date (DDMMYY)': formatTrackerResumeSentDateDdMmYy(sub),
    'Full Name': resolveTrackerCandidateName(candidate),
    'Last Full Time Qualification': resolveTrackerQualification(candidate, sub),
    'Mobile No': resolveTrackerCandidatePhone(candidate),
    'Mail ID': resolveTrackerCandidateEmail(candidate),
    'NP (Days)': resolveTrackerNoticePeriodDays(candidate, sub),
    'Total Exp': resolveTrackerTotalExperience(candidate, sub),
    'Relevant Exp': resolveTrackerRelevantExperience(candidate, sub),
    'Current Location': resolveTrackerCurrentLocation(candidate, sub),
    'Job Location': resolveTrackerJobLocation(requirement),
    'Current Organization': resolveTrackerCurrentOrganization(candidate),
    'Current CTC': resolveTrackerCurrentCtc(candidate, sub),
    'Expected CTC': resolveTrackerExpectedCtc(candidate, sub),
    'Rate per Month': resolveTrackerRatePerMonth(candidate, requirement, sub),
  };
}

export function toUniversalApiRows(rows: UniversalTrackerRowState[]): UniversalTrackerRowPayload[] {
  return rows.map(({ candidateId: _id, ...rest }) => rest);
}
