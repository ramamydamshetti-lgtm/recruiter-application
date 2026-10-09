'use client';

import React, { useCallback, useEffect, useRef, useState, useDeferredValue } from 'react';
import { useRouter } from 'next/navigation';
import { PageBackNav } from '@/components/ui/PageBackNav';
import { useForm, useWatch, Controller, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormSection } from '@/components/ui/FormSection';
import { FileUpload } from '@/components/ui/FileUpload';
import { Field, Select, Textarea, TextInput, inputBase } from '@/components/ui/Field';
import type { CurrentUserRole, RequirementStatus } from '@/lib/domain/requirements/types';
import { nextRequirementId, REQ_ID_REGEX, normalizeStatusForStore } from '@/lib/domain/requirements/logic';
import { getSuggestionsForJobTitle } from '@/lib/domain/requirements/jobTitleSuggestions';
import { getLocationSuggestions } from '@/lib/domain/requirements/locationSuggestions';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useRequirementsStore } from '@/lib/domain/requirements/store';
import {
  REQUIREMENT_FROM_CUSTOM,
  REQUIREMENT_FROM_SELECT_OPTIONS,
  SUBMISSION_CLIENTS,
} from '@/lib/domain/submissions/constants';
import { cn } from '@/lib/utils/cn';
import { parseBudgetInrInput } from '@/lib/utils/parseBudgetInr';
import type { Requirement } from '@/lib/domain/requirements/types';
import {
  DEMAND_RECEIVED_DATE_ERROR,
  getDemandReceivedDateBounds,
  isDemandReceivedDateAllowed,
} from '@/lib/domain/requirements/demandReceivedDate';
import { mapRequirementToFormDefaults } from '@/lib/domain/requirements/requirementFormMap';
import { updateRequirement as apiUpdateRequirement } from '@/lib/api/requirements';
import { extractJdFromFile, extractJdFromText, type JdExtractFormFields } from '@/lib/api/jdExtract';
import {
  acknowledgeFormDraftReload,
  beginFormDraftSession,
  endFormDraftSession,
  markFormDraftReloadPending,
  readFormDraft,
  writeFormDraft,
} from '@/lib/formDrafts';

const StatusSchema = z.enum([
  'Open',
  'Assigned',
  'Submitted',
  'Interview',
  'Selected',
  'Rejected',
  'Closed',
]);

const DemandTypeSchema = z.enum(['Single', 'Multiple', 'Bulk']);
const PrioritySchema = z.enum(['High', 'Medium', 'Low']);
const ExperienceLevelSchema = z.enum(['Entry Level', 'Junior', 'Mid-Senior', 'Senior', 'Lead', 'Principal', 'Director']);
const EmploymentTypeSchema = z.enum(['Full-time', 'Contract']);
const WorkModeSchema = z.enum(['On-site', 'Remote', 'Hybrid']);

const schema = z.object({
  jobId: z.string().regex(REQ_ID_REGEX, 'Requirement ID must match REQ-YYYY-MM-DD-XXX'),
  demandReceivedDate: z.string().min(1, 'Demand Received Date is required'),
  internalPoc: z.string().optional(),

  submittingTo: z.string().min(1, 'Requirement From is required'),
  submittingToCustom: z.string().optional(),
  clientLeadPoc: z.string().min(1, 'Client Lead POC is required'),
  clientPoc: z.string().optional(),
  /** Exact subject of the source requirement email (for reply-in-thread on manual demands). */
  sourceEmailSubject: z.string().optional(),
  jobTitle: z.string().min(1, 'Job Title is required'),
  jobStatus: StatusSchema,
  closedDate: z.string().optional(),
  demandType: DemandTypeSchema,
  priority: PrioritySchema,

  positions: z.coerce.number().int().min(1, 'Number of Positions must be at least 1'),
  experienceLevel: ExperienceLevelSchema.optional(),
  employmentType: EmploymentTypeSchema,
  workMode: WorkModeSchema.optional(),
  /** Whole currency units (see budgetCurrency), e.g. 1800000 INR / year or / month */
  budgetAmountInr: z.string(),
  budgetCurrency: z.enum(['INR', 'USD', 'EUR']).default('INR'),
  locations: z.array(z.string().min(1)).optional(),
  overallExperience: z.string().optional(),
  overallExperienceCustom: z.string().optional(),
  noticePeriod: z.string().optional(),
  skills: z.array(z.string().min(1)).min(1, 'Skills are required'),
  technologies: z.array(z.string().min(1)).optional(),

  jdDescription: z.string().optional(), // Optional: for Extract & Auto-fill only
  jdUpload: z.string().optional(), // Optional: for Extract & Auto-fill only
});

const refinedSchema = schema.superRefine((data, ctx) => {
  if (data.jobStatus === 'Closed' && !data.closedDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['closedDate'],
      message: 'Closed Date is required when status is Closed',
    });
  }

  if (data.overallExperience === 'custom' && (!data.overallExperienceCustom || !data.overallExperienceCustom.trim())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['overallExperienceCustom'],
      message: 'Enter custom experience range.',
    });
  }

  const amount = parseBudgetInrInput(data.budgetAmountInr);
  if (amount == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['budgetAmountInr'],
      message:
        'Enter a budget amount in the selected currency (e.g. 1800000 or 18 LPA for 18 lakh per year).',
    });
  }

  if (
    data.submittingTo === REQUIREMENT_FROM_CUSTOM &&
    (!data.submittingToCustom || !data.submittingToCustom.trim())
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['submittingToCustom'],
      message: 'Enter the company or source name.',
    });
  }
});

const createDemandDateRefinedSchema = refinedSchema.superRefine((data, ctx) => {
  if (!isDemandReceivedDateAllowed(data.demandReceivedDate)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['demandReceivedDate'],
      message: DEMAND_RECEIVED_DATE_ERROR,
    });
  }
});

type FormValues = z.infer<typeof schema>;

export type RequirementFormPageProps =
  | { mode?: 'create' }
  | { mode: 'edit'; editInternalId: string; initialRequirement: Requirement };

const CREATE_FORM_DEFAULTS: FormValues = {
  jobId: '',
  demandReceivedDate: '',
  internalPoc: '',
  submittingTo: SUBMISSION_CLIENTS[0]!.value,
  submittingToCustom: '',
  jobStatus: 'Open',
  demandType: 'Single',
  positions: 1,
  skills: [],
  technologies: [],
  jdUpload: '',
  jdDescription: '',
  clientLeadPoc: '',
  clientPoc: '',
  sourceEmailSubject: '',
  jobTitle: '',
  closedDate: '',
  locations: [],
  overallExperience: '',
  overallExperienceCustom: '',
  noticePeriod: '',
  priority: 'Medium',
  experienceLevel: 'Entry Level',
  employmentType: 'Full-time',
  workMode: 'On-site',
  budgetAmountInr: '',
  budgetCurrency: 'INR',
};

type RequirementCreateDraft = {
  values: FormValues;
  skillsInput: string;
  technologiesInput: string;
  locationInput: string;
};

function slugifySkill(raw: string) {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function RoleNotice() {
  const base =
    'rounded-2xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-md backdrop-blur dark:border-slate-700 dark:bg-slate-900/90';
  return (
    <div className={base}>
      <div className="font-semibold text-slate-800 dark:text-slate-200">Role: Recruiter</div>
      <div className="mt-1 text-slate-600 dark:text-slate-400">
        You can assign recruiters, reassign work, and autofill key details using the JD document.
      </div>
    </div>
  );
}

export function RequirementFormPage(props: RequirementFormPageProps) {
  const isEdit = props.mode === 'edit';
  const editInternalId = isEdit ? props.editInternalId : undefined;
  const initialRequirement = isEdit ? props.initialRequirement : undefined;

  const { currentUser } = useAuth();
  const currentUserRole = currentUser?.role?.toLowerCase() || 'recruiter';

  const router = useRouter();
  const { addRequirement, requirements, refresh } = useRequirementsStore();

  const defaultValues =
    isEdit && initialRequirement ? mapRequirementToFormDefaults(initialRequirement) : CREATE_FORM_DEFAULTS;

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    control,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(isEdit ? refinedSchema : createDemandDateRefinedSchema) as unknown as Resolver<FormValues>,
    defaultValues,
    mode: 'onSubmit',
  });

  const [demandReceivedDateBounds, setDemandReceivedDateBounds] = useState<{
    min: string;
    max: string;
  } | null>(null);
  const [skillsInput, setSkillsInput] = useState('');
  const [technologiesInput, setTechnologiesInput] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const preservedIdsRef = useRef<{ demandDate?: string; jobId?: string } | null>(null);
  const draftKeyRef = useRef<string | null>(null);
  const flushDraftRef = useRef<() => void>(() => {});

  flushDraftRef.current = () => {
    if (!draftKeyRef.current) return;
    writeFormDraft(draftKeyRef.current, {
      values: getValues(),
      skillsInput,
      technologiesInput,
      locationInput,
    } satisfies RequirementCreateDraft);
  };

  useEffect(() => {
    const bounds = getDemandReceivedDateBounds();
    setDemandReceivedDateBounds(bounds);

    if (isEdit) {
      setDraftHydrated(true);
      return;
    }

    const userId = currentUser?.id;
    if (!userId) {
      if (!getValues('demandReceivedDate')) {
        setValue('demandReceivedDate', bounds.max, { shouldValidate: true });
      }
      setDraftHydrated(true);
      return;
    }

    const session = beginFormDraftSession('requirement_create', userId);
    draftKeyRef.current = session.draftKey;

    const onBeforeUnload = () => {
      markFormDraftReloadPending('requirement_create', userId);
      flushDraftRef.current();
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    const draft = session.shouldRestore
      ? readFormDraft<RequirementCreateDraft>(session.draftKey)
      : null;

    if (session.shouldRestore && draft?.values) {
      reset({ ...CREATE_FORM_DEFAULTS, ...draft.values });
      setSkillsInput(draft.skillsInput ?? '');
      setTechnologiesInput(draft.technologiesInput ?? '');
      setLocationInput(draft.locationInput ?? '');
      const demandDate = draft.values.demandReceivedDate?.trim();
      const jobId = draft.values.jobId?.trim();
      if (demandDate || jobId) {
        preservedIdsRef.current = { demandDate: demandDate || undefined, jobId: jobId || undefined };
      }
      window.setTimeout(() => acknowledgeFormDraftReload('requirement_create', userId), 100);
    } else if (!session.shouldRestore) {
      reset({
        ...CREATE_FORM_DEFAULTS,
        demandReceivedDate: bounds.max,
      });
      setSkillsInput('');
      setTechnologiesInput('');
      setLocationInput('');
      setJdFile(null);
      preservedIdsRef.current = null;
    }

    setDraftHydrated(true);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [isEdit, currentUser?.id, reset, setValue, getValues]);

  const demandReceivedDate = useWatch({ control, name: 'demandReceivedDate' }) ?? '';

  useEffect(() => {
    if (isEdit || !draftHydrated) return;
    const dateYmd = demandReceivedDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) return;

    const currentJobId = String(getValues('jobId') ?? '').trim();
    const idPrefix = `REQ-${dateYmd}-`;

    const preserved = preservedIdsRef.current;
    if (preserved?.jobId && preserved.demandDate === dateYmd) {
      setValue('jobId', preserved.jobId, { shouldValidate: true });
      preservedIdsRef.current = null;
      return;
    }

    if (currentJobId && REQ_ID_REGEX.test(currentJobId) && currentJobId.startsWith(idPrefix)) {
      return;
    }

    const nextId = nextRequirementId(requirements, dateYmd);
    setValue('jobId', nextId, { shouldValidate: true });
  }, [demandReceivedDate, requirements, setValue, getValues, isEdit, draftHydrated]);

  const jobTitle = useWatch({ control, name: 'jobTitle' }) ?? '';
  const jobStatus = useWatch({ control, name: 'jobStatus' });
  const skills = useWatch({ control, name: 'skills' }) ?? [];
  const technologies = useWatch({ control, name: 'technologies' }) ?? [];
  const locations = useWatch({ control, name: 'locations' }) ?? [];
  const noticePeriod = useWatch({ control, name: 'noticePeriod' }) ?? '';
  const overallExperience = useWatch({ control, name: 'overallExperience' }) ?? '';
  const employmentType = useWatch({ control, name: 'employmentType' }) ?? 'Full-time';
  const submittingTo = useWatch({ control, name: 'submittingTo' }) ?? '';
  const jdDescription = useWatch({ control, name: 'jdDescription' }) ?? '';
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [extractLoading, setExtractLoading] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractSuccess, setExtractSuccess] = useState<string | null>(null);
  const deferredJobTitle = useDeferredValue(jobTitle);
  const deferredLocationInput = useDeferredValue(locationInput);

  const jobTitleSuggestions = React.useMemo(
    () => getSuggestionsForJobTitle(deferredJobTitle),
    [deferredJobTitle],
  );

  const locationSuggestions = React.useMemo(
    () => getLocationSuggestions(deferredLocationInput),
    [deferredLocationInput],
  );
  const topLocationSuggestions = React.useMemo(() => getLocationSuggestions('').slice(0, 15), []);

  useEffect(() => {
    if (jdFile) setValue('jdUpload', jdFile.name, { shouldValidate: true });
    else setValue('jdUpload', '', { shouldValidate: true });
  }, [jdFile, setValue]);

  const watchedFormValues = useWatch({ control });

  useEffect(() => {
    if (isEdit || !draftHydrated || !currentUser?.id || !draftKeyRef.current) return;
    const key = draftKeyRef.current;
    const timer = window.setTimeout(() => {
      writeFormDraft(key, {
        values: getValues(),
        skillsInput,
        technologiesInput,
        locationInput,
      } satisfies RequirementCreateDraft);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    watchedFormValues,
    skillsInput,
    technologiesInput,
    locationInput,
    isEdit,
    draftHydrated,
    currentUser?.id,
    getValues,
  ]);

  const applyExtractedFields = useCallback((data: JdExtractFormFields) => {
    let filled = 0;
    const mark = () => {
      filled += 1;
    };
    const isEmpty = (value: string | undefined | null) => !value?.trim();
    const hasLocations = () => (getValues('locations') ?? []).length > 0;
    const hasSkills = () => (getValues('skills') ?? []).length > 0;
    const hasTechnologies = () => (getValues('technologies') ?? []).length > 0;

    if (data.jobTitle?.trim() && isEmpty(getValues('jobTitle'))) {
      setValue('jobTitle', data.jobTitle.trim(), { shouldValidate: true });
      mark();
    }
    if (data.clientLeadPoc?.trim() && isEmpty(getValues('clientLeadPoc'))) {
      setValue('clientLeadPoc', data.clientLeadPoc.trim(), { shouldValidate: true });
      mark();
    }
    if (data.clientPoc?.trim() && isEmpty(getValues('clientPoc'))) {
      setValue('clientPoc', data.clientPoc.trim(), { shouldValidate: true });
      mark();
    }
    if (data.submittingTo?.trim() && isEmpty(getValues('submittingToCustom')) && getValues('submittingTo') === SUBMISSION_CLIENTS[0]!.value) {
      const slug = data.submittingTo.trim().toLowerCase();
      const preset = SUBMISSION_CLIENTS.find((c) => c.value === slug);
      if (preset) {
        setValue('submittingTo', preset.value, { shouldValidate: true });
        setValue('submittingToCustom', '', { shouldValidate: true });
      } else {
        setValue('submittingTo', REQUIREMENT_FROM_CUSTOM, { shouldValidate: true });
        setValue('submittingToCustom', data.submittingTo.trim(), { shouldValidate: true });
      }
      mark();
    }
    if (data.location?.trim() && !hasLocations()) {
      const locs = data.location.split(/[,;|/]/).map((x) => x.trim()).filter(Boolean);
      if (locs.length > 0) {
        setValue('locations', locs, { shouldValidate: true });
        mark();
      }
    }
    if (data.experience?.trim() && isEmpty(getValues('overallExperience')) && isEmpty(getValues('overallExperienceCustom'))) {
      setValue('overallExperience', 'custom', { shouldValidate: true });
      setValue('overallExperienceCustom', data.experience.trim(), { shouldValidate: true });
      mark();
    }
    if (data.experienceLevel?.trim() && isEmpty(getValues('experienceLevel'))) {
      setValue('experienceLevel', data.experienceLevel as FormValues['experienceLevel'], {
        shouldValidate: true,
      });
      mark();
    }
    if (typeof data.positions === 'number' && data.positions >= 1 && getValues('positions') === 1) {
      setValue('positions', data.positions, { shouldValidate: true });
      mark();
    }
    if (data.employmentType && getValues('employmentType') === 'Full-time') {
      setValue('employmentType', data.employmentType, { shouldValidate: true });
      mark();
    }
    if (data.workMode?.trim() && isEmpty(getValues('workMode'))) {
      setValue('workMode', data.workMode as FormValues['workMode'], { shouldValidate: true });
      mark();
    }
    if (data.budgetCurrency?.trim() && getValues('budgetCurrency') === 'INR') {
      setValue('budgetCurrency', data.budgetCurrency as FormValues['budgetCurrency'], {
        shouldValidate: true,
      });
      mark();
    }
    if (typeof data.budgetAmountInr === 'number' && data.budgetAmountInr > 0 && isEmpty(getValues('budgetAmountInr'))) {
      setValue('budgetAmountInr', String(Math.round(data.budgetAmountInr)), { shouldValidate: true });
      mark();
    }
    if (data.priority && getValues('priority') === 'Medium') {
      setValue('priority', data.priority, { shouldValidate: true });
      mark();
    }
    if (data.demandType && getValues('demandType') === 'Single') {
      setValue('demandType', data.demandType, { shouldValidate: true });
      mark();
    }
    if (data.noticePeriod?.trim() && isEmpty(getValues('noticePeriod'))) {
      const np = data.noticePeriod.trim();
      const mapped = np.toLowerCase().includes('immediate') ? 'immediate_0_30' : np;
      setValue('noticePeriod', mapped, { shouldValidate: true });
      mark();
    }
    if (Array.isArray(data.skills) && data.skills.length > 0 && !hasSkills()) {
      const skillsArr = data.skills.map((s) => String(s).trim()).filter(Boolean);
      if (skillsArr.length > 0) {
        setValue('skills', skillsArr, { shouldValidate: true });
        mark();
      }
    }
    if (Array.isArray(data.technologies) && data.technologies.length > 0 && !hasTechnologies()) {
      const techArr = data.technologies.map((t) => String(t).trim()).filter(Boolean);
      if (techArr.length > 0) {
        setValue('technologies', techArr, { shouldValidate: true });
        mark();
      }
    }
    if (data.jdDescription?.trim() && isEmpty(getValues('jdDescription'))) {
      setValue('jdDescription', data.jdDescription.trim(), { shouldValidate: true });
    }

    return filled;
  }, [setValue, getValues]);

  const buildExtractSuccessMessage = (data: JdExtractFormFields, count: number, source: 'file' | 'paste') => {
    if (count <= 0) {
      return source === 'file'
        ? 'JD text was read but no structured fields were detected. Try a JD with labeled sections (Job Title, Location, Skills, etc.).'
        : 'No structured fields detected. Add labels like Job Title:, Location:, Mandatory Skills: for better results.';
    }
    const parts = [`Auto-filled ${count} empty field(s) from the ${source === 'file' ? 'uploaded JD' : 'pasted JD'}.`];
    if (data.usedFallbackParser) {
      parts.push('Used basic parser (AI analyser unavailable).');
    }
    if (typeof data.totalRolesDetected === 'number' && data.totalRolesDetected > 1) {
      parts.push(
        `Detected ${data.totalRolesDetected} roles — filled form with role 1${data.roleTitle ? `: ${data.roleTitle}` : ''}. Create separate demands for other roles if needed.`,
      );
    }
    parts.push('Review and complete any remaining details.');
    return parts.join(' ');
  };

  const handleExtractAndAutofill = useCallback(async () => {
    setExtractError(null);
    setExtractSuccess(null);
    const pastedText = getValues('jdDescription')?.trim() ?? '';
    if (jdFile) {
      setExtractLoading(true);
      try {
        const data = await extractJdFromFile(jdFile);
        const count = applyExtractedFields(data);
        setExtractSuccess(buildExtractSuccessMessage(data, count, 'file'));
      } catch (e) {
        setExtractError(e instanceof Error ? e.message : 'Failed to extract from document');
      } finally {
        setExtractLoading(false);
      }
    } else if (pastedText.length >= 50) {
      setExtractLoading(true);
      try {
        const data = await extractJdFromText(pastedText);
        const count = applyExtractedFields(data);
        setExtractSuccess(buildExtractSuccessMessage(data, count, 'paste'));
      } catch (e) {
        setExtractError(e instanceof Error ? e.message : 'Failed to extract from text');
      } finally {
        setExtractLoading(false);
      }
    } else {
      setExtractError('Upload a PDF/DOCX file or paste a job description (at least 50 characters) first.');
    }
  }, [jdFile, getValues, applyExtractedFields]);

  const updatedBy = currentUser?.email ?? 'system';

  const getOverallExperienceDisplay = (data: FormValues) => {
    if (!data.overallExperience) return '';
    if (data.overallExperience === 'custom' && data.overallExperienceCustom?.trim()) {
      return data.overallExperienceCustom.trim();
    }
    return data.overallExperience;
  };

  const getNoticePeriodDisplay = (data: FormValues) => {
    return data.noticePeriod || '';
  };

  const emptyOwner = { id: '', name: '', email: '', title: '' };

  const resolveSubmittingTo = (data: FormValues) =>
    data.submittingTo === REQUIREMENT_FROM_CUSTOM
      ? data.submittingToCustom!.trim()
      : data.submittingTo;

  const onSubmitForm = handleSubmit(async (data: FormValues) => {
    setSubmitError(null);
    const createdAt = new Date(data.demandReceivedDate).toISOString();
    const patchPayload: Record<string, unknown> = {
      clientId: initialRequirement?.clientId,
      clientLeadPoc: data.clientLeadPoc,
      clientPoc: data.clientPoc ?? '',
      jobTitle: data.jobTitle,
      roleTitle: data.jobTitle,
      locations: data.locations,
      location: (data.locations ?? []).join(', '),
      overallExperienceCustom: getOverallExperienceDisplay(data),
      experience: getOverallExperienceDisplay(data),
      experienceLevel: data.experienceLevel,
      employmentType: data.employmentType,
      workMode: data.workMode,
      openPositions: data.positions,
      positions: data.positions,
      overallBudget: parseBudgetInrInput(data.budgetAmountInr)!,
      budgetCurrency: data.budgetCurrency,
      noticePeriod: getNoticePeriodDisplay(data) || 'Not specified',
      skills: data.skills,
      technologies: data.technologies ?? [],
      priority: data.priority,
      internalPoc: data.internalPoc?.trim() ? data.internalPoc.trim() : null,
      demandType: data.demandType,
      submittingTo: resolveSubmittingTo(data),
      closedDate:
        data.jobStatus === 'Closed' && data.closedDate?.trim()
          ? data.closedDate.trim()
          : undefined,
      status: data.jobStatus,
      assignment: data.jobStatus === 'Assigned' ? 'Assigned' : 'Unassigned',
      ...(data.sourceEmailSubject?.trim()
        ? { sourceEmailSubject: data.sourceEmailSubject.trim() }
        : {}),
    };

    try {
      if (isEdit && editInternalId) {
        await apiUpdateRequirement(editInternalId, patchPayload, updatedBy);
        await refresh();
        router.push(`/requirements/${editInternalId}`);
        return;
      }

      await addRequirement(
        {
          id: data.jobId,
          submittingTo: resolveSubmittingTo(data),
          clientLeadPoc: data.clientLeadPoc,
          clientPoc: data.clientPoc ?? '',
          roleTitle: data.jobTitle,
          location: (data.locations ?? []).join(', '),
          experience: getOverallExperienceDisplay(data),
          experienceLevel: data.experienceLevel,
          employmentType: data.employmentType,
          workMode: data.workMode,
          openPositions: data.positions,
          overallBudget: parseBudgetInrInput(data.budgetAmountInr)!,
          budgetCurrency: data.budgetCurrency,
          noticePeriod: getNoticePeriodDisplay(data),
          skills: data.skills,
          technologies: data.technologies ?? [],
          priority: data.priority as 'High' | 'Medium' | 'Low',
          internalPoc: data.internalPoc?.trim() || undefined,
          demandType: data.demandType,
          closedDate:
            data.jobStatus === 'Closed' && data.closedDate?.trim()
              ? data.closedDate.trim()
              : undefined,
          owner: emptyOwner,
          status: normalizeStatusForStore(data.jobStatus as RequirementStatus),
          assignment: data.jobStatus === 'Assigned' ? 'Assigned' : 'Unassigned',
          createdAt,
        },
        updatedBy,
      );
      if (currentUser?.id) {
        endFormDraftSession('requirement_create', currentUser.id);
      }
      router.push('/requirements');
    } catch (err) {
      console.error(isEdit ? 'Failed to update requirement:' : 'Failed to create requirement:', err);
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : isEdit
            ? 'Failed to update requirement. Please try again.'
            : 'Failed to create requirement. Please try again.';
      setSubmitError(msg);
    }
  });

  return (
    <div className="min-h-screen space-y-8 pb-12">
      {!isEdit ? (
        <PageBackNav />
      ) : null}
      {/* Page Header */}
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-3xl font-bold tracking-tight text-transparent dark:from-slate-100 dark:to-slate-300">
            {isEdit ? 'Edit Job Demand' : 'Create New Job Demand'}
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {isEdit
              ? 'Update requirement details. Requirement ID is read-only.'
              : 'Capture requirement details, client preferences, and assign recruiters.'}
          </p>
        </div>
        <RoleNotice />
      </div>

      {/* Extract & Auto-fill – Optional: Upload or paste JD */}
      <div className="rounded-2xl border-2 border-dashed border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-white p-6 shadow-sm dark:border-indigo-800/50 dark:from-indigo-950/30 dark:to-zinc-950">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-indigo-900 dark:text-indigo-100">
              Extract & Auto-fill (optional)
            </h2>
            <p className="mt-1 text-sm text-indigo-700/80 dark:text-indigo-300/80">
              Option 1: Upload a JD document (PDF or DOCX, max 10MB). Option 2: Paste JD text below. Then click Extract & Auto-fill.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
              <div className="flex-1">
                <FileUpload
                  config="jd"
                  value={jdFile}
                  onChange={setJdFile}
                  showPreviewCard
                />
              </div>
              <button
                type="button"
                disabled={(!jdFile && jdDescription.trim().length < 50) || extractLoading}
                className="shrink-0 self-start rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
                onClick={handleExtractAndAutofill}
              >
                {extractLoading ? 'Extracting...' : 'Extract & Auto-fill'}
              </button>
            </div>
          </div>
          <div className="flex-1 lg:max-w-md">
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300">
              Or paste JD here for Extract & Auto-fill (optional)
            </label>
            <p className="mt-1 text-xs text-indigo-600/80 dark:text-indigo-400/80">
              Paste a job description to use Extract & Auto-fill. Not required for creating a requirement.
            </p>
            <Textarea
              {...register('jdDescription')}
              placeholder="Paste JD text here (min 50 chars for Extract & Auto-fill)..."
              className="mt-2 min-h-[120px] w-full rounded-xl border border-indigo-200/60 bg-white/80 px-4 py-3 text-sm shadow-sm dark:border-indigo-800/50 dark:bg-zinc-900/80 dark:text-zinc-100"
            />
            {errors.jdDescription?.message && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.jdDescription.message}</p>
            )}
          </div>
        </div>
      </div>

      <form className="space-y-6 pb-28" onSubmit={onSubmitForm}>
        {submitError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
            {submitError}
          </div>
        )}
        {extractSuccess && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
            {extractSuccess}
          </div>
        )}
        {extractError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400">
            {extractError}
          </div>
        )}
        {/* SECTION 1 */}
        <FormSection title="Basic Info" description="Core details for tracking and auditability.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field
              label="Requirement ID"
              hint={
                isEdit
                  ? 'Read-only (business reference)'
                  : 'Auto-generated from Demand Received Date (editable)'
              }
              error={errors.jobId?.message}
            >
              <TextInput {...register('jobId')} placeholder="REQ-YYYY-MM-DD-XXX" readOnly={isEdit} disabled={isEdit} />
            </Field>

            <Field
              label="Demand Received Date"
              hint={
                isEdit
                  ? undefined
                  : 'Select today or up to 2 previous calendar days'
              }
              error={errors.demandReceivedDate?.message}
            >
              <TextInput
                type="date"
                data-allow-past-date="true"
                {...register('demandReceivedDate')}
                min={isEdit ? '1900-01-01' : demandReceivedDateBounds?.min}
                max={isEdit ? undefined : demandReceivedDateBounds?.max}
                suppressHydrationWarning
              />
            </Field>

            <Field
label="Internal POC"
  hint="Searchable"
  error={errors.internalPoc?.message}
>
  <TextInput
    {...register('internalPoc')}
    placeholder="Type a name or email..."
  />
</Field>

          </div>
        </FormSection>

        {/* SECTION: Client Information */}
        <FormSection title="Client Information" description="Client details and JD reference.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Field
              label="Requirement From"
              hint="Pick a preset or Other to type a new company or source."
              error={errors.submittingTo?.message ?? errors.submittingToCustom?.message}
            >
              <Select {...register('submittingTo')}>
                {REQUIREMENT_FROM_SELECT_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            {submittingTo === REQUIREMENT_FROM_CUSTOM ? (
              <Field
                label="Company / source name"
                className="md:col-span-2"
                error={errors.submittingToCustom?.message}
              >
                <TextInput
                  {...register('submittingToCustom')}
                  placeholder="e.g. New client or vendor name"
                  autoComplete="organization"
                />
              </Field>
            ) : null}
          </div>
        </FormSection>

        {/* SECTION 2 */}
        <FormSection title="Client & Job Info" description="Client context and lifecycle status.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Field label="Client Lead POC" error={errors.clientLeadPoc?.message}>
              <TextInput {...register('clientLeadPoc')} placeholder="e.g. Contoso" />
            </Field>
            <Field label="Client POC" error={errors.clientPoc?.message}>
              <TextInput {...register('clientPoc')} placeholder="e.g. Priya S." />
            </Field>
            <Field label="Job Title" error={errors.jobTitle?.message}>
              <Controller
                control={control}
                name="jobTitle"
                render={({ field }) => (
                  <TextInput
                    {...field}
                    value={field.value ?? ''}
                    placeholder="e.g. Full Stack Engineer"
                  />
                )}
              />
            </Field>

            <Field label="Job Status" error={errors.jobStatus?.message}>
              <Select {...register('jobStatus')}>
                <option value="Open">Open</option>
                <option value="Assigned">Assigned</option>
                <option value="Submitted">Submitted</option>
                <option value="Interview">Interview</option>
                <option value="Selected">Selected</option>
                <option value="Rejected">Rejected</option>
                <option value="Closed">Closed</option>
              </Select>
            </Field>

            <Field
              label="Closed Date"
              hint={jobStatus === 'Closed' ? 'Required' : 'Enabled only for Closed'}
              error={errors.closedDate?.message}
            >
              <TextInput
                type="date"
                data-managed-date="true"
                {...register('closedDate')}
                disabled={jobStatus !== 'Closed'}
                min={jobStatus === 'Closed' ? demandReceivedDateBounds?.max : undefined}
                suppressHydrationWarning
              />
            </Field>

            <Field label="Type of Demand" error={errors.demandType?.message}>
              <Select {...register('demandType')}>
                <option value="Single">Single</option>
                <option value="Multiple">Multiple</option>
                <option value="Bulk">Bulk</option>
              </Select>
            </Field>

            <Field
              label="Priority"
              hint="Helps recruiters prioritize their work"
              error={errors.priority?.message}
            >
              <Select {...register('priority')}>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </Select>
            </Field>
          </div>
        </FormSection>

        {/* SECTION 3 */}
        <FormSection title="Position Details" description="Role scope, location, and joiner availability.">
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Field label="Number of Positions" error={errors.positions?.message}>
              <TextInput
                type="number"
                min={1}
                {...register('positions', { valueAsNumber: true })}
              />
            </Field>

            <Field label="Relevant Experience" error={errors.experienceLevel?.message}>
              <Controller
                control={control}
                name="experienceLevel"
                render={({ field }) => (
                  <Select {...field} value={field.value ?? ''}>
                    <option value="">Select relevant experience</option>
                    <option value="Entry Level">Entry Level</option>
                    <option value="Junior">Junior</option>
                    <option value="Mid-Senior">Mid-Senior</option>
                    <option value="Senior">Senior</option>
                    <option value="Lead">Lead</option>
                    <option value="Principal">Principal</option>
                    <option value="Director">Director</option>
                  </Select>
                )}
              />
            </Field>

            <Field label="Employment Type" hint="Only Full-time or Contract" error={errors.employmentType?.message}>
              <Controller
                control={control}
                name="employmentType"
                render={({ field }) => (
                  <Select {...field} value={field.value ?? ''}>
                    <option value="Full-time">Full-time</option>
                    <option value="Contract">Contract</option>
                  </Select>
                )}
              />
            </Field>

            <Field label="Work Mode" error={errors.workMode?.message}>
              <Controller
                control={control}
                name="workMode"
                render={({ field }) => (
                  <Select {...field} value={field.value ?? ''}>
                    <option value="">Select work mode</option>
                    <option value="On-site">On-site</option>
                    <option value="Remote">Remote</option>
                    <option value="Hybrid">Hybrid</option>
                  </Select>
                )}
              />
            </Field>

            <Field label="Budget currency" error={errors.budgetCurrency?.message}>
              <Controller
                control={control}
                name="budgetCurrency"
                render={({ field }) => (
                  <Select {...field} value={field.value ?? 'INR'}>
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </Select>
                )}
              />
            </Field>

            <Field
              label={
                employmentType === 'Contract'
                  ? 'Monthly budget (full amount in selected currency)'
                  : 'Yearly budget (full amount in selected currency)'
              }
              hint={
                employmentType === 'Contract'
                  ? 'Contract: enter monthly compensation (e.g. 150000 for ₹1.5 lakh/month). You may still type 1.5 LPA-style lakhs if the field says LPA/lakh.'
                  : 'Full-time: enter annual compensation (e.g. 1800000). Shorthand: 18 LPA is interpreted as 18 lakh/year.'
              }
              error={errors.budgetAmountInr?.message}
            >
              <Controller
                control={control}
                name="budgetAmountInr"
                render={({ field }) => (
                  <div className="flex w-full items-center gap-2">
                    <TextInput
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder={
                        employmentType === 'Contract'
                          ? 'e.g. 150000 (monthly)'
                          : 'e.g. 1800000 or 18 LPA'
                      }
                      className={cn(inputBase, 'flex-1 min-w-0')}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value)}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                    <span className="shrink-0 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                      {employmentType === 'Contract' ? 'per month' : 'per year'}
                    </span>
                  </div>
                )}
              />
            </Field>
            <Field
              label="Location"
              hint="Type to search (e.g. hyd → Hyderabad)"
              error={errors.locations?.message as string | undefined}
            >
              <div className="relative space-y-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      value={locationInput}
                      onChange={(e) => {
                        setLocationInput(e.target.value);
                        setLocationDropdownOpen(true);
                      }}
                      onFocus={() => setLocationDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setLocationDropdownOpen(false), 200)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const trimmed = locationInput.trim();
                          if (locationSuggestions.length > 0) {
                            const loc = locationSuggestions.find((l) => !locations.includes(l.label));
                            if (loc) {
                              setValue('locations', [...locations, loc.label], { shouldValidate: true });
                              setLocationInput('');
                            }
                          } else if (trimmed && !locations.includes(trimmed)) {
                            setValue('locations', [...locations, trimmed], { shouldValidate: true });
                            setLocationInput('');
                          }
                        }
                      }}
                      className={cn(inputBase, 'flex-1')}
                      placeholder="e.g. Hyderabad, Bengaluru, Remote (type hyd for Hyderabad)"
                    />
                    {locationDropdownOpen && (locationInput.trim() || locationSuggestions.length > 0) && (
                      <ul
                        className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        {locationInput.trim() ? (
                          locationSuggestions.length > 0 ? (
                            locationSuggestions
                              .filter((opt) => !locations.includes(opt.label))
                              .map((opt) => (
                                <li
                                  key={opt.value}
                                  className="cursor-pointer px-3 py-2 text-sm text-gray-900 hover:bg-blue-50 dark:text-zinc-100 dark:hover:bg-blue-900/30"
                                  onMouseDown={() => {
                                    if (!locations.includes(opt.label)) {
                                      setValue('locations', [...locations, opt.label], { shouldValidate: true });
                                      setLocationInput('');
                                    }
                                  }}
                                >
                                  {opt.label}
                                </li>
                              ))
                          ) : (
                            <li className="px-3 py-2 text-sm text-gray-500 dark:text-zinc-400">
                              No matches. Press Enter to add.
                            </li>
                          )
                        ) : (
                          topLocationSuggestions
                            .filter((opt) => !locations.includes(opt.label))
                            .map((opt) => (
                              <li
                                key={opt.value}
                                className="cursor-pointer px-3 py-2 text-sm text-gray-900 hover:bg-blue-50 dark:text-zinc-100 dark:hover:bg-blue-900/30"
                                onMouseDown={() => {
                                  if (!locations.includes(opt.label)) {
                                    setValue('locations', [...locations, opt.label], { shouldValidate: true });
                                  }
                                }}
                              >
                                {opt.label}
                              </li>
                            ))
                        )}
                      </ul>
                    )}
                  </div>
                  <button
                    type="button"
                    className="rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition duration-200 hover:bg-indigo-700 disabled:opacity-50"
                    onClick={() => {
                      const trimmed = locationInput.trim();
                      if (trimmed && !locations.includes(trimmed)) {
                        setValue('locations', [...locations, trimmed], { shouldValidate: true });
                        setLocationInput('');
                      } else if (locationSuggestions.length > 0) {
                        const loc = locationSuggestions[0];
                        if (loc && !locations.includes(loc.label)) {
                          setValue('locations', [...locations, loc.label], { shouldValidate: true });
                          setLocationInput('');
                        }
                      }
                    }}
                    disabled={!locationInput.trim() && locationSuggestions.length === 0}
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {locations.map((loc) => (
                    <button
                      type="button"
                      key={loc}
                      className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                      onClick={() =>
                        setValue(
                          'locations',
                          locations.filter((x) => x !== loc),
                          { shouldValidate: true },
                        )
                      }
                      title="Remove location"
                    >
                      {loc}
                      <span className="text-zinc-400">×</span>
                    </button>
                  ))}
                </div>
              </div>
            </Field>
            <Field
              label="Overall Experience"
              hint={overallExperience === 'custom' ? 'Enter your custom experience range' : undefined}
              error={errors.overallExperience?.message ?? errors.overallExperienceCustom?.message}
            >
              <div className="space-y-2">
                <Select {...register('overallExperience')}>
                  <option value="">Select experience range</option>
                  <option value="custom">Custom</option>
                  <option value="Fresher">Fresher</option>
                  <option value="0-1 years">0-1 years</option>
                  <option value="1-2 years">1-2 years</option>
                  <option value="2-4 years">2-4 years</option>
                  <option value="4-6 years">4-6 years</option>
                  <option value="6-8 years">6-8 years</option>
                  <option value="8-10 years">8-10 years</option>
                  <option value="10+ years">10+ years</option>
                </Select>
                {overallExperience === 'custom' && (
                  <TextInput
                    {...register('overallExperienceCustom')}
                    placeholder="e.g. 3-5 years, 15+ years, 0-6 months"
                    className="mt-2"
                  />
                )}
              </div>
            </Field>
            </div>
            <Field
              label="Notice Period"
              hint="Enter notice period (e.g., Immediate, 30 days, 2 months, etc.)"
              error={errors.noticePeriod?.message}
            >
              <TextInput {...register('noticePeriod')} placeholder="e.g., Immediate, 30 days, 2 months" />
            </Field>
          </div>
        </FormSection>

        {/* Job Title Suggestions */}
        {jobTitleSuggestions && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/30">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">
                  Suggestions for &quot;{jobTitle}&quot;
                </h3>
                <p className="mt-1 text-xs text-indigo-700 dark:text-indigo-300">
                  Based on the job title, we suggest these technologies and skills. Apply to pre-fill the sections below.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {jobTitleSuggestions.technologies.slice(0, 5).map((t) => (
                    <span
                      key={t}
                      className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200"
                    >
                      {t}
                    </span>
                  ))}
                  {jobTitleSuggestions.technologies.length > 5 && (
                    <span className="text-xs text-indigo-600 dark:text-indigo-400">
                      +{jobTitleSuggestions.technologies.length - 5} more
                    </span>
                  )}
                  <span className="text-indigo-500 dark:text-indigo-400">•</span>
                  {jobTitleSuggestions.skills.slice(0, 3).map((s) => (
                    <span
                      key={s}
                      className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200"
                    >
                      {s}
                    </span>
                  ))}
                  {jobTitleSuggestions.skills.length > 3 && (
                    <span className="text-xs text-indigo-600 dark:text-indigo-400">
                      +{jobTitleSuggestions.skills.length - 3} more
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const existing = getValues('technologies') ?? [];
                    const merged = Array.from(
                      new Set([...existing, ...jobTitleSuggestions!.technologies]),
                    );
                    setValue('technologies', merged, { shouldValidate: true });
                  }}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700"
                >
                  Apply to Mandatory Skills
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const existing = getValues('skills') ?? [];
                    const merged = Array.from(
                      new Set([...existing, ...jobTitleSuggestions!.skills]),
                    );
                    setValue('skills', merged, { shouldValidate: true });
                  }}
                  className="rounded-lg border border-indigo-600 bg-white px-3 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-50 dark:border-indigo-500 dark:bg-transparent dark:text-indigo-300 dark:hover:bg-indigo-900/30"
                >
                  Apply to Skills
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const existingTech = getValues('technologies') ?? [];
                    const existingSkills = getValues('skills') ?? [];
                    setValue(
                      'technologies',
                      Array.from(new Set([...existingTech, ...jobTitleSuggestions!.technologies])),
                      { shouldValidate: true },
                    );
                    setValue(
                      'skills',
                      Array.from(new Set([...existingSkills, ...jobTitleSuggestions!.skills])),
                      { shouldValidate: true },
                    );
                  }}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700"
                >
                  Apply All
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SECTION: Mandatory Skills (previously Technologies) */}
        <FormSection title="Mandatory Skills" description="Mandatory skills and tools for the role.">
          <div className="grid grid-cols-1 gap-4">
            <Field
              label="Mandatory Skills"
              hint="Comma separated"
              error={errors.technologies?.message as string | undefined}
            >
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    value={technologiesInput}
                    onChange={(e) => setTechnologiesInput(e.target.value)}
                    className={cn(inputBase, 'flex-1')}
                    placeholder="e.g. React, TypeScript, SQL, AWS"
                  />
                  <button
                    type="button"
                    className="rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition duration-200 hover:scale-105 hover:bg-blue-700 disabled:opacity-50"
                    onClick={() => {
                      const entries = slugifySkill(technologiesInput);
                      const next = Array.from(
                        new Set([...(getValues('technologies') ?? []), ...entries]),
                      );
                      setValue('technologies', next, { shouldValidate: true });
                      setTechnologiesInput('');
                    }}
                    disabled={!technologiesInput.trim()}
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {technologies.map((t) => (
                    <button
                      type="button"
                      key={t}
                      className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                      onClick={() =>
                        setValue(
                          'technologies',
                          (getValues('technologies') ?? []).filter((x) => x !== t),
                          { shouldValidate: true },
                        )
                      }
                      title="Remove technology"
                    >
                      {t}
                      <span className="text-zinc-400">×</span>
                    </button>
                  ))}
                </div>
              </div>
            </Field>
          </div>
        </FormSection>
        <FormSection title="Skills" description="Core skills required for the role.">
          <div className="grid grid-cols-1 gap-4">
            <Field
              label="Skills"
              hint="Comma separated"
              error={errors.skills?.message as string | undefined}
            >
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    value={skillsInput}
                    onChange={(e) => setSkillsInput(e.target.value)}
                    className={cn(inputBase, 'flex-1')}
                    placeholder="e.g. Communication, Problem solving, Agile"
                  />
                  <button
                    type="button"
                    className="rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition duration-200 hover:scale-105 hover:bg-blue-700 disabled:opacity-50"
                    onClick={() => {
                      const entries = slugifySkill(skillsInput);
                      const next = Array.from(
                        new Set([...(getValues('skills') ?? []), ...entries]),
                      );
                      setValue('skills', next, { shouldValidate: true });
                      setSkillsInput('');
                    }}
                    disabled={!skillsInput.trim()}
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {skills.map((s) => (
                    <button
                      type="button"
                      key={s}
                      className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                      onClick={() =>
                        setValue(
                          'skills',
                          (getValues('skills') ?? []).filter((x) => x !== s),
                          { shouldValidate: true },
                        )
                      }
                      title="Remove skill"
                    >
                      {s}
                      <span className="text-zinc-400">×</span>
                    </button>
                  ))}
                </div>
              </div>
            </Field>
          </div>
        </FormSection>

        <div className="fixed right-0 bottom-0 left-0 z-50 border-t border-gray-200/80 bg-white/95 px-4 py-4 shadow-[0_-12px_40px_-16px_rgba(15,23,42,0.15)] backdrop-blur-md supports-[backdrop-filter]:bg-white/90 dark:border-zinc-800/80 dark:bg-zinc-950/95 lg:left-[300px] lg:px-8">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() =>
                router.push(isEdit && editInternalId ? `/requirements/${editInternalId}` : '/requirements')
              }
              className="h-11 rounded-xl border border-gray-300 bg-white px-6 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-11 rounded-xl bg-indigo-600 px-8 text-sm font-semibold text-white shadow-lg transition-all duration-200 hover:scale-[1.02] hover:bg-indigo-700 hover:shadow-xl disabled:opacity-60"
            >
              {isEdit ? 'Save changes' : 'Create Requirement'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function CreateRequirementPage() {
  return <RequirementFormPage mode="create" />;
}
