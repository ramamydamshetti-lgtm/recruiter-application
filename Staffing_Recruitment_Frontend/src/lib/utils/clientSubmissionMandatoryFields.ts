import type { Candidate } from '@/lib/domain/candidates/types';

function highestQualificationDisplay(candidate: Candidate): string {
  const h = candidate.highestQualification?.trim();
  if (h) return h;
  const edu = candidate.education ?? [];
  return edu.map((x) => String(x).trim()).filter(Boolean).join(', ');
}

/**
 * Human-readable labels for fields required before client submission email.
 * Mirrors backend `listMissingClientSubmissionFields` in notifications.ts.
 * Submission-level overrides (relevant experience, reason, offer) are validated on the server after internal submit.
 */
export function getMissingClientSubmissionFields(candidate: Candidate): string[] {
  const missing: string[] = [];
  if (!candidate.name?.trim()) missing.push('Name');
  if (!candidate.email?.trim()) missing.push('Email');
  if (!candidate.phone?.trim()) missing.push('Phone number');
  const company = candidate.currentEmployer?.trim();
  if (!company) missing.push('Current company');
  const skills = candidate.skills ?? [];
  const technologies = candidate.technologies ?? [];
  const hasSkillOrTech =
    skills.some((x) => String(x).trim()) || technologies.some((x) => String(x).trim());
  if (!hasSkillOrTech) missing.push('Skills and technologies');
  const ctc = candidate.currentSalary?.trim();
  if (!ctc) missing.push('Current CTC');
  const loc = candidate.currentLocation?.trim() || candidate.location?.trim();
  if (!loc) missing.push('Current location');
  const avail = String(candidate.availableForInterview ?? '').trim();
  if (!avail) missing.push('Availability for interview');
  const te = candidate.totalExperience;
  const hasNumericTotal = te != null && Number.isFinite(Number(te));
  const hasLabel = candidate.experienceLabel?.trim();
  if (!hasNumericTotal && !hasLabel) missing.push('Total years of experience');

  if (!highestQualificationDisplay(candidate).trim()) missing.push('Highest qualification');
  if (!String(candidate.relevantExperience ?? '').trim()) missing.push('Relevant experience');
  if (!String(candidate.expectedSalary ?? '').trim()) missing.push('Expected CTC');
  if (!String(candidate.preferredLocation ?? '').trim()) missing.push('Preferred location');
  if (!String(candidate.offerInHand ?? '').trim()) missing.push('Offer in hand');
  if (!String(candidate.reasonForJobChange ?? '').trim()) missing.push('Reason for job change');
  if (!String(candidate.noticePeriod ?? '').trim()) missing.push('Notice period (last working day)');

  return missing;
}
