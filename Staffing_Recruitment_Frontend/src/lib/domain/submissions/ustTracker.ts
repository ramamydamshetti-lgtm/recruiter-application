import type { Candidate, CandidateSubmission } from '@/lib/domain/candidates/types';
import { sanitizeClientFacingCellValue } from '@/lib/domain/submissions/clientFacingValue';
import type { Requirement } from '@/lib/domain/requirements/types';
import {
  formatTrackerSubmissionDate,
  resolveTrackerAvailability,
  resolveTrackerCandidateEmail,
  resolveTrackerCandidateName,
  resolveTrackerCandidatePhone,
  resolveTrackerCandidateRef,
  resolveTrackerCandidateSkills,
  resolveTrackerCurrentCtc,
  resolveTrackerCurrentLocation,
  resolveTrackerCurrentOrganization,
  resolveTrackerExpectedCtc,
  resolveTrackerNotes,
  resolveTrackerNoticePeriod,
  resolveTrackerPreferredLocation,
  resolveTrackerRequirementSkills,
  resolveTrackerRelevantExperience,
  resolveTrackerTotalExperience,
  TRACKER_EMPTY,
} from '@/lib/domain/submissions/trackerFieldResolvers';

/** Must match backend `UST_TRACKER_HEADERS` exactly (incl. `Availablity` spelling). */
export const UST_TRACKER_HEADERS = [
  'Account',
  'Profile Submission Date',
  'SO Number',
  'Recruiter Name',
  'Recruiter UID',
  'Source',
  'Sub Source',
  'Mandatory Skill',
  'Skill combinations',
  'Candidate Status',
  'Detailed Status',
  'Hire Type',
  'RH ID',
  'Candidate Name',
  'Contact Number',
  'Email id',
  'Total Yrs of Exp',
  'Relevant Exp',
  'Current Company',
  'Current CTC',
  'Expected CTC/Rate card',
  'Notice period',
  'Buyout(Y/N)',
  'Ex-Employee(Y/N)',
  'If Rehire Ex- Employee ID',
  'Current Location',
  'Preferred Location',
  'Remarks',
  'Screening Interview',
  'Availablity',
] as const;

export type UstTrackerHeader = (typeof UST_TRACKER_HEADERS)[number];

export type UstTrackerRowPayload = Record<UstTrackerHeader, string>;

export type UstTrackerRowState = UstTrackerRowPayload & {
  candidateId: string;
};

export type UstRecruiterContext = {
  id: string;
  name: string;
};

const DEFAULT_SOURCE = 'MetaForge';

function hireType(requirement: Requirement): string {
  const e = requirement.employmentType;
  if (e == null || e === '') return TRACKER_EMPTY;
  if (/full/i.test(e) && !/contract/i.test(e)) return 'Fulltime';
  if (/contract/i.test(e)) return 'Contract';
  return e;
}

function screeningInterviewDisplay(candidate: Candidate, sub?: CandidateSubmission): string {
  const avail = resolveTrackerAvailability(candidate, sub);
  if (avail === 'Yes' || avail === 'Available') return 'Yes';
  if (avail === 'No' || avail === 'Not available') return 'No';
  return avail;
}

export function buildUstTrackerRow(
  candidate: Candidate,
  requirement: Requirement,
  submission: CandidateSubmission | undefined,
  recruiter: UstRecruiterContext | null,
): UstTrackerRowState {
  const sub = submission;
  const soNumber = sanitizeClientFacingCellValue(sub?.soNumber);
  return {
    candidateId: candidate.id,
    Account: requirement.clientLeadPoc != null && requirement.clientLeadPoc !== ''
      ? requirement.clientLeadPoc
      : TRACKER_EMPTY,
    'Profile Submission Date': formatTrackerSubmissionDate(sub),
    'SO Number': soNumber === '' ? TRACKER_EMPTY : soNumber,
    'Recruiter Name': recruiter?.name != null && recruiter.name !== '' ? recruiter.name : TRACKER_EMPTY,
    'Recruiter UID': recruiter?.id != null && recruiter.id !== '' ? recruiter.id : TRACKER_EMPTY,
    Source: DEFAULT_SOURCE,
    'Sub Source': TRACKER_EMPTY,
    'Mandatory Skill': resolveTrackerRequirementSkills(requirement),
    'Skill combinations': resolveTrackerCandidateSkills(candidate),
    'Candidate Status': sub?.status != null && String(sub.status) !== '' ? String(sub.status) : TRACKER_EMPTY,
    'Detailed Status': TRACKER_EMPTY,
    'Hire Type': hireType(requirement),
    'RH ID': resolveTrackerCandidateRef(candidate),
    'Candidate Name': resolveTrackerCandidateName(candidate),
    'Contact Number': resolveTrackerCandidatePhone(candidate),
    'Email id': resolveTrackerCandidateEmail(candidate),
    'Total Yrs of Exp': resolveTrackerTotalExperience(candidate, sub),
    'Relevant Exp': resolveTrackerRelevantExperience(candidate, sub),
    'Current Company': resolveTrackerCurrentOrganization(candidate),
    'Current CTC': resolveTrackerCurrentCtc(candidate, sub),
    'Expected CTC/Rate card': resolveTrackerExpectedCtc(candidate, sub),
    'Notice period': resolveTrackerNoticePeriod(candidate, sub),
    'Buyout(Y/N)': TRACKER_EMPTY,
    'Ex-Employee(Y/N)': TRACKER_EMPTY,
    'If Rehire Ex- Employee ID': TRACKER_EMPTY,
    'Current Location': resolveTrackerCurrentLocation(candidate, sub),
    'Preferred Location': resolveTrackerPreferredLocation(candidate, sub),
    Remarks: resolveTrackerNotes(candidate),
    'Screening Interview': TRACKER_EMPTY,
    Availablity: resolveTrackerAvailability(candidate, sub),
  };
}

export function toUstApiRows(rows: UstTrackerRowState[]): UstTrackerRowPayload[] {
  return rows.map(({ candidateId: _id, ...rest }) => rest);
}
