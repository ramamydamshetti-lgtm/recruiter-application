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
  resolveTrackerLinkedin,
  resolveTrackerNoticePeriod,
  resolveTrackerPreferredLocation,
  resolveTrackerReasonForChange,
  resolveTrackerRelevantExperience,
  resolveTrackerTotalExperience,
  TRACKER_EMPTY,
} from '@/lib/domain/submissions/trackerFieldResolvers';

/** Must match backend `METAFORGE_INTERNAL_TRACKER_HEADERS` exactly. */
export const METAFORGE_INTERNAL_TRACKER_HEADERS = [
  'Sl No',
  'Submission Date',
  'Skillset',
  'Candidate Name',
  'Contact Number',
  'Email id',
  'Total Yrs of Exp',
  'Relevant Exp',
  'Current Company',
  'Current CTC',
  'Expected CTC/Rate card',
  'Notice period',
  'Current Location',
  'Preferred Location',
  'Availability for Interview',
  'Reason',
  'Offer in Hand',
  'Linkedin URL',
] as const;

export type MetaforgeInternalTrackerHeader = (typeof METAFORGE_INTERNAL_TRACKER_HEADERS)[number];

export type MetaforgeTrackerRowPayload = Record<MetaforgeInternalTrackerHeader, string>;

export type MetaforgeTrackerRowState = MetaforgeTrackerRowPayload & {
  candidateId: string;
};

function offerInHandDisplay(candidate: Candidate, sub?: CandidateSubmission): string {
  if (sub?.offerInHand === true) {
    const offers = sub.offerInHandDetails?.offers;
    if (offers?.length) {
      const text = offers
        .map((o) => [o.company, o.ctc].filter(Boolean).join(' — '))
        .filter(Boolean)
        .join('; ');
      if (text) return text;
    }
    const parts = [sub.offerInHandCompany, sub.offerInHandAmount].filter(
      (v) => v != null && v !== '',
    );
    return parts.length ? `Yes — ${parts.join(' / ')}` : 'Yes';
  }
  if (sub?.offerInHand === false) return 'No';
  const o = candidate.offerInHand;
  return o != null && o !== '' ? o : TRACKER_EMPTY;
}

export function buildMetaforgeTrackerRow(
  candidate: Candidate,
  requirement: Requirement,
  submission: CandidateSubmission | undefined,
  serialNo: number,
): MetaforgeTrackerRowState {
  const sub = submission;
  return {
    candidateId: candidate.id,
    'Sl No': String(serialNo),
    'Submission Date': formatTrackerSubmissionDate(sub),
    Skillset: resolveTrackerCandidateSkills(candidate),
    'Candidate Name': resolveTrackerCandidateName(candidate),
    'Contact Number': resolveTrackerCandidatePhone(candidate),
    'Email id': resolveTrackerCandidateEmail(candidate),
    'Total Yrs of Exp': resolveTrackerTotalExperience(candidate, sub),
    'Relevant Exp': resolveTrackerRelevantExperience(candidate, sub),
    'Current Company': resolveTrackerCurrentOrganization(candidate),
    'Current CTC': resolveTrackerCurrentCtc(candidate, sub),
    'Expected CTC/Rate card': resolveTrackerExpectedCtc(candidate, sub),
    'Notice period': resolveTrackerNoticePeriod(candidate, sub),
    'Current Location': resolveTrackerCurrentLocation(candidate, sub),
    'Preferred Location': resolveTrackerPreferredLocation(candidate, sub),
    'Availability for Interview': resolveTrackerAvailability(candidate, sub),
    Reason: resolveTrackerReasonForChange(candidate, sub),
    'Offer in Hand': offerInHandDisplay(candidate, sub),
    'Linkedin URL': resolveTrackerLinkedin(candidate, sub),
  };
}

export function toMetaforgeApiRows(rows: MetaforgeTrackerRowState[]): MetaforgeTrackerRowPayload[] {
  return rows.map(({ candidateId: _id, ...rest }) => rest);
}
