import type { Candidate, CandidateSubmission } from '@/lib/domain/candidates/types';
import type { Requirement } from '@/lib/domain/requirements/types';
import {
  formatTrackerResumeSentDateDdMmYy,
  resolveTrackerCandidateEmail,
  resolveTrackerCandidateName,
  resolveTrackerCandidatePhone,
  resolveTrackerCandidateSkills,
  resolveTrackerCurrentLocation,
  resolveTrackerCurrentOrganization,
  resolveTrackerJobLocation,
  resolveTrackerNoticePeriodDays,
  resolveTrackerPositionTitle,
  resolveTrackerQualification,
  resolveTrackerRatePerMonth,
  resolveTrackerRelevantExperience,
  resolveTrackerTotalExperience,
} from '@/lib/domain/submissions/trackerFieldResolvers';

/** Must match backend `LTTS_TRACKER_HEADERS` exactly. */
export const LTTS_TRACKER_HEADERS = [
  'Sl.No',
  'Vendor Name',
  'BU/IS',
  'Position/ Title',
  'Skill',
  'Resumes sent Date (DDMMYY)',
  'Full Name of the candidate',
  'Last Full Time Qualification',
  'MOBILE NO',
  'Mail ID',
  'NP(Days)',
  'Total Exp',
  'Relevant Exp',
  'Current Location',
  'Job Location',
  'Current Organization',
  'Rate per Month',
] as const;

export type LttsTrackerHeader = (typeof LTTS_TRACKER_HEADERS)[number];

export type LttsTrackerRowPayload = Record<LttsTrackerHeader, string>;

export type LttsTrackerRowState = LttsTrackerRowPayload & {
  candidateId: string;
};

export const LTTS_VENDOR_DEFAULT = 'MetaForge';

export function buildLttsTrackerRow(
  candidate: Candidate,
  requirement: Requirement,
  submission: CandidateSubmission | undefined,
  index: number,
): LttsTrackerRowState {
  const sub = submission;
  return {
    candidateId: candidate.id,
    'Sl.No': String(index + 1),
    'Vendor Name': LTTS_VENDOR_DEFAULT,
    'BU/IS': '',
    'Position/ Title': resolveTrackerPositionTitle(requirement),
    Skill: resolveTrackerCandidateSkills(candidate),
    'Resumes sent Date (DDMMYY)': formatTrackerResumeSentDateDdMmYy(sub),
    'Full Name of the candidate': resolveTrackerCandidateName(candidate),
    'Last Full Time Qualification': resolveTrackerQualification(candidate, sub),
    'MOBILE NO': resolveTrackerCandidatePhone(candidate),
    'Mail ID': resolveTrackerCandidateEmail(candidate),
    'NP(Days)': resolveTrackerNoticePeriodDays(candidate, sub),
    'Total Exp': resolveTrackerTotalExperience(candidate, sub),
    'Relevant Exp': resolveTrackerRelevantExperience(candidate, sub),
    'Current Location': resolveTrackerCurrentLocation(candidate, sub),
    'Job Location': resolveTrackerJobLocation(requirement),
    'Current Organization': resolveTrackerCurrentOrganization(candidate),
    'Rate per Month': resolveTrackerRatePerMonth(candidate, requirement, sub),
  };
}

export function toLttsApiRows(rows: LttsTrackerRowState[]): LttsTrackerRowPayload[] {
  return rows.map(({ candidateId: _id, ...rest }) => rest);
}
