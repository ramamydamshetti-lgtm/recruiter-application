import type { Candidate } from '@/lib/domain/candidates/types';
import { parseFlexibleExperienceInput } from '@/lib/utils/candidateExperienceInput';

export type ResumeFileNameInput = Pick<
  Candidate,
  'name' | 'skills' | 'technologies' | 'experienceLabel' | 'totalExperience'
>;

function sanitizeToken(raw: string, maxLen = 40): string {
  const cleaned = String(raw ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '')
    .slice(0, maxLen);
  return cleaned || 'Candidate';
}

function formatExperienceForFileName(candidate: ResumeFileNameInput): string {
  const label = candidate.experienceLabel?.trim();
  if (label) {
    const parsed = parseFlexibleExperienceInput(label);
    if (parsed) {
      if (parsed.years > 0 && parsed.months > 0) {
        return `${parsed.years}Years${parsed.months}Months`;
      }
      if (parsed.years > 0) return `${parsed.years}Years`;
      if (parsed.months > 0) return `${parsed.months}Months`;
    }
  }
  const n = candidate.totalExperience;
  if (n != null && Number.isFinite(Number(n)) && Number(n) > 0) {
    return `${Math.trunc(Number(n))}Years`;
  }
  return '0Years';
}

function primarySkill(candidate: ResumeFileNameInput): string {
  for (const list of [candidate.skills ?? [], candidate.technologies ?? []]) {
    for (const item of list) {
      const s = String(item ?? '').trim();
      if (s) return sanitizeToken(s, 24);
    }
  }
  return 'General';
}

export function buildResumeDownloadFileName(candidate: ResumeFileNameInput, ext = '.pdf'): string {
  const namePart = sanitizeToken(candidate.name, 32);
  const skillPart = primarySkill(candidate);
  const expPart = formatExperienceForFileName(candidate);
  const safeExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  return `${namePart}_${skillPart}_${expPart}_Metaforge${safeExt}`;
}
