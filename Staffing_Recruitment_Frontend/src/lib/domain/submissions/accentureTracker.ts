import type { Candidate, CandidateSubmission } from '@/lib/domain/candidates/types';
import type { Requirement } from '@/lib/domain/requirements/types';
import {
  formatTrackerSubmissionDate,
  resolveTrackerCandidateEmail,
  resolveTrackerCandidateName,
  resolveTrackerCandidatePhone,
  resolveTrackerCandidateSkills,
  resolveTrackerCurrentLocation,
  resolveTrackerCurrentOrganization,
  resolveTrackerExpectedCtc,
  resolveTrackerNoticePeriod,
  resolveTrackerPreferredLocation,
  resolveTrackerRelevantExperience,
  resolveTrackerTotalExperience,
} from '@/lib/domain/submissions/trackerFieldResolvers';

/**
 * Column order matches the Accenture tracker image (locations & rate card before contact/skills).
 * Must match backend `ACCENTURE_TRACKER_HEADERS` exactly.
 */
export const ACCENTURE_TRACKER_HEADERS = [
  'Submission Date',
  'Name of candidate',
  'Email ID',
  'Current Location',
  'Preferred Location',
  'Notice Period',
  'Rate Card',
  'Contact Number',
  'Skill',
  'Current company',
  'Total Experience',
  'Relevant Experience',
] as const;

export type AccentureTrackerHeader = (typeof ACCENTURE_TRACKER_HEADERS)[number];

export type AccentureTrackerRowPayload = Record<AccentureTrackerHeader, string>;

export type AccentureTrackerRowState = AccentureTrackerRowPayload & {
  candidateId: string;
};

export function buildAccentureTrackerRow(
  candidate: Candidate,
  requirement: Requirement,
  submission: CandidateSubmission | undefined,
): AccentureTrackerRowState {
  const sub = submission;
  return {
    candidateId: candidate.id,
    'Submission Date': formatTrackerSubmissionDate(sub),
    'Name of candidate': resolveTrackerCandidateName(candidate),
    'Email ID': resolveTrackerCandidateEmail(candidate),
    'Current Location': resolveTrackerCurrentLocation(candidate, sub),
    'Preferred Location': resolveTrackerPreferredLocation(candidate, sub),
    'Notice Period': resolveTrackerNoticePeriod(candidate, sub),
    'Rate Card': resolveTrackerExpectedCtc(candidate, sub),
    'Contact Number': resolveTrackerCandidatePhone(candidate),
    Skill: resolveTrackerCandidateSkills(candidate),
    'Current company': resolveTrackerCurrentOrganization(candidate),
    'Total Experience': resolveTrackerTotalExperience(candidate, sub),
    'Relevant Experience': resolveTrackerRelevantExperience(candidate, sub),
  };
}

export function toAccentureApiRows(rows: AccentureTrackerRowState[]): AccentureTrackerRowPayload[] {
  return rows.map(({ candidateId: _id, ...rest }) => rest);
}
