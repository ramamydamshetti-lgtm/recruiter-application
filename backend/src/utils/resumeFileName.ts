type ResumeNameInput = {
  name: string;
  skills?: string[] | null;
  technologies?: string[] | null;
  totalExperience?: number | null;
  experienceLabel?: string | null;
};

function sanitizeToken(raw: string, maxLen = 40): string {
  const cleaned = String(raw ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '')
    .slice(0, maxLen);
  return cleaned || 'Candidate';
}

function parseExperienceParts(input: ResumeNameInput): { years: number; months: number } {
  const label = String(input.experienceLabel ?? '').trim();
  const ym = label.match(/^(\d{1,2})\s*(?:years?|yrs?)\s+(\d{1,2})\s*(?:months?|mos?\.?)$/i);
  if (ym) {
    return {
      years: Number.parseInt(ym[1] ?? '0', 10),
      months: Number.parseInt(ym[2] ?? '0', 10),
    };
  }
  const decimal = label.match(/^(\d{1,2})\.(\d{1,2})\s*(?:years?|yrs?)?$/i);
  if (decimal) {
    return {
      years: Number.parseInt(decimal[1] ?? '0', 10),
      months: Number.parseInt(decimal[2] ?? '0', 10),
    };
  }
  const yearsOnly = label.match(/^(\d{1,2})\s*(?:years?|yrs?)$/i);
  if (yearsOnly) {
    return { years: Number.parseInt(yearsOnly[1] ?? '0', 10), months: 0 };
  }
  const monthsOnly = label.match(/^(\d{1,3})\s*(?:months?|mos?\.?)$/i);
  if (monthsOnly) {
    return { years: 0, months: Number.parseInt(monthsOnly[1] ?? '0', 10) };
  }
  const n = input.totalExperience;
  if (n != null && Number.isFinite(Number(n)) && Number(n) > 0) {
    return { years: Math.trunc(Number(n)), months: 0 };
  }
  return { years: 0, months: 0 };
}

function formatExperienceForFileName(input: ResumeNameInput): string {
  const { years, months } = parseExperienceParts(input);
  if (years > 0 && months > 0) return `${years}Years${months}Months`;
  if (years > 0) return `${years}Years`;
  if (months > 0) return `${months}Months`;
  return '0Years';
}

function primarySkill(input: ResumeNameInput): string {
  for (const list of [input.skills ?? [], input.technologies ?? []]) {
    for (const item of list) {
      const s = String(item ?? '').trim();
      if (s) return sanitizeToken(s, 24);
    }
  }
  return 'General';
}

/** `CandidateName_PrimarySkill_TotalExperience_Metaforge.pdf` */
export function buildResumeDownloadFileName(
  input: ResumeNameInput,
  ext = '.pdf',
): string {
  const namePart = sanitizeToken(input.name, 32);
  const skillPart = primarySkill(input);
  const expPart = formatExperienceForFileName(input);
  const safeExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  return `${namePart}_${skillPart}_${expPart}_Metaforge${safeExt}`;
}
