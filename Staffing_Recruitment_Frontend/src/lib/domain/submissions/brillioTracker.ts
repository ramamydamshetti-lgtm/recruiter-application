import type { Candidate, CandidateSubmission } from '@/lib/domain/candidates/types';
import type { Requirement } from '@/lib/domain/requirements/types';
import {
  formatTrackerSubmissionDate,
  resolveTrackerAvailability,
  resolveTrackerCandidateEmail,
  resolveTrackerCandidateName,
  resolveTrackerCandidatePhone,
  resolveTrackerCandidateSkills,
  resolveTrackerCurrentCtc,
  resolveTrackerCurrentLocation,
  resolveTrackerCurrentOrganization,
  resolveTrackerExpectedCtc,
  resolveTrackerNotes,
  resolveTrackerNoticePeriod,
  resolveTrackerPreferredLocation,
  resolveTrackerRelevantExperience,
  resolveTrackerTotalExperience,
  TRACKER_EMPTY,
} from '@/lib/domain/submissions/trackerFieldResolvers';

/** Must match backend `BRILLIO_TRACKER_HEADERS` exactly. */
export const BRILLIO_TRACKER_HEADERS = [
  'Sl No',
  'Date',
  'Vendor name',
  'Market / Bench Resource',
  'Mode of Hiring',
  'Hiring skill',
  'Candidate Name',
  'Contact No',
  'Email ID',
  'Current Company',
  'Total Exp',
  'Relevant exp in Skillset',
  'Current CTC',
  'EX CTC',
  'Current Location',
  'Preferred Location',
  'Notice period',
  'Remarks',
  'Screening/Interview',
] as const;

export type BrillioTrackerHeader = (typeof BRILLIO_TRACKER_HEADERS)[number];

export type BrillioTrackerRowPayload = Record<BrillioTrackerHeader, string>;

export type BrillioTrackerRowState = BrillioTrackerRowPayload & {
  candidateId: string;
};

export const BRILLIO_VENDOR_META_FORGE = 'MetaForge';

function modeOfHiring(requirement: Requirement): string {
  const e = requirement.employmentType;
  if (e == null || e === '') return TRACKER_EMPTY;
  if (/full/i.test(e) && !/contract/i.test(e)) return 'Full-time';
  if (/contract/i.test(e)) return 'Contract';
  return e;
}

export function buildBrillioTrackerRow(
  candidate: Candidate,
  requirement: Requirement,
  submission: CandidateSubmission | undefined,
  serialNo: number,
): BrillioTrackerRowState {
  const sub = submission;
  return {
    candidateId: candidate.id,
    'Sl No': String(serialNo),
    Date: formatTrackerSubmissionDate(sub),
    'Vendor name': BRILLIO_VENDOR_META_FORGE,
    'Market / Bench Resource': TRACKER_EMPTY,
    'Mode of Hiring': modeOfHiring(requirement),
    'Hiring skill': resolveTrackerCandidateSkills(candidate),
    'Candidate Name': resolveTrackerCandidateName(candidate),
    'Contact No': resolveTrackerCandidatePhone(candidate),
    'Email ID': resolveTrackerCandidateEmail(candidate),
    'Current Company': resolveTrackerCurrentOrganization(candidate),
    'Total Exp': resolveTrackerTotalExperience(candidate, sub),
    'Relevant exp in Skillset': resolveTrackerRelevantExperience(candidate, sub),
    'Current CTC': resolveTrackerCurrentCtc(candidate, sub),
    'EX CTC': resolveTrackerExpectedCtc(candidate, sub),
    'Current Location': resolveTrackerCurrentLocation(candidate, sub),
    'Preferred Location': resolveTrackerPreferredLocation(candidate, sub),
    'Notice period': resolveTrackerNoticePeriod(candidate, sub),
    Remarks: resolveTrackerNotes(candidate),
    'Screening/Interview': resolveTrackerAvailability(candidate, sub),
  };
}

export function toBrillioApiRows(rows: BrillioTrackerRowState[]): BrillioTrackerRowPayload[] {
  return rows.map(({ candidateId: _id, ...rest }) => ({
    ...rest,
    'Vendor name': BRILLIO_VENDOR_META_FORGE,
  }));
}
