'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageBackNav } from '@/components/ui/PageBackNav';
import { useForm, useFieldArray, useWatch, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { FormSection } from '@/components/ui/FormSection';
import { Field, Select, TextInput, Textarea } from '@/components/ui/Field';
import { useCandidatesStore } from '@/lib/domain/candidates/store';
import { useRequirementsStore } from '@/lib/domain/requirements/store';
import { getRequirementAssignments, type RequirementAssignmentRow } from '@/lib/api/requirements';
import {
  canUserWorkOnRequirement,
  getRequirementWorkBlockReason,
} from '@/lib/domain/requirements/workPermissions';
import { RequirementViewOnlyBanner } from '@/components/requirements/RequirementViewOnlyBanner';
import {
  buildOfferInHandDetailsPayload,
  countFilledOffers,
} from '@/lib/utils/offerInHandDetails';
import {
  parseBulkResumesViaApi,
  parseResumeViaApi,
  uploadCandidateResume,
  type ParsedResumeCoreFields,
} from '@/lib/api/candidates';
import {
  bulkQueueCounts,
  bulkQueueItemId,
  EMPTY_PARSED_RESUME,
  nextPendingQueueItem,
  setQueueItemStatus,
  type BulkReviewQueueItem,
} from '@/lib/candidates/bulkReviewQueue';
import {
  ResumeParserPanel,
  type ResumeParseMode,
} from '@/components/candidates/ResumeParserPanel';
import { extractPlainTextFromResume } from '@/lib/resume/extractResumeText';
import { parseCoreFieldsFromResumeText } from '@/lib/resume/parseCoreResumeFields';
import { getPublicApiBase } from '@/lib/publicOrigin';
import { notify } from '@/lib/notify';
import {
  FLEXIBLE_EXPERIENCE_ERROR,
  displayFlexibleExperienceValue,
  formatExperienceInputOnBlur,
  isValidFlexibleExperienceInput,
  parseFlexibleExperienceInput,
} from '@/lib/utils/candidateExperienceInput';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  acknowledgeFormDraftReload,
  beginFormDraftSession,
  endFormDraftSession,
  markFormDraftReloadPending,
  readFormDraft,
  writeFormDraft,
} from '@/lib/formDrafts';

function norm(v: string) {
  return v.trim().toLowerCase();
}

const CAND_ID_PATTERN = /^CAND-\d{4}-\d{2}-\d{2}-\d{3}$/;

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const optionalEmailField = z
  .string()
  .optional()
  .refine((v) => !v || !v.trim() || z.string().email().safeParse(v.trim()).success, {
    message: 'Enter a valid email or leave blank',
  });

const entrySchema = z
  .object({
  candidateId: z.string().optional(),
  submissionDate: z.string().optional(),
  candidateName: z.string().optional(),
  currentEmployer: z.string().optional(), // labeled as "Current Company"
  contactNumber: z.string().optional(),
  email: optionalEmailField,
  skillsRaw: z.string().optional(),
  technologiesRaw: z.string().optional(),
  totalExperience: z.string().optional(),
  relevantExperience: z.string().optional(),
  currentCtc: z.string().optional(),
  expectedCtc: z.string().optional(),
  noticePeriod: z.string().optional(),
  currentLocation: z.string().optional(),
  preferredLocation: z.string().optional(),
  availableForInterview: z.string().optional(),
  reasonForJobChange: z.string().optional(),
  offerInHand: z.preprocess(
    (v) => (v === '' ? undefined : v === 'true' ? true : v === 'false' ? false : v),
    z.boolean().optional(),
  ),
  offerLines: z
    .array(
      z.object({
        company: z.string().max(240).optional(),
        ctc: z.string().max(160).optional(),
      }),
    )
    .max(10),
  linkedinUrl: z
    .string()
    .optional()
    .refine((v) => !v || v.trim().length === 0 || /^https?:\/\//i.test(v.trim()), {
      message: 'LinkedIn URL must start with http(s)://',
    }),
  highestQualification: z.string().optional(),
  resumeRef: z.string().optional(),
  notes: z.string().optional(),
})
  .superRefine((data, ctx) => {
    const cid = (data.candidateId ?? '').trim();
    if (cid && !CAND_ID_PATTERN.test(cid)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Format must be CAND-YYYY-MM-DD-XXX (e.g. CAND-2026-06-05-001)',
        path: ['candidateId'],
      });
    }
    const hasAny =
      (data.candidateName ?? '').trim() ||
      (data.contactNumber ?? '').trim() ||
      (data.email ?? '').trim() ||
      (data.currentEmployer ?? '').trim() ||
      (data.skillsRaw ?? '').trim() ||
      (data.technologiesRaw ?? '').trim() ||
      (data.linkedinUrl ?? '').trim() ||
      (data.resumeRef ?? '').trim() ||
      (data.notes ?? '').trim() ||
      (data.totalExperience ?? '').trim() ||
      (data.relevantExperience ?? '').trim() ||
      (data.currentCtc ?? '').trim() ||
      (data.expectedCtc ?? '').trim() ||
      (data.noticePeriod ?? '').trim() ||
      (data.currentLocation ?? '').trim() ||
      (data.preferredLocation ?? '').trim() ||
      (data.availableForInterview ?? '').trim() ||
      (data.reasonForJobChange ?? '').trim() ||
      (data.highestQualification ?? '').trim() ||
      data.offerInHand === true ||
      data.offerInHand === false;
    if (!hasAny) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Enter at least one detail (name, contact, email, skills, experience, resume file, notes, etc.)',
        path: ['candidateName'],
      });
    }

    const total = (data.totalExperience ?? '').trim();
    if (total && !isValidFlexibleExperienceInput(total)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: FLEXIBLE_EXPERIENCE_ERROR,
        path: ['totalExperience'],
      });
    }

    const relevant = (data.relevantExperience ?? '').trim();
    if (relevant && !isValidFlexibleExperienceInput(relevant)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: FLEXIBLE_EXPERIENCE_ERROR,
        path: ['relevantExperience'],
      });
    }
  });

type EntryValues = z.infer<typeof entrySchema>;

const ENTRY_FORM_DEFAULTS: EntryValues = {
  candidateId: '',
  submissionDate: '',
  candidateName: '',
  currentEmployer: '',
  contactNumber: '',
  email: '',
  skillsRaw: '',
  technologiesRaw: '',
  totalExperience: '',
  relevantExperience: '',
  currentCtc: '',
  expectedCtc: '',
  noticePeriod: '',
  currentLocation: '',
  preferredLocation: '',
  availableForInterview: '',
  reasonForJobChange: '',
  offerInHand: undefined,
  offerLines: [{ company: '', ctc: '' }],
  linkedinUrl: '',
  highestQualification: '',
  resumeRef: '',
  notes: '',
};

type CandidateEntryDraft = {
  values: EntryValues;
  entryStep: 'form' | 'review';
  pendingReview: EntryValues | null;
  resumeFileName?: string;
};

type CandidateIdSource = {
  id?: string | null;
  candidateCode?: string | null;
  candidateRef?: string | null;
};

const CAND_SEQ_STORAGE_PREFIX = 'candidate_entry_seq_';

function dateStrFromSubmissionDate(submissionDate: string): string {
  const trimmed = submissionDate.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const date = new Date(submissionDate);
  return Number.isNaN(date.getTime()) ? formatLocalYmd(new Date()) : formatLocalYmd(date);
}

/** Remember IDs submitted from this page so the next form opens with an incremented suffix. */
function rememberSubmittedCandidateId(code: string) {
  if (typeof window === 'undefined' || !CAND_ID_PATTERN.test(code)) return;
  const m = code.match(/^CAND-(\d{4}-\d{2}-\d{2})-\d{3}$/);
  if (!m) return;
  const dateStr = m[1];
  const key = `${CAND_SEQ_STORAGE_PREFIX}${dateStr}`;
  try {
    const list: string[] = JSON.parse(sessionStorage.getItem(key) || '[]');
    if (!list.includes(code)) {
      list.push(code);
      sessionStorage.setItem(key, JSON.stringify(list));
    }
  } catch {
    sessionStorage.setItem(key, JSON.stringify([code]));
  }
}

function maxSuffixForDate(dateStr: string, candidates: CandidateIdSource[]): number {
  const prefix = `CAND-${dateStr}-`;
  let max = 0;
  const consider = (raw: string | null | undefined) => {
    const code = (raw ?? '').trim();
    if (!code.startsWith(prefix)) return;
    const n = parseInt(code.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  };

  if (typeof window !== 'undefined') {
    try {
      const stored: string[] = JSON.parse(
        sessionStorage.getItem(`${CAND_SEQ_STORAGE_PREFIX}${dateStr}`) || '[]',
      );
      for (const code of stored) consider(code);
    } catch {
      /* ignore */
    }
  }

  for (const c of candidates) {
    consider(c.candidateCode);
    consider(c.candidateRef);
  }
  return max;
}

/** Next sequential id for the submission date (001, 002, 003 …). */
function generateCandidateId(submissionDate: string, candidates: CandidateIdSource[]): string {
  const dateStr = dateStrFromSubmissionDate(submissionDate);
  const nextNum = Math.min(999, maxSuffixForDate(dateStr, candidates) + 1);
  return `CAND-${dateStr}-${String(nextNum).padStart(3, '0')}`;
}

/** Fill server-required fields when the user leaves them blank (page-only; DB needs name + email). */
function normalizeEntryForSubmit(
  data: EntryValues,
  resumeFile: File | null,
  candidates: CandidateIdSource[],
): EntryValues {
  const submissionDate =
    (data.submissionDate ?? '').trim() || new Date().toISOString().slice(0, 10);
  let candidateId = (data.candidateId ?? '').trim();
  if (!candidateId || !CAND_ID_PATTERN.test(candidateId)) {
    candidateId = generateCandidateId(submissionDate, candidates);
  }
  const candidateName = (data.candidateName ?? '').trim() || 'Candidate (draft)';
  const emailRaw = (data.email ?? '').trim();
  const email =
    emailRaw ||
    `draft+${candidateId.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}@entry.local`;
  const resumeRef =
    (data.resumeRef ?? '').trim() || (resumeFile?.name ?? '').trim() || undefined;
  return {
    ...data,
    submissionDate,
    candidateId,
    candidateName,
    email,
    contactNumber: (data.contactNumber ?? '').trim(),
    resumeRef,
  };
}

function ReviewSummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  const display = value === '' || value == null ? '—' : value;
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-zinc-100 py-3 sm:grid-cols-[minmax(0,220px)_1fr] dark:border-zinc-800">
      <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </dt>
      <dd className="break-words text-sm text-zinc-900 dark:text-zinc-100">{display}</dd>
    </div>
  );
}

export function CandidateSearchEntryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const incomingRequirementId = (searchParams.get('requirementId') ?? '').trim();
  const { currentUser } = useAuth();
  const { candidates, submissions, refresh } = useCandidatesStore();
  const { requirements, refresh: refreshRequirements } = useRequirementsStore();
  const [assignRows, setAssignRows] = useState<RequirementAssignmentRow[]>([]);
  const linkedRequirement = useMemo(
    () =>
      incomingRequirementId
        ? requirements.find((r) => r.id === incomingRequirementId)
        : undefined,
    [requirements, incomingRequirementId],
  );
  const activeAssigneeIds = useMemo(
    () =>
      new Set(
        assignRows.filter((row) => row.status === 'ACTIVE').map((row) => row.recruiterId),
      ),
    [assignRows],
  );
  const workBlockReason = incomingRequirementId
    ? getRequirementWorkBlockReason(linkedRequirement, currentUser?.id, { activeAssigneeIds })
    : null;
  const canWorkOnRequirement = incomingRequirementId
    ? canUserWorkOnRequirement(linkedRequirement, currentUser?.id, { activeAssigneeIds })
    : true;

  useEffect(() => {
    void refreshRequirements({ limit: 500 });
  }, [refreshRequirements]);

  useEffect(() => {
    if (!incomingRequirementId) {
      setAssignRows([]);
      return;
    }
    void getRequirementAssignments(incomingRequirementId)
      .then(setAssignRows)
      .catch(() => setAssignRows([]));
  }, [incomingRequirementId]);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<EntryValues>({
    resolver: zodResolver(entrySchema) as unknown as Resolver<EntryValues>,
    defaultValues: {
      ...ENTRY_FORM_DEFAULTS,
      submissionDate: new Date().toISOString().slice(0, 10),
    },
  });

  const { fields, append, remove, replace } = useFieldArray({ control, name: 'offerLines' });

  const formSubmissionDate = useWatch({ control, name: 'submissionDate' });
  const offerInHandWatch = useWatch({ control, name: 'offerInHand' });
  const offerInHandYes =
    offerInHandWatch === true ||
    (typeof offerInHandWatch === 'string' && offerInHandWatch === 'true');
  const offerLinesWatch = useWatch({ control, name: 'offerLines' }) ?? [];
  const [parseMode, setParseMode] = useState<ResumeParseMode>('single');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkReviewQueue, setBulkReviewQueue] = useState<BulkReviewQueueItem[]>([]);
  const [activeBulkReviewId, setActiveBulkReviewId] = useState<string | null>(null);
  const [resumeExtracting, setResumeExtracting] = useState(false);
  const [resumeExtractHint, setResumeExtractHint] = useState<string | null>(null);
  const [isSubmittingAllBulk, setIsSubmittingAllBulk] = useState(false);
  const resumeAutoExtractKeyRef = useRef<string>('');
  const [entryStep, setEntryStep] = useState<'form' | 'review'>('form');
  const [pendingReview, setPendingReview] = useState<EntryValues | null>(null);
  const [isConfirmingSubmit, setIsConfirmingSubmit] = useState(false);
  const [idSeqTick, setIdSeqTick] = useState(0);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const preservedCandidateIdRef = useRef<string | null>(null);
  const draftKeyRef = useRef<string | null>(null);
  const flushDraftRef = useRef<() => void>(() => {});

  flushDraftRef.current = () => {
    if (!draftKeyRef.current) return;
    writeFormDraft(draftKeyRef.current, {
      values: getValues(),
      entryStep,
      pendingReview,
      resumeFileName: resumeFile?.name ?? getValues('resumeRef') ?? undefined,
    } satisfies CandidateEntryDraft);
  };

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const userId = currentUser?.id;
    const scope = incomingRequirementId || undefined;

    if (!userId) {
      setDraftHydrated(true);
      return;
    }

    const session = beginFormDraftSession('candidate_entry', userId, scope);
    draftKeyRef.current = session.draftKey;

    const onBeforeUnload = () => {
      markFormDraftReloadPending('candidate_entry', userId, scope);
      flushDraftRef.current();
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    const draft = session.shouldRestore
      ? readFormDraft<CandidateEntryDraft>(session.draftKey)
      : null;

    if (session.shouldRestore && draft?.values) {
      reset({
        ...ENTRY_FORM_DEFAULTS,
        submissionDate: new Date().toISOString().slice(0, 10),
        ...draft.values,
      });
      if (draft.values.offerLines?.length) {
        replace(draft.values.offerLines);
      }
      if (draft.entryStep === 'review' && draft.pendingReview) {
        setPendingReview(draft.pendingReview);
        setEntryStep('review');
      }
      const cid = draft.values.candidateId?.trim();
      if (cid) preservedCandidateIdRef.current = cid;
      window.setTimeout(() => acknowledgeFormDraftReload('candidate_entry', userId, scope), 100);
    } else if (!session.shouldRestore) {
      reset({
        ...ENTRY_FORM_DEFAULTS,
        submissionDate: new Date().toISOString().slice(0, 10),
      });
      replace([{ company: '', ctc: '' }]);
      setEntryStep('form');
      setPendingReview(null);
      setResumeFile(null);
      setResumeExtractHint(null);
      resumeAutoExtractKeyRef.current = '';
      preservedCandidateIdRef.current = null;
    }

    setDraftHydrated(true);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [currentUser?.id, incomingRequirementId, reset, replace]);

  useEffect(() => {
    if (!draftHydrated) return;
    const dateValue = formSubmissionDate || formatLocalYmd(new Date());
    const currentCandidateId = String(getValues('candidateId') ?? '').trim();
    const dateStr = dateStrFromSubmissionDate(dateValue);
    const idPrefix = `CAND-${dateStr}-`;

    if (preservedCandidateIdRef.current) {
      setValue('candidateId', preservedCandidateIdRef.current);
      preservedCandidateIdRef.current = null;
      return;
    }

    if (currentCandidateId && CAND_ID_PATTERN.test(currentCandidateId) && currentCandidateId.startsWith(idPrefix)) {
      return;
    }

    const newId = generateCandidateId(dateValue, candidates);
    if (!currentCandidateId || CAND_ID_PATTERN.test(currentCandidateId)) {
      setValue('candidateId', newId);
    }
  }, [formSubmissionDate, candidates, getValues, setValue, idSeqTick, draftHydrated]);

  useEffect(() => {
    if (!offerInHandYes) {
      replace([{ company: '', ctc: '' }]);
    }
  }, [offerInHandYes, replace]);

  const watchedFormValues = useWatch({ control });

  useEffect(() => {
    if (!draftHydrated || !currentUser?.id || !draftKeyRef.current) return;
    const key = draftKeyRef.current;
    const timer = window.setTimeout(() => {
      writeFormDraft(key, {
        values: getValues(),
        entryStep,
        pendingReview,
        resumeFileName: resumeFile?.name ?? getValues('resumeRef') ?? undefined,
      } satisfies CandidateEntryDraft);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    watchedFormValues,
    entryStep,
    pendingReview,
    resumeFile,
    draftHydrated,
    currentUser?.id,
    incomingRequirementId,
    getValues,
  ]);

  const handlePreviewResume = () => {
    if (!resumeFile) return;
    const url = URL.createObjectURL(resumeFile);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const applyParsedResumeFields = useCallback(
    (
      parsed: ParsedResumeCoreFields,
      file: File,
      opts?: { silent?: boolean; overwrite?: boolean },
    ): number => {
      const curr = getValues();
      const updates: Partial<EntryValues> = {};
      let extractedCount = 0;

      const coreFieldMap: { field: keyof EntryValues; value: string | null | undefined }[] = [
        { field: 'candidateName', value: parsed.candidateName },
        { field: 'email', value: parsed.email },
        { field: 'contactNumber', value: parsed.contactNumber },
        { field: 'skillsRaw', value: parsed.skillsRaw ?? parsed.technologiesRaw },
        { field: 'technologiesRaw', value: parsed.technologiesRaw ?? parsed.skillsRaw },
        { field: 'linkedinUrl', value: parsed.linkedinUrl },
        { field: 'highestQualification', value: parsed.highestQualification },
        { field: 'totalExperience', value: parsed.totalExperience },
        { field: 'relevantExperience', value: parsed.relevantExperience },
        { field: 'currentEmployer', value: parsed.currentEmployer },
      ];

      for (const { field, value } of coreFieldMap) {
        const existing = curr[field];
        const empty =
          existing === undefined ||
          existing === null ||
          (typeof existing === 'string' && !existing.trim());
        if (value?.trim() && (opts?.overwrite || empty)) {
          (updates as Record<string, string>)[field] = value.trim();
          extractedCount++;
        }
      }

      if (!String(curr.resumeRef ?? '').trim() || opts?.overwrite) {
        updates.resumeRef = file.name;
        if (!String(curr.resumeRef ?? '').trim()) extractedCount++;
      }

      const validateFields: (keyof EntryValues)[] = [
        'candidateName',
        'email',
        'contactNumber',
        'linkedinUrl',
        'totalExperience',
        'relevantExperience',
      ];
      Object.entries(updates).forEach(([field, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          setValue(field as keyof EntryValues, value as never, {
            shouldValidate: validateFields.includes(field as keyof EntryValues),
          });
        }
      });

      setResumeFile(file);

      const parserLabel = parsed.parser === 'metaforge' ? 'Metaforge AI' : 'keyword parser';
      const keys = Object.keys(updates);
      if (extractedCount > 0) {
        setResumeExtractHint(
          opts?.silent
            ? `Auto-filled ${extractedCount} field(s) via ${parserLabel}. Review and complete remaining details.`
            : `Filled ${extractedCount} field(s) via ${parserLabel}: ${keys.join(', ')}`,
        );
        if (!opts?.silent) {
          notify.info(`Filled ${extractedCount} field(s) from the resume. Please review before submitting.`);
        }
      } else if (!opts?.silent) {
        setResumeExtractHint(
          'Resume was parsed but no empty fields were updated. Clear fields to re-fill, or enter details manually.',
        );
        notify.warning('No fields were updated. Clear those fields and parse again, or type manually.');
      }

      return extractedCount;
    },
    [getValues, setValue],
  );

  const runResumeExtraction = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!resumeFile) return;
      setResumeExtracting(true);
      if (!opts?.silent) setResumeExtractHint(null);
      try {
        let parsed = await parseResumeViaApi(resumeFile).catch(() => null);
        if (!parsed) {
          const { text, error } = await extractPlainTextFromResume(resumeFile);
          if (!text.trim()) {
            const msg = error || 'Could not read text from this file.';
            setResumeExtractHint(msg);
            if (!opts?.silent) notify.error(msg);
            return;
          }
          const legacy = parseCoreFieldsFromResumeText(text);
          parsed = {
            candidateName: legacy.candidateName,
            email: legacy.email,
            contactNumber: legacy.contactNumber,
            linkedinUrl: legacy.linkedinUrl,
            highestQualification: legacy.highestQualification,
            skillsRaw: legacy.technologiesRaw,
            technologiesRaw: legacy.technologiesRaw,
            totalExperience: null,
            relevantExperience: null,
            currentEmployer: null,
            parser: 'legacy',
          };
        }
        applyParsedResumeFields(parsed, resumeFile, opts);
      } catch (e) {
        console.error('Resume extraction failed', e);
        const msg = e instanceof Error ? e.message : 'Extraction failed. Try PDF or DOCX.';
        setResumeExtractHint(msg);
        if (!opts?.silent) notify.error(msg);
      } finally {
        setResumeExtracting(false);
      }
    },
    [resumeFile, applyParsedResumeFields],
  );

  const parsedToEntryValues = useCallback(
    (parsed: ParsedResumeCoreFields, file: File): EntryValues => ({
      ...ENTRY_FORM_DEFAULTS,
      submissionDate: new Date().toISOString().slice(0, 10),
      candidateName: parsed.candidateName?.trim() || '',
      email: parsed.email?.trim() || '',
      contactNumber: parsed.contactNumber?.trim() || '',
      skillsRaw: parsed.skillsRaw?.trim() || parsed.technologiesRaw?.trim() || '',
      technologiesRaw: parsed.technologiesRaw?.trim() || parsed.skillsRaw?.trim() || '',
      linkedinUrl: parsed.linkedinUrl?.trim() || '',
      highestQualification: parsed.highestQualification?.trim() || '',
      totalExperience: parsed.totalExperience?.trim() || '',
      relevantExperience: parsed.relevantExperience?.trim() || '',
      currentEmployer: parsed.currentEmployer?.trim() || '',
      resumeRef: file.name,
    }),
    [],
  );

  const runBulkResumeExtraction = useCallback(async () => {
    if (!bulkFiles.length) return;
    setResumeExtracting(true);
    setResumeExtractHint(`Parsing 0 of ${bulkFiles.length} resume(s)…`);
    setBulkReviewQueue([]);
    setActiveBulkReviewId(null);
    try {
      const response = await parseBulkResumesViaApi(bulkFiles, (partial) => {
        const partialQueue: BulkReviewQueueItem[] = partial.map((row) => {
          const file = bulkFiles.find((f) => f.name === row.sourceFile);
          if (!file) {
            return {
              id: row.sourceFile,
              sourceFile: row.sourceFile,
              file: new File([], row.sourceFile),
              parsed: EMPTY_PARSED_RESUME,
              reviewStatus: 'error' as const,
              parseError: 'File not found',
            };
          }
          if (row.status === 'done') {
            return {
              id: bulkQueueItemId(file),
              sourceFile: row.sourceFile,
              file,
              parsed: row.data,
              reviewStatus: 'pending' as const,
            };
          }
          return {
            id: bulkQueueItemId(file),
            sourceFile: row.sourceFile,
            file,
            parsed: EMPTY_PARSED_RESUME,
            reviewStatus: 'error' as const,
            parseError: row.error,
          };
        });
        setBulkReviewQueue(partialQueue);
        setResumeExtractHint(`Parsing ${partial.length} of ${bulkFiles.length} resume(s)…`);
      });

      const queue: BulkReviewQueueItem[] = response.results.map((row) => {
        const file =
          bulkFiles.find((f) => f.name === row.sourceFile) ??
          bulkFiles.find((f) => row.sourceFile.endsWith(f.name));
        if (!file) {
          return {
            id: row.sourceFile,
            sourceFile: row.sourceFile,
            file: new File([], row.sourceFile),
            parsed: EMPTY_PARSED_RESUME,
            reviewStatus: 'error' as const,
            parseError: 'File not found',
          };
        }
        if (row.status === 'done') {
          return {
            id: bulkQueueItemId(file),
            sourceFile: row.sourceFile,
            file,
            parsed: row.data,
            reviewStatus: 'pending' as const,
          };
        }
        return {
          id: bulkQueueItemId(file),
          sourceFile: row.sourceFile,
          file,
          parsed: EMPTY_PARSED_RESUME,
          reviewStatus: 'error' as const,
          parseError: row.error,
        };
      });
      setBulkReviewQueue(queue);

      const ok = queue.filter((i) => i.reviewStatus === 'pending').length;
      const failed = queue.filter((i) => i.reviewStatus === 'error').length;
      const parserLabel = response.parser === 'metaforge' ? 'Metaforge AI' : 'keyword parser';
      const notice = response.notice ? ` ${response.notice}` : '';
      setResumeExtractHint(
        `Parsed ${ok} of ${queue.length} resume(s) via ${parserLabel}${failed ? ` (${failed} failed)` : ''}.${notice} Use Load & review on each pending row.`,
      );
      if (ok > 0) {
        notify.info(`${ok} resume(s) ready in the review queue. Load the first candidate to begin.`);
      } else {
        notify.error('No resumes were parsed successfully.');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Bulk parse failed.';
      setResumeExtractHint(msg);
      notify.error(msg);
    } finally {
      setResumeExtracting(false);
    }
  }, [bulkFiles]);

  const openQueueItemForReview = useCallback(
    (item: BulkReviewQueueItem, opts?: { goToReview?: boolean }) => {
      if (item.reviewStatus === 'error' || item.reviewStatus === 'submitted') return;

      setParseMode('bulk');
      setActiveBulkReviewId(item.id);
      setBulkReviewQueue((prev) => setQueueItemStatus(prev, item.id, 'reviewing'));

      const entry = parsedToEntryValues(item.parsed, item.file);
      reset({
        ...entry,
        offerLines: [{ company: '', ctc: '' }],
      });
      replace([{ company: '', ctc: '' }]);
      setResumeFile(item.file);
      setResumeExtractHint(
        `Reviewing ${item.parsed.candidateName || item.sourceFile}. Edit details, then continue to review & submit.`,
      );
      resumeAutoExtractKeyRef.current = `${item.file.name}-${item.file.size}-${item.file.lastModified}`;

      if (opts?.goToReview) {
        setPendingReview(entry);
        setEntryStep('review');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        setEntryStep('form');
        setPendingReview(null);
        window.scrollTo({ top: 320, behavior: 'smooth' });
        notify.info('Loaded into the form. Edit if needed, then continue to review & submit.');
      }
    },
    [parsedToEntryValues, reset, replace],
  );

  const handleLoadQueueItem = useCallback(
    (itemId: string) => {
      const item = bulkReviewQueue.find((q) => q.id === itemId);
      if (!item) return;
      openQueueItemForReview(item);
    },
    [bulkReviewQueue, openQueueItemForReview],
  );

  const finishBulkReviewQueue = useCallback(
    (queue: BulkReviewQueueItem[]) => {
      const { submitted, failed } = bulkQueueCounts(queue);
      setActiveBulkReviewId(null);
      setEntryStep('form');
      setPendingReview(null);
      setParseMode('bulk');
      notify.success(
        `Review queue complete — ${submitted} submitted${failed ? `, ${failed} failed to parse` : ''}.`,
      );
      if (submitted > 0 && currentUser?.id) {
        endFormDraftSession('candidate_entry', currentUser.id, incomingRequirementId || undefined);
      }
      if (submitted > 0) {
        if (incomingRequirementId) {
          router.push(`/candidates?requirementId=${encodeURIComponent(incomingRequirementId)}`);
        } else {
          router.push('/candidates');
        }
      }
    },
    [currentUser?.id, incomingRequirementId, router],
  );

  const submitCandidateToServerRef = useRef<
    (
      data: EntryValues,
      fileOverride?: File | null,
      opts?: { skipNavigation?: boolean; skipDraftEnd?: boolean },
    ) => Promise<{ email?: string; id?: string } | undefined>
  >(async () => undefined);

  const handleSubmitAllParsed = useCallback(async () => {
    const pending = bulkReviewQueue.filter(
      (i) => i.reviewStatus === 'pending' || i.reviewStatus === 'reviewing',
    );
    if (!pending.length) return;

    setIsSubmittingAllBulk(true);
    let submitted = 0;
    let queueSnapshot = [...bulkReviewQueue];
    try {
      for (const item of pending) {
        const draft = parsedToEntryValues(item.parsed, item.file);
        await submitCandidateToServerRef.current(draft, item.file, {
          skipNavigation: true,
          skipDraftEnd: true,
        });
        submitted++;
        queueSnapshot = queueSnapshot.map((q) =>
          q.id === item.id
            ? { ...q, reviewStatus: 'submitted' as const, submittedAt: new Date().toISOString() }
            : q.reviewStatus === 'reviewing'
              ? { ...q, reviewStatus: 'pending' as const }
              : q,
        );
        setBulkReviewQueue(queueSnapshot);
      }
      finishBulkReviewQueue(queueSnapshot);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Bulk submit failed.';
      notify.error(
        submitted > 0
          ? `${msg} (${submitted} candidate(s) were saved before the error.)`
          : msg,
      );
    } finally {
      setIsSubmittingAllBulk(false);
    }
  }, [bulkReviewQueue, parsedToEntryValues, finishBulkReviewQueue]);

  useEffect(() => {
    if (resumeFile && !String(getValues('resumeRef') ?? '').trim()) {
      setValue('resumeRef', resumeFile.name, { shouldValidate: true });
    }
  }, [resumeFile, getValues, setValue]);

  useEffect(() => {
    if (parseMode !== 'single' || !resumeFile) {
      if (!resumeFile) resumeAutoExtractKeyRef.current = '';
      return;
    }
    const key = `${resumeFile.name}-${resumeFile.size}-${resumeFile.lastModified}`;
    if (resumeAutoExtractKeyRef.current === key) return;
    resumeAutoExtractKeyRef.current = key;
    void runResumeExtraction({ silent: true });
  }, [parseMode, resumeFile, runResumeExtraction]);

  const submitCandidateToServer = async (
    data: EntryValues,
    fileOverride?: File | null,
    opts?: { skipNavigation?: boolean; skipDraftEnd?: boolean },
  ) => {
    const activeResumeFile = fileOverride ?? resumeFile;
    const normalized = normalizeEntryForSubmit(data, activeResumeFile, candidates);
    const parsedTotalExperience = (normalized.totalExperience ?? '').trim()
      ? parseFlexibleExperienceInput(String(normalized.totalExperience))
      : null;
    const parsedRelevantExperience = (normalized.relevantExperience ?? '').trim()
      ? parseFlexibleExperienceInput(String(normalized.relevantExperience))
      : null;
    const relevantExperienceLabel =
      parsedRelevantExperience?.displayLabel ||
      (normalized.relevantExperience ?? '').trim() ||
      undefined;
    const token = localStorage.getItem('token');
    const authHeaders: HeadersInit = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const candidatePayload = {
        name: normalized.candidateName,
        email: normalized.email,
        phone: normalized.contactNumber || undefined,
        currentEmployer: normalized.currentEmployer,
        currentLocation: normalized.currentLocation?.trim() || undefined,
        preferredLocation: normalized.preferredLocation?.trim(),
        totalExperience:
          parsedTotalExperience?.storageYears != null
            ? String(parsedTotalExperience.storageYears)
            : '',
        experienceLabel:
          parsedTotalExperience?.displayLabel ||
          (normalized.totalExperience ?? ''),
        skillsRaw: normalized.skillsRaw,
        technologiesRaw: normalized.technologiesRaw,
        resumeRef: activeResumeFile?.name ?? normalized.resumeRef,
        candidateCode: normalized.candidateId,
        submissionDate: normalized.submissionDate,
        notes: normalized.notes?.trim() || undefined,
        currentCtc: normalized.currentCtc?.trim(),
        expectedCtc: normalized.expectedCtc?.trim(),
        noticePeriod: normalized.noticePeriod?.trim(),
        linkedinUrl: normalized.linkedinUrl?.trim() || undefined,
        highestQualification: normalized.highestQualification?.trim(),
        availableForInterview: normalized.availableForInterview
          ? normalized.availableForInterview.toLowerCase().includes('available')
          : undefined,
        reasonForJobChange: normalized.reasonForJobChange?.trim(),
        offerInHand: normalized.offerInHand,
        offerInHandDetails:
          normalized.offerInHand === true
            ? buildOfferInHandDetailsPayload(normalized.offerLines ?? [])
            : null,
        relevantExperience: relevantExperienceLabel,
      };

    const createCandidateAndMaybeUploadResume = async () => {
      const candidateResponse = await fetch(`${getPublicApiBase()}/api/candidates`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(candidatePayload),
      });
      if (!candidateResponse.ok) {
        const errorData = await candidateResponse.json().catch(() => ({}));
        throw new Error(
          (errorData as { message?: string }).message ||
            `Failed to create candidate: ${candidateResponse.statusText}`,
        );
      }
      const created = await candidateResponse.json();
      const createdCandidate = created?.data as { email?: string; id?: string } | undefined;
      if (activeResumeFile && createdCandidate?.email) {
        await uploadCandidateResume({
          email: createdCandidate.email,
          resumeFile: activeResumeFile,
        });
      }
      return createdCandidate;
    };

    // Optional JD flow: save candidate profile only (no submission row).
    const submittedCandidateId = (normalized.candidateId ?? '').trim();
    if (submittedCandidateId) {
      rememberSubmittedCandidateId(submittedCandidateId);
    }

    const createdCandidate = await createCandidateAndMaybeUploadResume();
    if (!createdCandidate?.id) {
      throw new Error('Candidate was created but no id was returned.');
    }

    if (!opts?.skipDraftEnd && currentUser?.id) {
      endFormDraftSession('candidate_entry', currentUser.id, incomingRequirementId || undefined);
    }

    await refresh();
    setIdSeqTick((n) => n + 1);

    if (opts?.skipNavigation) {
      return createdCandidate;
    }

    const goToRepository = (reqId: string) => {
      const qs = new URLSearchParams({ requirementId: reqId });
      qs.set('selectIds', createdCandidate.id!);
      router.push(`/candidates?${qs.toString()}`);
    };

    const reqForRepo = incomingRequirementId;
    if (reqForRepo) {
      goToRepository(reqForRepo);
    } else {
      const qs = new URLSearchParams();
      qs.set('selectIds', createdCandidate.id!);
      router.push(`/candidates?${qs.toString()}`);
    }

    return createdCandidate;
  };

  submitCandidateToServerRef.current = submitCandidateToServer;

  /** Validates and opens the review step (no API call yet). */
  const onSubmit = handleSubmit(async (data) => {
    if (incomingRequirementId && !canWorkOnRequirement) {
      notify.warning(workBlockReason ?? 'This requirement is view only.');
      return;
    }
    const emailForDup = (data.email ?? '').trim();
    const existingCandidate =
      emailForDup && !emailForDup.endsWith('@entry.local')
        ? candidates.find((c) => norm(c.email) === norm(emailForDup))
        : undefined;
    if (existingCandidate) {
      const already = incomingRequirementId
        ? submissions.some(
            (s) => s.candidateId === existingCandidate.id && s.jdId === incomingRequirementId,
          )
        : false;
      if (already) {
        notify.warning('This candidate is already mapped to this requirement.');
        return;
      }
    }

    setPendingReview(data);
    setEntryStep('review');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  const handleConfirmReview = async () => {
    if (!pendingReview) return;
    if (incomingRequirementId && !canWorkOnRequirement) {
      notify.warning(workBlockReason ?? 'This requirement is view only.');
      return;
    }
    setIsConfirmingSubmit(true);
    const queueId = activeBulkReviewId;
    const queueItem = queueId ? bulkReviewQueue.find((q) => q.id === queueId) : null;
    const fileOverride = queueItem?.file ?? resumeFile;

    try {
      await submitCandidateToServer(pendingReview, fileOverride, {
        skipNavigation: Boolean(queueId),
        skipDraftEnd: Boolean(queueId),
      });

      if (queueId) {
        let updatedQueue: BulkReviewQueueItem[] = [];
        setBulkReviewQueue((prev) => {
          updatedQueue = prev.map((item) =>
            item.id === queueId
              ? {
                  ...item,
                  reviewStatus: 'submitted' as const,
                  submittedAt: new Date().toISOString(),
                }
              : item.reviewStatus === 'reviewing'
                ? { ...item, reviewStatus: 'pending' as const }
                : item,
          );
          return updatedQueue;
        });

        const next = nextPendingQueueItem(updatedQueue);
        const counts = bulkQueueCounts(updatedQueue);

        if (next) {
          notify.success(
            `Candidate submitted. ${counts.submitted} done, ${counts.pending} remaining — opening next.`,
          );
          openQueueItemForReview(next, { goToReview: true });
        } else {
          finishBulkReviewQueue(updatedQueue);
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not save candidate. Please try again.';
      if (message.includes('already been submitted')) {
        notify.warning('This candidate is already mapped to this requirement.');
      } else {
        notify.error(message);
      }
    } finally {
      setIsConfirmingSubmit(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageBackNav />
      <PageHeader
        title="Candidate Search & Entry"
        subtitle="Drop a resume to auto-fill details with Metaforge AI, or enter manually. Single or bulk import supported — review before submitting."
        right={
          canWorkOnRequirement ? (
            <Link
              href={
                incomingRequirementId
                  ? `/candidates?requirementId=${encodeURIComponent(incomingRequirementId)}`
                  : '/candidates'
              }
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
            >
              <Users className="h-4 w-4" />
              Candidate Repository
            </Link>
          ) : null
        }
      />

      {workBlockReason ? <RequirementViewOnlyBanner message={workBlockReason} /> : null}

      {entryStep === 'review' && pendingReview ? (
        <section
          className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/60 p-6 pb-32 shadow-sm dark:border-indigo-800/60 dark:bg-indigo-950/30"
          aria-labelledby="review-heading"
        >
          <h2
            id="review-heading"
            className="text-lg font-semibold text-indigo-950 dark:text-indigo-100"
          >
            Review candidate details
            {activeBulkReviewId ? (
              <span className="ml-2 text-sm font-normal text-indigo-700 dark:text-indigo-300">
                ({bulkQueueCounts(bulkReviewQueue).submitted + 1} of{' '}
                {bulkQueueCounts(bulkReviewQueue).parsed} in queue)
              </span>
            ) : null}
          </h2>
          <p className="mt-1 text-sm text-indigo-900/80 dark:text-indigo-200/80">
            Check everything below. Empty name or email will be auto-filled when you save. Use{' '}
            <strong>Edit details</strong> to change the form, or <strong>Confirm &amp; submit</strong>{' '}
            to save{activeBulkReviewId ? ' and open the next pending candidate' : ''}.
          </p>

          {activeBulkReviewId && bulkReviewQueue.length > 0 ? (
            <ResumeParserPanel
              compact
              mode="bulk"
              onModeChange={setParseMode}
              resumeFile={resumeFile}
              onResumeFileChange={setResumeFile}
              bulkFiles={bulkFiles}
              onBulkFilesChange={setBulkFiles}
              bulkReviewQueue={bulkReviewQueue}
              onBulkReviewQueueChange={setBulkReviewQueue}
              activeBulkReviewId={activeBulkReviewId}
              isParsing={resumeExtracting}
              parseHint={null}
              onParseSingle={() => {}}
              onParseBulk={() => {}}
              onPreviewResume={handlePreviewResume}
              onLoadQueueItem={handleLoadQueueItem}
              onSubmitAllParsed={() => {}}
              isSubmittingAll={false}
            />
          ) : null}

          <dl className="mt-6 rounded-xl border border-indigo-100 bg-white/90 px-4 dark:border-indigo-900/40 dark:bg-zinc-950/80">
            <ReviewSummaryRow label="Candidate ID" value={pendingReview.candidateId} />
            <ReviewSummaryRow label="Submission date" value={pendingReview.submissionDate} />
            <ReviewSummaryRow label="Name" value={pendingReview.candidateName} />
            <ReviewSummaryRow label="Current company" value={pendingReview.currentEmployer} />
            <ReviewSummaryRow label="Contact" value={pendingReview.contactNumber} />
            <ReviewSummaryRow label="Email" value={pendingReview.email} />
            <ReviewSummaryRow label="LinkedIn" value={pendingReview.linkedinUrl} />
            <ReviewSummaryRow label="Highest qualification" value={pendingReview.highestQualification} />
            <ReviewSummaryRow label="Skills" value={pendingReview.skillsRaw} />
            <ReviewSummaryRow label="Technologies" value={pendingReview.technologiesRaw} />
            <ReviewSummaryRow
              label="Total experience"
              value={displayFlexibleExperienceValue(pendingReview.totalExperience)}
            />
            <ReviewSummaryRow
              label="Relevant experience"
              value={displayFlexibleExperienceValue(pendingReview.relevantExperience)}
            />
            <ReviewSummaryRow label="Current CTC" value={pendingReview.currentCtc} />
            <ReviewSummaryRow label="Expected CTC" value={pendingReview.expectedCtc} />
            <ReviewSummaryRow label="Notice period" value={pendingReview.noticePeriod} />
            <ReviewSummaryRow label="Current location" value={pendingReview.currentLocation} />
            <ReviewSummaryRow label="Preferred location" value={pendingReview.preferredLocation} />
            <ReviewSummaryRow
              label="Interview availability"
              value={pendingReview.availableForInterview}
            />
            <ReviewSummaryRow
              label="Offer in hand"
              value={
                pendingReview.offerInHand === true
                  ? 'Yes'
                  : pendingReview.offerInHand === false
                    ? 'No'
                    : '—'
              }
            />
            {pendingReview.offerInHand === true ? (
              <>
                <ReviewSummaryRow
                  label="Number of offers (filled rows)"
                  value={String(
                    countFilledOffers(
                      (pendingReview.offerLines ?? []).map((l) => ({
                        company: l.company ?? '',
                        ctc: l.ctc ?? '',
                      })),
                    ),
                  )}
                />
                {(pendingReview.offerLines ?? []).map((line, i) => (
                  <React.Fragment key={`offer-${i}`}>
                    <ReviewSummaryRow
                      label={`Offer ${i + 1} — company`}
                      value={line.company}
                    />
                    <ReviewSummaryRow label={`Offer ${i + 1} — CTC`} value={line.ctc} />
                  </React.Fragment>
                ))}
              </>
            ) : null}
            <ReviewSummaryRow label="Reason for job change" value={pendingReview.reasonForJobChange} />
            <ReviewSummaryRow label="Notes" value={pendingReview.notes} />
            <ReviewSummaryRow
              label="Resume file"
              value={
                resumeFile ? (
                  <span className="font-medium">{resumeFile.name}</span>
                ) : (
                  pendingReview.resumeRef || '—'
                )
              }
            />
          </dl>

          <div className="fixed right-0 bottom-0 left-0 z-50 border-t border-zinc-200/80 bg-white/95 px-4 py-4 shadow-[0_-12px_40px_-16px_rgba(15,23,42,0.15)] backdrop-blur-md supports-[backdrop-filter]:bg-white/90 dark:border-zinc-800/80 dark:bg-zinc-950/95 lg:left-[300px] lg:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setEntryStep('form');
                setPendingReview(null);
              }}
              className="h-11 rounded-xl border border-zinc-300 bg-white px-6 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Edit details
            </button>
            <button
              type="button"
              disabled={isConfirmingSubmit}
              onClick={() => void handleConfirmReview()}
              className="h-11 rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-white shadow-md transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {isConfirmingSubmit ? 'Submitting…' : 'Confirm & submit'}
            </button>
            </div>
          </div>
        </section>
      ) : null}

      <ResumeParserPanel
        hidden={entryStep === 'review'}
        mode={parseMode}
        onModeChange={setParseMode}
        resumeFile={resumeFile}
        onResumeFileChange={(f) => {
          setResumeFile(f);
          if (!f) {
            setResumeExtractHint(null);
            resumeAutoExtractKeyRef.current = '';
          }
        }}
        bulkFiles={bulkFiles}
        onBulkFilesChange={setBulkFiles}
        bulkReviewQueue={bulkReviewQueue}
        onBulkReviewQueueChange={setBulkReviewQueue}
        activeBulkReviewId={activeBulkReviewId}
        isParsing={resumeExtracting}
        parseHint={resumeExtractHint}
        onParseSingle={() => void runResumeExtraction({ silent: false })}
        onParseBulk={() => void runBulkResumeExtraction()}
        onPreviewResume={handlePreviewResume}
        onLoadQueueItem={handleLoadQueueItem}
        onSubmitAllParsed={() => void handleSubmitAllParsed()}
        isSubmittingAll={isSubmittingAllBulk}
      />

      {/* SECTION 2: Manual Entry */}
      <form
        onSubmit={onSubmit}
        className={entryStep === 'review' ? 'hidden' : 'space-y-5 pb-28'}
      >
        <FormSection
          title="Basic Info"
          description="All fields are optional except you must enter at least one detail somewhere on the form (name, contact, skills, resume, etc.)."
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field
              label="Candidate ID (optional)"
              hint="Auto-increments after each submit (CAND-YYYY-MM-DD-001, 002, …); editable"
              error={errors.candidateId?.message}
            >
              <TextInput
                {...register('candidateId')}
                placeholder="CAND-2026-06-05-001"
              />
            </Field>

            <Field label="Submission Date (optional)" error={errors.submissionDate?.message}>
              <TextInput
                {...register('submissionDate')}
                type="date"
              />
            </Field>

            <Field label="Candidate Name (optional)" error={errors.candidateName?.message}>
              <TextInput {...register('candidateName')} placeholder="e.g. Priya Nair" />
            </Field>

            <Field label="Current Company" error={errors.currentEmployer?.message}>
              <TextInput {...register('currentEmployer')} placeholder="e.g. Contoso" />
            </Field>

            <Field label="Contact Number (optional)" error={errors.contactNumber?.message}>
              <TextInput {...register('contactNumber')} placeholder="+91 9xxxx xxxxx" />
            </Field>

            <Field label="Email (optional)" error={errors.email?.message}>
              <TextInput {...register('email')} placeholder="name@company.com" />
            </Field>

            <Field label="LinkedIn URL" error={errors.linkedinUrl?.message}>
              <TextInput {...register('linkedinUrl')} placeholder="https://www.linkedin.com/in/..." />
            </Field>

            <Field label="Highest Qualification" error={errors.highestQualification?.message}>
              <TextInput {...register('highestQualification')} placeholder="e.g. B.Tech, MCA, MBA" />
            </Field>
          </div>
        </FormSection>

        <FormSection
          title="Skills & technologies"
          description="Use comma-separated values. Skills and technologies are stored in separate fields."
        >
          <div className="grid grid-cols-1 gap-4">
            <Field
              label="Skills"
              hint="e.g. Communication, Problem solving, Team management"
              className="max-w-3xl"
            >
              <TextInput
                {...register('skillsRaw')}
                placeholder="e.g. Communication, Problem solving, Stakeholder management"
              />
            </Field>
            <Field
              label="Technologies"
              hint="e.g. React, TypeScript, Node.js, SQL — use commas between items"
              className="max-w-3xl"
            >
              <TextInput
                {...register('technologiesRaw')}
                placeholder="e.g. React, TypeScript, SQL, problem solving"
              />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Experience & CTC" description="Capture experience and compensation details.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field
              label="Total years of experience"
              hint="Years, months, combined, or decimal (e.g. 3.5 Years → 3 Years 5 Months)"
              error={errors.totalExperience?.message}
            >
              <TextInput
                {...register('totalExperience', {
                  onBlur: (e) => {
                    const formatted = formatExperienceInputOnBlur(e.target.value);
                    if (formatted !== e.target.value.trim()) {
                      setValue('totalExperience', formatted, { shouldValidate: true });
                    }
                  },
                })}
                placeholder="e.g. 3 Years / 8 Months / 4 Years 6 Months / 3.5 Years"
              />
            </Field>
            <Field
              label="Relevant Experience"
              hint="Years, months, combined, or decimal (e.g. 2.8 Years → 2 Years 8 Months)"
              error={errors.relevantExperience?.message}
            >
              <TextInput
                {...register('relevantExperience', {
                  onBlur: (e) => {
                    const formatted = formatExperienceInputOnBlur(e.target.value);
                    if (formatted !== e.target.value.trim()) {
                      setValue('relevantExperience', formatted, { shouldValidate: true });
                    }
                  },
                })}
                placeholder="e.g. 2 Years / 6 Months / 3 Years 8 Months / 2.8 Years"
              />
            </Field>
            <Field label="Current CTC" error={errors.currentCtc?.message}>
              <TextInput {...register('currentCtc')} placeholder="e.g. 12 LPA" />
            </Field>
            <Field label="Expected CTC" error={errors.expectedCtc?.message}>
              <TextInput {...register('expectedCtc')} placeholder="e.g. 16 LPA" />
            </Field>
            <Field label="Notice Period" error={errors.noticePeriod?.message}>
              <TextInput {...register('noticePeriod')} placeholder="e.g. 30 days" />
            </Field>
          </div>
        </FormSection>

        <FormSection
          title="Location & Availability"
          description="Capture location preferences and interview availability."
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Current Location" error={errors.currentLocation?.message}>
              <TextInput {...register('currentLocation')} placeholder="e.g. Bengaluru" />
            </Field>
            <Field label="Preferred Location" error={errors.preferredLocation?.message}>
              <TextInput {...register('preferredLocation')} placeholder="e.g. Bengaluru / Remote" />
            </Field>
            <Field
              label="Availability for Interview"
              error={errors.availableForInterview?.message}
            >
              <TextInput
                {...register('availableForInterview')}
                placeholder="Enter availability details (e.g., Available after 5 PM, Available next week...)"
              />
            </Field>
            <Field label="Offer in Hand" error={errors.offerInHand?.message as string | undefined}>
              <Select {...register('offerInHand')}>
                <option value="">Select</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </Select>
            </Field>
            {offerInHandYes ? (
              <div className="md:col-span-2 space-y-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-medium text-indigo-900 dark:text-indigo-200">
                      Other offers in hand
                    </p>
                    <p className="mt-0.5 text-xs text-indigo-800/80 dark:text-indigo-300/80">
                      Add one row per offer. Count:{' '}
                      <span className="font-semibold tabular-nums">
                        {countFilledOffers(
                          offerLinesWatch.map((l) => ({
                            company: l.company ?? '',
                            ctc: l.ctc ?? '',
                          })),
                        )}
                      </span>{' '}
                      filled (optional fields).
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={fields.length >= 10}
                    onClick={() => append({ company: '', ctc: '' })}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-800 shadow-sm transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-800 dark:bg-zinc-900 dark:text-indigo-100 dark:hover:bg-zinc-800"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add offer
                  </button>
                </div>
                <div className="space-y-3">
                  {fields.map((field, index) => (
                    <div
                      key={field.id}
                      className="grid grid-cols-1 gap-3 rounded-lg border border-indigo-100/80 bg-white/90 p-3 md:grid-cols-[1fr_1fr_auto] dark:border-indigo-900/50 dark:bg-zinc-950/60"
                    >
                      <Field
                        label={`Company ${index + 1}`}
                        error={(errors.offerLines as any)?.[index]?.company?.message}
                      >
                        <TextInput
                          {...register(`offerLines.${index}.company` as const)}
                          placeholder="e.g. Acme Corp"
                        />
                      </Field>
                      <Field
                        label={`Offer CTC ${index + 1}`}
                        error={(errors.offerLines as any)?.[index]?.ctc?.message}
                      >
                        <TextInput
                          {...register(`offerLines.${index}.ctc` as const)}
                          placeholder="e.g. 18 LPA"
                        />
                      </Field>
                      <div className="flex items-end pb-0.5 md:justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            if (fields.length <= 1) {
                              setValue(`offerLines.0.company`, '');
                              setValue(`offerLines.0.ctc`, '');
                            } else {
                              remove(index);
                            }
                          }}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-rose-200 text-rose-700 transition hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-950/40"
                          title="Remove row"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <Field label="Reason for Job Change" error={errors.reasonForJobChange?.message}>
              <TextInput {...register('reasonForJobChange')} placeholder="e.g. Better role / Growth" />
            </Field>
            <Field
              label="Notes"
              hint="Internal recruiter notes (saved on the candidate profile)."
              className="md:col-span-2"
              error={errors.notes?.message}
            >
              <textarea
                {...register('notes')}
                rows={3}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                placeholder="Optional notes for your team only"
              />
            </Field>
          </div>
        </FormSection>

        <div className="fixed right-0 bottom-0 left-0 z-50 border-t border-gray-200/80 bg-white/95 px-4 py-4 shadow-[0_-12px_40px_-16px_rgba(15,23,42,0.15)] backdrop-blur-md supports-[backdrop-filter]:bg-white/90 dark:border-zinc-800/80 dark:bg-zinc-950/95 lg:left-[300px] lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-gray-600 dark:text-zinc-400">
              Fill only what you know, then review and submit. Resume is optional; missing name or
              email are filled automatically for saving.
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-11 w-full shrink-0 rounded-lg bg-blue-600 px-6 text-sm font-semibold text-white shadow-sm transition duration-200 hover:scale-[1.02] hover:bg-blue-700 hover:shadow-md disabled:opacity-60 sm:w-auto"
            >
              {isSubmitting ? 'Checking…' : 'Review & continue'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
