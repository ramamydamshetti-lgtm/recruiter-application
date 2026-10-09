import type { Candidate, CandidateSubmission } from '@/lib/domain/candidates/types';
import type { Requirement } from '@/lib/domain/requirements/types';
import {
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
  resolveTrackerQualification,
  resolveTrackerReasonForChange,
  resolveTrackerRelevantExperience,
  resolveTrackerTotalExperience,
  TRACKER_EMPTY,
} from '@/lib/domain/submissions/trackerFieldResolvers';

/** Must match backend `ITC_INFOTECH_TRACKER_HEADERS` exactly. */
export const ITC_INFOTECH_TRACKER_HEADERS = [
  'Name',
  'Email',
  'Phone',
  'Current company',
  'Skills / Technologies',
  'Total years of experience',
  'Relevant experience',
  'Highest qualification',
  'Current CTC',
  'Expected CTC',
  'Current location',
  'Preferred location',
  'Availability for Interview',
  'Notice period (last working day)',
  'Offer in hand',
  'Reason for job change',
  'LinkedIn URL',
] as const;

export type ItcInfotechTrackerHeader = (typeof ITC_INFOTECH_TRACKER_HEADERS)[number];

export type ItcInfotechTrackerRowPayload = Record<ItcInfotechTrackerHeader, string>;

export type ItcInfotechTrackerRowState = ItcInfotechTrackerRowPayload & {
  candidateId: string;
};

function offerInHandDisplay(candidate: Candidate, sub?: CandidateSubmission): string {
  if (sub?.offerInHand !== undefined) {
    if (!sub.offerInHand) return 'No';
    const bits: string[] = ['Yes'];
    if (sub.offerInHandCompany != null && sub.offerInHandCompany !== '') {
      bits.push(sub.offerInHandCompany);
    }
    if (sub.offerInHandAmount != null && sub.offerInHandAmount !== '') {
      bits.push(sub.offerInHandAmount);
    }
    return bits.join(' — ');
  }
  const o = candidate.offerInHand;
  return o != null && o !== '' ? o : TRACKER_EMPTY;
}

export function buildItcInfotechTrackerRow(
  candidate: Candidate,
  _requirement: Requirement,
  submission: CandidateSubmission | undefined,
  _index: number,
): ItcInfotechTrackerRowState {
  const sub = submission;
  return {
    candidateId: candidate.id,
    Name: resolveTrackerCandidateName(candidate),
    Email: resolveTrackerCandidateEmail(candidate),
    Phone: resolveTrackerCandidatePhone(candidate),
    'Current company': resolveTrackerCurrentOrganization(candidate),
    'Skills / Technologies': resolveTrackerCandidateSkills(candidate),
    'Total years of experience': resolveTrackerTotalExperience(candidate, sub),
    'Relevant experience': resolveTrackerRelevantExperience(candidate, sub),
    'Highest qualification': resolveTrackerQualification(candidate, sub),
    'Current CTC': resolveTrackerCurrentCtc(candidate, sub),
    'Expected CTC': resolveTrackerExpectedCtc(candidate, sub),
    'Current location': resolveTrackerCurrentLocation(candidate, sub),
    'Preferred location': resolveTrackerPreferredLocation(candidate, sub),
    'Availability for Interview': resolveTrackerAvailability(candidate, sub),
    'Notice period (last working day)': resolveTrackerNoticePeriod(candidate, sub),
    'Offer in hand': offerInHandDisplay(candidate, sub),
    'Reason for job change': resolveTrackerReasonForChange(candidate, sub),
    'LinkedIn URL': resolveTrackerLinkedin(candidate, sub),
  };
}

export function toItcInfotechApiRows(rows: ItcInfotechTrackerRowState[]): ItcInfotechTrackerRowPayload[] {
  return rows.map((r) => {
    const { candidateId: _id, ...rest } = r;
    return rest;
  });
}
