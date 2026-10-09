'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { Download, Plus, Trash2 } from 'lucide-react';
import { PageBackNav } from '@/components/ui/PageBackNav';
import { PageHeader } from '@/components/ui/PageHeader';
import { FormSection } from '@/components/ui/FormSection';
import { Field, Select, TextInput, inputBase } from '@/components/ui/Field';
import { StatusBadge } from '@/components/requirements/StatusBadge';
import { getCandidate, updateCandidate } from '@/lib/api/candidates';
import { useCandidatesStore } from '@/lib/domain/candidates/store';
import type { Candidate } from '@/lib/domain/candidates/types';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  buildOfferInHandDetailsPayload,
  countFilledOffers,
  offerLinesFromApi,
  type OfferInHandLine,
} from '@/lib/utils/offerInHandDetails';
import { getPublicApiBase } from '@/lib/publicOrigin';
import { notify } from '@/lib/notify';
import { formatDateTime } from '@/lib/utils/dateTime';
import {
  FLEXIBLE_EXPERIENCE_ERROR,
  displayCandidateTotalExperience,
  formatExperienceInputOnBlur,
  parseFlexibleExperienceInput,
} from '@/lib/utils/candidateExperienceInput';

type DetailForm = {
  name: string;
  email: string;
  phone: string;
  currentEmployer: string;
  skillsRaw: string;
  technologiesRaw: string;
  totalExperience: string;
  currentCtc: string;
  expectedCtc: string;
  noticePeriod: string;
  currentLocation: string;
  preferredLocation: string;
  availableForInterview: string;
  reasonForJobChange: string;
  offerInHand: string;
  offerLines: OfferInHandLine[];
  linkedinUrl: string;
  highestQualification: string;
  relevantExperience: string;
  notes: string;
  resumeRef: string;
};

function candidateToForm(c: Candidate): DetailForm {
  const oh = c.offerInHand != null ? String(c.offerInHand).toLowerCase() : '';
  return {
    name: c.name,
    email: c.email,
    phone: c.phone ?? '',
    currentEmployer: c.currentEmployer ?? '',
    skillsRaw: (c.skills ?? []).join(', '),
    technologiesRaw: (c.technologies ?? []).join(', '),
    totalExperience: (() => {
      const label = c.experienceLabel?.trim();
      if (label && parseFlexibleExperienceInput(label)) return label;
      const displayed = displayCandidateTotalExperience(c);
      return displayed === '—' ? '' : displayed;
    })(),
    currentCtc: c.currentSalary ?? '',
    expectedCtc: c.expectedSalary ?? '',
    noticePeriod: c.noticePeriod ?? '',
    currentLocation: c.currentLocation ?? c.location ?? '',
    preferredLocation: c.preferredLocation ?? '',
    availableForInterview: c.availableForInterview ?? '',
    reasonForJobChange: c.reasonForJobChange ?? '',
    offerInHand: oh === 'true' ? 'true' : oh === 'false' ? 'false' : '',
    offerLines: offerLinesFromApi(
      c.offerInHandDetails,
      c.offerInHandAmount,
      c.offerInHandCompany,
    ),
    linkedinUrl: c.linkedinUrl ?? '',
    highestQualification: c.highestQualification ?? '',
    relevantExperience: c.relevantExperience ?? '',
    notes: c.notes ?? '',
    resumeRef: c.resumeRef ?? '',
  };
}

export function CandidateDetailPage({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const { currentUser } = useAuth();
  const { submissions, jobDemands, refresh } = useCandidatesStore();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<DetailForm>();
  const detailOfferWatch = useWatch({ control, name: 'offerInHand' });
  const detailOfferLinesWatch = useWatch({ control, name: 'offerLines' }) ?? [];
  const resumeRefWatch = useWatch({ control, name: 'resumeRef' });

  const { fields, append, remove, replace } = useFieldArray({ control, name: 'offerLines' });

  useEffect(() => {
    if (detailOfferWatch !== 'true') {
      replace([{ company: '', ctc: '' }]);
    }
  }, [detailOfferWatch, replace]);

  const load = useCallback(async () => {
    setLoadError(null);
    setReady(false);
    try {
      const c = await getCandidate(candidateId);
      reset(candidateToForm(c));
      setReady(true);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load candidate');
    }
  }, [candidateId, reset]);

  useEffect(() => {
    void load();
  }, [load]);

  const mySubmissions = useMemo(
    () => submissions.filter((s) => s.candidateId === candidateId),
    [submissions, candidateId],
  );
  const myOwnSubmissions = useMemo(() => {
    if (!currentUser?.email) return mySubmissions;
    const me = currentUser.email.trim().toLowerCase();
    return mySubmissions.filter((s) => {
      const submittedByEmail = s.submittedBy?.email?.trim().toLowerCase();
      return submittedByEmail === me;
    });
  }, [mySubmissions, currentUser?.email]);
  const myOwnSubmissionsSorted = useMemo(
    () =>
      [...myOwnSubmissions].sort(
        (a, b) => new Date(b.submittedOn).getTime() - new Date(a.submittedOn).getTime(),
      ),
    [myOwnSubmissions],
  );

  const jdLabel = useCallback(
    (jdId: string) => {
      const j = jobDemands.find((x) => x.id === jdId);
      return j ? `${j.jdCode || j.id} — ${j.jobTitle}` : jdId;
    },
    [jobDemands],
  );

  const onSave = handleSubmit(async (data) => {
    setSaveError(null);
    setSavedMsg(null);
    try {
      const name = data.name.trim() || 'Candidate (draft)';
      const emailRaw = data.email.trim();
      const email =
        emailRaw || `draft+${candidateId.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}@entry.local`;
      const totalRaw = data.totalExperience.trim();
      const parsedTotal = totalRaw ? parseFlexibleExperienceInput(totalRaw) : null;
      if (totalRaw && !parsedTotal) {
        setSaveError(FLEXIBLE_EXPERIENCE_ERROR);
        return;
      }
      const relevantRaw = data.relevantExperience.trim();
      const parsedRelevant = relevantRaw ? parseFlexibleExperienceInput(relevantRaw) : null;
      if (relevantRaw && !parsedRelevant) {
        setSaveError(FLEXIBLE_EXPERIENCE_ERROR);
        return;
      }
      const updated = await updateCandidate(candidateId, {
        name,
        email,
        phone: data.phone.trim() || null,
        currentEmployer: data.currentEmployer.trim() || null,
        skillsRaw: data.skillsRaw,
        technologiesRaw: data.technologiesRaw,
        totalExperience:
          parsedTotal?.storageYears != null ? String(parsedTotal.storageYears) : totalRaw ? '' : null,
        experienceLabel: parsedTotal?.displayLabel ?? null,
        currentCtc: data.currentCtc.trim() || null,
        expectedCtc: data.expectedCtc.trim() || null,
        noticePeriod: data.noticePeriod.trim() || null,
        currentLocation: data.currentLocation.trim() || null,
        preferredLocation: data.preferredLocation.trim() || null,
        availableForInterview: data.availableForInterview.trim() || null,
        reasonForJobChange: data.reasonForJobChange.trim() || null,
        relevantExperience: parsedRelevant?.displayLabel ?? null,
        offerInHand:
          data.offerInHand === 'true' ? true : data.offerInHand === 'false' ? false : null,
        offerInHandDetails:
          data.offerInHand === 'true'
            ? buildOfferInHandDetailsPayload(data.offerLines ?? [])
            : null,
        linkedinUrl: data.linkedinUrl.trim() || null,
        highestQualification: data.highestQualification.trim() || null,
        notes: data.notes.trim() || null,
        resumeRef: data.resumeRef.trim() || null,
      });
      reset(candidateToForm(updated));
      await refresh();
      setSavedMsg('Changes saved.');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    }
  });

  const downloadResume = async () => {
    if (!String(resumeRefWatch ?? '').trim()) {
      notify.warning('No resume is available for this candidate.');
      return;
    }
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${getPublicApiBase()}/api/candidates/${encodeURIComponent(candidateId)}/resume`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || res.statusText);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const contentDisposition = res.headers.get('content-disposition') || '';
      const fileNameMatch =
        contentDisposition.match(/filename\*?=(?:UTF-8''|")?([^";\n]+)/i) ||
        contentDisposition.match(/filename="?([^";\n]+)"?/i);
      const downloadName = decodeURIComponent(
        (fileNameMatch?.[1] || `${candidateId}_resume`).replace(/"/g, '').trim(),
      );
      a.download = downloadName || `${candidateId}_resume`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Could not download resume');
    }
  };

  if (loadError) {
    return (
      <div className="space-y-4">
        <PageBackNav />
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {loadError}
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Loading candidate…</div>
    );
  }

  return (
    <div className="space-y-8 pb-28">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <PageBackNav />
          <PageHeader
            title="Candidate profile"
            subtitle="All fields are optional. Save partial profiles — you can still submit to the client from the requirement page."
          />
        </div>
        <button
          type="button"
          onClick={() => void downloadResume()}
          disabled={!String(resumeRefWatch ?? '').trim()}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          <Download className="h-4 w-4" />
          Download resume
        </button>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 text-xs font-mono text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
        Internal ID: {candidateId}
      </div>

      {myOwnSubmissionsSorted.length > 0 ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Submissions</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Showing requirements where you submitted this candidate (status per submission).
          </p>
          <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                <tr>
                  <th className="px-4 py-3">Requirement</th>
                  <th className="px-4 py-3">Submitted On</th>
                  <th className="px-4 py-3">Submitted By</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {myOwnSubmissionsSorted.map((s) => (
                  <tr key={s.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-900/50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/requirements/${s.jdId}`}
                        className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {jdLabel(s.jdId)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                      {formatDateTime(s.submittedOn)}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-200">
                      {s.submittedBy.name}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} className="whitespace-nowrap text-xs font-semibold" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Submissions</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            No submissions found for your login on this candidate.
          </p>
        </section>
      )}

      <form onSubmit={onSave} className="space-y-6 pb-4">
        {saveError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {saveError}
          </div>
        ) : null}
        {savedMsg ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
            {savedMsg}
          </div>
        ) : null}

        <FormSection title="Contact & identity" description="Optional — leave blank if unknown.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Full name (optional)" error={errors.name?.message}>
              <TextInput {...register('name')} />
            </Field>
            <Field label="Email (optional)" error={errors.email?.message}>
              <TextInput type="email" {...register('email')} />
            </Field>
            <Field label="Phone (optional)" error={errors.phone?.message}>
              <TextInput {...register('phone')} />
            </Field>
            <Field label="LinkedIn URL (optional)" error={errors.linkedinUrl?.message}>
              <TextInput {...register('linkedinUrl')} placeholder="https://..." />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Role & skills" description="Optional — comma-separated skills and technologies.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Current company" error={errors.currentEmployer?.message}>
              <TextInput {...register('currentEmployer')} />
            </Field>
            <Field label="Highest qualification" error={errors.highestQualification?.message}>
              <TextInput {...register('highestQualification')} />
            </Field>
            <Field label="Skills" className="md:col-span-2" error={errors.skillsRaw?.message}>
              <TextInput {...register('skillsRaw')} placeholder="Communication, Problem solving, Team leadership, …" />
            </Field>
            <Field label="Technology" className="md:col-span-2" error={errors.technologiesRaw?.message}>
              <TextInput {...register('technologiesRaw')} placeholder="React, Node, SQL, …" />
            </Field>
            <Field
              label="Total experience"
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
              label="Relevant experience"
              className="md:col-span-2"
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
          </div>
        </FormSection>

        <FormSection title="Compensation & logistics" description="All optional.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Current CTC" error={errors.currentCtc?.message}>
              <TextInput {...register('currentCtc')} />
            </Field>
            <Field label="Expected CTC" error={errors.expectedCtc?.message}>
              <TextInput {...register('expectedCtc')} />
            </Field>
            <Field label="Notice period" error={errors.noticePeriod?.message}>
              <TextInput {...register('noticePeriod')} />
            </Field>
            <Field label="Current location" error={errors.currentLocation?.message}>
              <TextInput {...register('currentLocation')} />
            </Field>
            <Field label="Preferred location" error={errors.preferredLocation?.message}>
              <TextInput {...register('preferredLocation')} />
            </Field>
            <Field label="Available for interview" error={errors.availableForInterview?.message}>
              <TextInput {...register('availableForInterview')} />
            </Field>
            <Field label="Reason for job change" className="md:col-span-2" error={errors.reasonForJobChange?.message}>
              <TextInput {...register('reasonForJobChange')} />
            </Field>
            <Field label="Offer in hand" error={errors.offerInHand?.message}>
              <Select {...register('offerInHand')}>
                <option value="">—</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </Select>
            </Field>
            {detailOfferWatch === 'true' ? (
              <div className="md:col-span-2 space-y-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/25">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-medium text-indigo-900 dark:text-indigo-200">
                      Other offers in hand
                    </p>
                    <p className="mt-0.5 text-xs text-indigo-800/80 dark:text-indigo-300/80">
                      Filled rows:{' '}
                      <span className="font-semibold tabular-nums">
                        {countFilledOffers(detailOfferLinesWatch)}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={fields.length >= 10}
                    onClick={() => append({ company: '', ctc: '' })}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-800 shadow-sm transition hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-800 dark:bg-zinc-900 dark:text-indigo-100"
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
                              setValue('offerLines.0.company', '');
                              setValue('offerLines.0.ctc', '');
                            } else {
                              remove(index);
                            }
                          }}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-rose-200 text-rose-700 transition hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-300"
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
            <Field label="Resume reference (optional)" hint="Filename or label stored on the profile" error={errors.resumeRef?.message}>
              <TextInput {...register('resumeRef')} />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Internal notes">
          <Field label="Notes" error={errors.notes?.message}>
            <textarea
              {...register('notes')}
              rows={4}
              className={`${inputBase} min-h-[100px] resize-y`}
            />
          </Field>
        </FormSection>

        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200/80 bg-white/95 px-4 py-4 shadow-[0_-12px_40px_-16px_rgba(15,23,42,0.15)] backdrop-blur-md transition-[left] duration-300 supports-[backdrop-filter]:bg-white/90 dark:border-zinc-800/80 dark:bg-zinc-950/95 lg:left-[var(--app-sidebar-width,300px)] lg:px-8">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => router.push('/candidates')}
              className="h-11 rounded-xl border border-zinc-300 bg-white px-6 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-11 rounded-xl bg-blue-600 px-8 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
            >
              {isSubmitting ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
