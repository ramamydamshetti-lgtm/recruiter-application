import type { Candidate, CandidateSubmission } from '@/lib/domain/candidates/types';
import type { Requirement } from '@/lib/domain/requirements/types';
import {
  formatTrackerSubmissionDate,
  resolveTrackerCandidateEmail,
  resolveTrackerCandidateName,
  resolveTrackerCandidatePhone,
  resolveTrackerCandidateSkills,
  resolveTrackerCurrentCtc,
  resolveTrackerCurrentLocation,
  resolveTrackerCurrentOrganization,
  resolveTrackerExpectedCtc,
  resolveTrackerNoticePeriod,
  resolveTrackerPreferredLocation,
  resolveTrackerRelevantExperience,
  resolveTrackerTotalExperience,
  TRACKER_EMPTY,
} from '@/lib/domain/submissions/trackerFieldResolvers';

/** Must match backend `KPMG_TRACKER_HEADERS` exactly. */
export const KPMG_TRACKER_HEADERS = [
  'Submission Date',
  'Name of candidate',
  'Email ID',
  'Contact Number',
  'Skill',
  'Current company',
  'Total Experience',
  'Relevant Experience',
  'Current Location',
  'Preferred Location',
  'Contract/ Fulltime',
  'Current CTC',
  'Expected CTC',
  'Notice Period',
  'Vendor',
] as const;

export type KpmgTrackerHeader = (typeof KPMG_TRACKER_HEADERS)[number];

export type KpmgTrackerRowPayload = Record<KpmgTrackerHeader, string>;

export type KpmgTrackerRowState = KpmgTrackerRowPayload & {
  candidateId: string;
};

/** Vendor column is always MetaForge for KPMG submissions. */
export const KPMG_VENDOR_META_FORGE = 'MetaForge';

function contractOrFulltime(requirement: Requirement): string {
  const e = requirement.employmentType;
  if (e == null || e === '') return TRACKER_EMPTY;
  if (/full/i.test(e) && !/contract/i.test(e)) return 'Fulltime';
  if (/contract/i.test(e)) return 'Contract';
  return e;
}

export function buildKpmgTrackerRow(
  candidate: Candidate,
  requirement: Requirement,
  submission: CandidateSubmission | undefined,
): KpmgTrackerRowState {
  const sub = submission;
  return {
    candidateId: candidate.id,
    'Submission Date': formatTrackerSubmissionDate(sub),
    'Name of candidate': resolveTrackerCandidateName(candidate),
    'Email ID': resolveTrackerCandidateEmail(candidate),
    'Contact Number': resolveTrackerCandidatePhone(candidate),
    Skill: resolveTrackerCandidateSkills(candidate),
    'Current company': resolveTrackerCurrentOrganization(candidate),
    'Total Experience': resolveTrackerTotalExperience(candidate, sub),
    'Relevant Experience': resolveTrackerRelevantExperience(candidate, sub),
    'Current Location': resolveTrackerCurrentLocation(candidate, sub),
    'Preferred Location': resolveTrackerPreferredLocation(candidate, sub),
    'Contract/ Fulltime': contractOrFulltime(requirement),
    'Current CTC': resolveTrackerCurrentCtc(candidate, sub),
    'Expected CTC': resolveTrackerExpectedCtc(candidate, sub),
    'Notice Period': resolveTrackerNoticePeriod(candidate, sub),
    Vendor: KPMG_VENDOR_META_FORGE,
  };
}

export function toKpmgApiRows(rows: KpmgTrackerRowState[]): KpmgTrackerRowPayload[] {
  return rows.map(({ candidateId: _id, ...rest }) => ({
    ...rest,
    Vendor: KPMG_VENDOR_META_FORGE,
  }));
}
