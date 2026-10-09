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
  resolveTrackerNotes,
  resolveTrackerNoticePeriod,
  resolveTrackerPreferredLocation,
  resolveTrackerRelevantExperience,
  resolveTrackerTotalExperience,
  TRACKER_EMPTY,
} from '@/lib/domain/submissions/trackerFieldResolvers';

/** Must match backend `HAPPIEST_MINDS_TRACKER_HEADERS` exactly. */
export const HAPPIEST_MINDS_TRACKER_HEADERS = [
  'Source Name',
  'Profile Recd date',
  'Candidate Name',
  'Skill',
  'Candidate Mobile number',
  'Candidate email ID',
  'Current Company',
  'Total Exp',
  'Relevant Exp',
  'CTC',
  'ECTC/Rate card',
  'Counter Offer CTC',
  'Notice Period',
  'Tentative DOJ',
  'Current Location',
  'Preferred Location',
  'Available date and time for Open Interview',
  'Remarks',
] as const;

export type HappiestMindsTrackerHeader = (typeof HAPPIEST_MINDS_TRACKER_HEADERS)[number];

export type HappiestMindsTrackerRowPayload = Record<HappiestMindsTrackerHeader, string>;

export type HappiestMindsTrackerRowState = HappiestMindsTrackerRowPayload & {
  candidateId: string;
};

/** Default recruitment source label for Happiest Minds tracker. */
export const HAPPIEST_MINDS_DEFAULT_SOURCE = 'MetaForge';

function counterOfferCtcDisplay(candidate: Candidate, sub?: CandidateSubmission): string {
  if (sub?.offerInHand === true && sub.offerInHandAmount != null && sub.offerInHandAmount !== '') {
    return sub.offerInHandAmount;
  }
  const offers = sub?.offerInHandDetails?.offers ?? candidate.offerInHandDetails?.offers;
  if (offers?.length) {
    const ctcs = offers.map((o) => o.ctc).filter((v) => v != null && v !== '') as string[];
    if (ctcs.length) return ctcs.join('; ');
  }
  if (candidate.offerInHandAmount != null && candidate.offerInHandAmount !== '') {
    return candidate.offerInHandAmount;
  }
  return TRACKER_EMPTY;
}

function openInterviewAvailability(candidate: Candidate): string {
  const s = candidate.availableForInterview;
  return s != null && s !== '' ? s : TRACKER_EMPTY;
}

export function buildHappiestMindsTrackerRow(
  candidate: Candidate,
  requirement: Requirement,
  submission: CandidateSubmission | undefined,
): HappiestMindsTrackerRowState {
  const sub = submission;
  return {
    candidateId: candidate.id,
    'Source Name': HAPPIEST_MINDS_DEFAULT_SOURCE,
    'Profile Recd date': formatTrackerSubmissionDate(sub),
    'Candidate Name': resolveTrackerCandidateName(candidate),
    Skill: resolveTrackerCandidateSkills(candidate),
    'Candidate Mobile number': resolveTrackerCandidatePhone(candidate),
    'Candidate email ID': resolveTrackerCandidateEmail(candidate),
    'Current Company': resolveTrackerCurrentOrganization(candidate),
    'Total Exp': resolveTrackerTotalExperience(candidate, sub),
    'Relevant Exp': resolveTrackerRelevantExperience(candidate, sub),
    CTC: resolveTrackerCurrentCtc(candidate, sub),
    'ECTC/Rate card': resolveTrackerExpectedCtc(candidate, sub),
    'Counter Offer CTC': counterOfferCtcDisplay(candidate, sub),
    'Notice Period': resolveTrackerNoticePeriod(candidate, sub),
    'Tentative DOJ': TRACKER_EMPTY,
    'Current Location': resolveTrackerCurrentLocation(candidate, sub),
    'Preferred Location': resolveTrackerPreferredLocation(candidate, sub),
    'Available date and time for Open Interview': openInterviewAvailability(candidate),
    Remarks: resolveTrackerNotes(candidate),
  };
}

export function toHappiestMindsApiRows(
  rows: HappiestMindsTrackerRowState[],
): HappiestMindsTrackerRowPayload[] {
  return rows.map(({ candidateId: _id, ...rest }) => rest);
}
