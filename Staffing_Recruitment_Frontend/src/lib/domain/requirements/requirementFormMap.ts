import type { Requirement, RequirementStatus } from '@/lib/domain/requirements/types';
import {
  REQUIREMENT_FROM_CUSTOM,
  SUBMISSION_CLIENTS,
} from '@/lib/domain/submissions/constants';

const EXPERIENCE_FORM_PRESETS = [
  '0-1 years',
  '1-2 years',
  '2-4 years',
  '4-6 years',
  '6-8 years',
  '8-10 years',
  '10+ years',
  'Fresher',
] as const;

const EXPERIENCE_LEVELS = [
  'Entry Level',
  'Junior',
  'Mid-Senior',
  'Senior',
  'Lead',
  'Principal',
  'Director',
] as const;

const EMPLOYMENT_TYPES = [
  'Full-time',
  'Contract',
] as const;

const WORK_MODES = ['On-site', 'Remote', 'Hybrid'] as const;

function mapApiStatusToForm(raw: string | undefined): RequirementStatus {
  const u = String(raw ?? 'Open').trim().toUpperCase();
  const m: Record<string, RequirementStatus> = {
    OPEN: 'Open',
    ASSIGNED: 'Assigned',
    SUBMITTED: 'Submitted',
    INTERVIEW: 'Interview',
    SELECTED: 'Selected',
    REJECTED: 'Rejected',
    CLOSED: 'Closed',
  };
  return m[u] ?? (raw as RequirementStatus) ?? 'Open';
}

function mapPriority(raw: string | undefined): 'High' | 'Medium' | 'Low' {
  const u = String(raw ?? 'Medium').trim().toUpperCase();
  if (u === 'HIGH') return 'High';
  if (u === 'LOW') return 'Low';
  return 'Medium';
}

function pickAllowed<T extends readonly string[]>(
  val: string | undefined,
  allowed: T,
): T[number] | undefined {
  if (!val || val === 'Not specified') return undefined;
  const found = allowed.find((x) => x.toLowerCase() === val.trim().toLowerCase());
  return found as T[number] | undefined;
}

function mapExperienceToForm(exp: string | undefined): { overallExperience: string; overallExperienceCustom: string } {
  const s = (exp ?? '').trim();
  if (!s) return { overallExperience: '', overallExperienceCustom: '' };
  const lower = s.toLowerCase();
  for (const preset of EXPERIENCE_FORM_PRESETS) {
    if (lower === preset.toLowerCase()) {
      return { overallExperience: preset, overallExperienceCustom: '' };
    }
  }
  return { overallExperience: 'custom', overallExperienceCustom: s };
}

function mapSubmittingTo(r: Requirement): { submittingTo: string; submittingToCustom: string } {
  const raw = (r.submittingTo ?? '').trim();
  if (!raw) {
    return { submittingTo: SUBMISSION_CLIENTS[0]!.value, submittingToCustom: '' };
  }
  const byValue = SUBMISSION_CLIENTS.find((c) => c.value === raw);
  if (byValue) return { submittingTo: byValue.value, submittingToCustom: '' };
  const byLabel = SUBMISSION_CLIENTS.find((c) => c.label.toLowerCase() === raw.toLowerCase());
  if (byLabel) return { submittingTo: byLabel.value, submittingToCustom: '' };
  return { submittingTo: REQUIREMENT_FROM_CUSTOM, submittingToCustom: raw };
}

function mapDemandType(raw: string | undefined): 'Single' | 'Multiple' | 'Bulk' {
  const u = String(raw ?? 'Single').trim();
  const cap = u.charAt(0).toUpperCase() + u.slice(1).toLowerCase();
  if (cap === 'Single' || cap === 'Multiple' || cap === 'Bulk') return cap as 'Single' | 'Multiple' | 'Bulk';
  const up = u.toUpperCase();
  if (up === 'SINGLE') return 'Single';
  if (up === 'MULTIPLE') return 'Multiple';
  if (up === 'BULK') return 'Bulk';
  return 'Single';
}

const REQ_FULL = /^REQ-\d{4}-\d{2}-\d{2}-\d{3}$/;

/** Map API/store requirement into Create Requirement form default values. */
export function mapRequirementToFormDefaults(r: Requirement) {
  const trimmedReqId = (r.requirementId ?? '').trim();
  const ymd = r.createdAt?.slice(0, 10) || '2000-01-01';
  const rid = REQ_FULL.test(trimmedReqId) ? trimmedReqId : `REQ-${ymd}-001`;
  const created = r.createdAt ? r.createdAt.slice(0, 10) : '';
  const locs = (r.location ?? '')
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const { overallExperience, overallExperienceCustom } = mapExperienceToForm(r.experience);
  const { submittingTo, submittingToCustom } = mapSubmittingTo(r);
  const et = (r.employmentType ?? '').toLowerCase();
  const isContract = et === 'contract';
  const isFullTime = et.includes('full');
  let budget = '';
  if (isContract && r.monthlyBudget != null && Number.isFinite(Number(r.monthlyBudget))) {
    budget = String(r.monthlyBudget);
  } else if (isFullTime && r.yearlyBudget != null && Number.isFinite(Number(r.yearlyBudget))) {
    budget = String(r.yearlyBudget);
  } else if (r.overallBudget != null && Number.isFinite(Number(r.overallBudget))) {
    budget = String(r.overallBudget);
  }
  const budgetCurrency =
    r.budgetCurrency === 'USD' || r.budgetCurrency === 'EUR' || r.budgetCurrency === 'INR'
      ? r.budgetCurrency
      : 'INR';

  const closed =
    r.closedDate && typeof r.closedDate === 'string' ? r.closedDate.slice(0, 10) : '';

  return {
    jobId: rid,
    demandReceivedDate: created,
    internalPoc: r.internalPoc ?? '',
    submittingTo,
    submittingToCustom,
    clientLeadPoc: r.clientLeadPoc && r.clientLeadPoc !== 'Not specified' ? r.clientLeadPoc : '',
    clientPoc: r.clientPoc && r.clientPoc !== 'Not specified' ? r.clientPoc : '',
    sourceEmailSubject: r.sourceEmailSubject?.trim() ?? '',
    jobTitle: r.roleTitle ?? '',
    jobStatus: mapApiStatusToForm(r.status),
    closedDate: closed,
    demandType: mapDemandType(r.demandType),
    priority: mapPriority(r.priority),
    positions: r.openPositions ?? 1,
    experienceLevel: pickAllowed(r.experienceLevel, EXPERIENCE_LEVELS),
    employmentType: pickAllowed(r.employmentType, EMPLOYMENT_TYPES),
    workMode: pickAllowed(r.workMode, WORK_MODES),
    budgetAmountInr: budget,
    budgetCurrency,
    locations: locs,
    overallExperience,
    overallExperienceCustom,
    noticePeriod: r.noticePeriod && r.noticePeriod !== 'Not specified' ? r.noticePeriod : '',
    skills: Array.isArray(r.skills) ? [...r.skills] : [],
    technologies: Array.isArray(r.technologies) ? [...r.technologies] : [],
    jdUpload: '',
    jdDescription: '',
  };
}
