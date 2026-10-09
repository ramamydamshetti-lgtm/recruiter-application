'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  Mail,
  Phone,
  Sparkles,
  User,
} from 'lucide-react';
import { PageBackNav } from '@/components/ui/PageBackNav';
import { useSubmissionsStore } from '@/lib/domain/submissions/store';
import { getInterviews, type InterviewRecord } from '@/lib/api/interviews';
import {
  getOfferLetterBySubmission,
  recordOfferLetterResponse,
  releaseOfferLetter,
  saveOfferLetterDraft,
  type OfferLetterRecord,
} from '@/lib/api/offerLetters';
import { notify } from '@/lib/notify';
import { formatDateTime } from '@/lib/utils/dateTime';
import { requirementDetailHref } from '@/lib/domain/requirements/logic';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { StatusBadge } from '@/components/requirements/StatusBadge';

function formatFinalDecision(fd: string | null | undefined): string | null {
  if (!fd) return null;
  const u = fd.toUpperCase();
  if (u === 'SELECTED') return 'Selected in interview';
  if (u === 'REJECTED') return 'Rejected in interview';
  return fd;
}

function interviewStatusClass(status: string): string {
  const s = status.toLowerCase();
  if (s === 'completed') return 'bg-emerald-100 text-emerald-900';
  if (s === 'scheduled') return 'bg-blue-100 text-blue-900';
  if (s === 'cancelled') return 'bg-rose-100 text-rose-900';
  if (s === 'rescheduled') return 'bg-amber-100 text-amber-900';
  return 'bg-gray-100 text-gray-800';
}

/** Merge technologies + skills into one deduped list (same data often duplicated in both fields). */
function mergeSkillLabels(
  technologies: string[] | undefined,
  skills: string[] | undefined,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...(technologies ?? []), ...(skills ?? [])]) {
    const t = String(raw).replace(/^[\s.,]+|[\s.,]+$/g, '').trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function SkillChipList({
  items,
  align = 'start',
}: {
  items: string[];
  align?: 'start' | 'end';
}) {
  if (!items.length) {
    return <span className="text-sm text-gray-400">—</span>;
  }
  return (
    <div
      className={`flex flex-wrap gap-1.5 ${align === 'end' ? 'sm:justify-end' : ''}`}
    >
      {items.map((label, i) => (
        <span
          key={`${label.toLowerCase()}-${i}`}
          className="inline-flex max-w-full rounded-full border border-slate-200/90 bg-slate-50 px-2.5 py-1 text-xs font-medium leading-snug text-slate-800 shadow-sm"
          title={label}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

export function SubmissionDetailClient({ id }: { id: string }) {
  const { findById } = useSubmissionsStore();
  const submission = findById(id);
  const [dbInterviews, setDbInterviews] = useState<InterviewRecord[]>([]);
  const [interviewsLoading, setInterviewsLoading] = useState(false);

  const [offerLetter, setOfferLetter] = useState<OfferLetterRecord | null>(null);
  const [offerLoading, setOfferLoading] = useState(false);
  const [offerSaving, setOfferSaving] = useState(false);
  const [offerResponseModal, setOfferResponseModal] = useState<'accept' | 'decline' | null>(null);
  const [acceptJoiningDate, setAcceptJoiningDate] = useState('');
  const [declineOfferReason, setDeclineOfferReason] = useState('');
  const [offerResponseSubmitting, setOfferResponseSubmitting] = useState(false);
  const [offerForm, setOfferForm] = useState({
    positionTitle: '',
    compensation: '',
    joiningDate: '',
    validUntil: '',
    terms: '',
    letterContent: '',
  });

  const offerEligible =
    !!submission && submission.status === 'Selected' && !!submission.interviewDate;

  const sortedInterviews = useMemo(() => {
    return [...dbInterviews].sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    );
  }, [dbInterviews]);

  const finalInterviewRow = useMemo(() => {
    return sortedInterviews.find(
      (i) =>
        i.round.toLowerCase().includes('final') &&
        i.status.toLowerCase() === 'completed',
    );
  }, [sortedInterviews]);

  useEffect(() => {
    if (!submission) return;
    let cancelled = false;
    (async () => {
      setInterviewsLoading(true);
      try {
        const rows = await getInterviews({ submissionId: submission.id, limit: 100 });
        if (!cancelled) setDbInterviews(rows);
      } catch {
        if (!cancelled) setDbInterviews([]);
      } finally {
        if (!cancelled) setInterviewsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [submission?.id]);

  useEffect(() => {
    if (!submission?.id || !offerEligible) {
      setOfferLetter(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setOfferLoading(true);
      try {
        const row = await getOfferLetterBySubmission(submission.id);
        if (cancelled) return;
        setOfferLetter(row);
        if (row) {
          setOfferForm({
            positionTitle: row.positionTitle ?? '',
            compensation: row.compensation ?? '',
            joiningDate: row.joiningDate ? row.joiningDate.slice(0, 10) : '',
            validUntil: row.validUntil ? row.validUntil.slice(0, 10) : '',
            terms: row.terms ?? '',
            letterContent: row.letterContent ?? '',
          });
        } else {
          setOfferForm({
            positionTitle: submission.requirement.roleTitle || '',
            compensation: '',
            joiningDate: '',
            validUntil: '',
            terms: '',
            letterContent: '',
          });
        }
      } catch {
        if (!cancelled) setOfferLetter(null);
      } finally {
        if (!cancelled) setOfferLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [submission?.id, offerEligible]);

  if (!submission) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800">Submission not found</h2>
        <p className="mt-2 text-sm text-gray-500">The submission {id} could not be found.</p>
        <div className="mt-4 flex justify-start">
          <PageBackNav className="mb-0" />
        </div>
      </div>
    );
  }

  const submittedDate = new Date(submission.submittedOn).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const offerDraftEditable = !offerLetter || offerLetter.status === 'DRAFT';
  const payloadFromForm = () => ({
    positionTitle: offerForm.positionTitle.trim() || null,
    compensation: offerForm.compensation.trim() || null,
    joiningDate: offerForm.joiningDate ? `${offerForm.joiningDate}T12:00:00.000Z` : null,
    validUntil: offerForm.validUntil ? `${offerForm.validUntil}T12:00:00.000Z` : null,
    terms: offerForm.terms.trim() || null,
    letterContent: offerForm.letterContent.trim() || null,
  });

  async function handleSaveOfferDraft() {
    if (!submission || !offerDraftEditable) return;
    setOfferSaving(true);
    try {
      const saved = await saveOfferLetterDraft(submission.id, payloadFromForm());
      setOfferLetter(saved);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Failed to save draft');
    } finally {
      setOfferSaving(false);
    }
  }

  async function handleReleaseOffer() {
    if (!submission || !offerDraftEditable) return;
    const ok = notify.confirm(
      'Release this offer letter? It will be marked as sent to the candidate and you will not be able to edit the main fields from this screen.',
    );
    if (!ok) return;
    setOfferSaving(true);
    try {
      const { offerLetter: saved, emailSent, emailError } = await releaseOfferLetter(
        submission.id,
        payloadFromForm(),
      );
      setOfferLetter(saved);
      if (emailSent) {
        notify.success('Offer letter released. A copy was emailed to the candidate.');
      } else {
        const detail = emailError ? `\n\nDetails: ${emailError}` : '';
        notify.warning(
          `Offer letter released, but the email was not sent. Check SMTP / Microsoft Graph in the server environment and the candidate email.${detail}`,
        );
      }
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Failed to release offer letter');
    } finally {
      setOfferSaving(false);
    }
  }

  async function submitOfferAccept() {
    if (!submission?.id || !acceptJoiningDate.trim()) return;
    setOfferResponseSubmitting(true);
    try {
      const saved = await recordOfferLetterResponse(submission.id, {
        decision: 'accept',
        acceptedJoiningDate: `${acceptJoiningDate.trim()}T12:00:00.000Z`,
      });
      setOfferLetter(saved);
      setOfferResponseModal(null);
      setAcceptJoiningDate('');
      notify.success('Offer marked as accepted. Joining date saved internally.');
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Failed to record acceptance');
    } finally {
      setOfferResponseSubmitting(false);
    }
  }

  async function submitOfferDecline() {
    if (!submission?.id || !declineOfferReason.trim()) return;
    setOfferResponseSubmitting(true);
    try {
      const saved = await recordOfferLetterResponse(submission.id, {
        decision: 'decline',
        declineReason: declineOfferReason.trim(),
      });
      setOfferLetter(saved);
      setOfferResponseModal(null);
      setDeclineOfferReason('');
      notify.info('Offer decline recorded.');
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Failed to record decline');
    } finally {
      setOfferResponseSubmitting(false);
    }
  }

  const cand = submission.candidate;
  const mergedSkills = mergeSkillLabels(cand.technologies, cand.skills);
  const phoneDisplay = cand.phone?.trim() ? cand.phone : '—';

  const inputClass =
    'mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-gray-50 disabled:text-gray-500';
  const labelClass = 'text-xs font-semibold uppercase tracking-wide text-gray-500';

  return (
    <div className="space-y-6">
      <PageBackNav />

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-800">{cand.name}</h1>
            <p className="mt-1 text-sm text-gray-500">{cand.email}</p>
          </div>
          <StatusBadge status={submission.status} />
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Candidate
            </h3>
            <p className="mt-1 font-medium text-gray-800">{cand.name}</p>
            <p className="text-sm text-gray-500">{cand.currentCompany}</p>
            <p className="text-sm text-gray-500">{cand.experienceLabel} experience</p>
          </div>
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Requirement
            </h3>
            <Link
              href={requirementDetailHref(submission.requirement)}
              className="mt-1 block font-medium text-blue-600 hover:underline"
            >
              {submission.requirement.roleTitle}
            </Link>
            <p className="text-sm text-gray-500">{submission.requirement.clientName}</p>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Submitted By
          </h3>
          <span className="mt-1 inline-block font-medium text-gray-800 dark:text-zinc-200">
            {submission.submittedBy.name}
          </span>
          <p className="text-sm text-gray-500">Submitted on {submittedDate}</p>
        </div>
      </div>

      {submission.status === 'Selected' && (
        <section
          id="interview-workflow"
          className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
          aria-labelledby="post-interview-heading"
        >
          <div className="border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white px-6 py-4">
            <h2 id="post-interview-heading" className="text-base font-semibold text-gray-900">
              After final interview
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Interview rounds are managed on{' '}
              <Link href="/interviews" className="font-medium text-blue-600 hover:underline">
                Interview tracking
              </Link>
              . Once you mark the candidate <strong>Selected in interview</strong>, you can complete the
              offer below.
            </p>
          </div>

          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:divide-x lg:divide-gray-100">
            <div className="p-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <User className="h-4 w-4 text-emerald-600" aria-hidden />
                Candidate &amp; role
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Snapshot for this submission — use this when drafting the offer.
              </p>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <dt className="flex items-center gap-1.5 text-gray-500">
                    <ClipboardList className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    Candidate ID
                  </dt>
                  <dd className="text-right font-mono text-xs font-medium text-gray-900">
                    {cand.id}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-gray-500">Name</dt>
                  <dd className="font-medium text-gray-900">{cand.name}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="flex items-center gap-1.5 text-gray-500">
                    <Mail className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    Email
                  </dt>
                  <dd className="max-w-[70%] truncate text-right font-medium text-gray-900">
                    {cand.email}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="flex items-center gap-1.5 text-gray-500">
                    <Phone className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    Phone
                  </dt>
                  <dd className="font-medium text-gray-900">{phoneDisplay}</dd>
                </div>
                <div className="flex flex-col gap-2 border-t border-gray-100 pt-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <dt className="shrink-0 text-gray-500">Skills</dt>
                  <dd className="min-w-0 flex-1 sm:max-w-[min(100%,28rem)] sm:text-right">
                    <SkillChipList items={mergedSkills} align="end" />
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4 border-t border-gray-100 pt-3">
                  <dt className="flex items-center gap-1.5 text-gray-500">
                    <Briefcase className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    Role title
                  </dt>
                  <dd className="text-right font-medium text-gray-900">
                    {submission.requirement.roleTitle}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="flex items-center gap-1.5 text-gray-500">
                    <Building2 className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    Client
                  </dt>
                  <dd className="text-right font-medium text-gray-900">
                    {submission.requirement.clientName}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="bg-gray-50/50 p-6 lg:bg-white">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <CalendarDays className="h-4 w-4 text-blue-600" aria-hidden />
                Interview timeline (database)
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Scheduled rounds and outcomes stored for this submission.
              </p>

              {interviewsLoading ? (
                <p className="mt-4 text-sm text-gray-500">Loading interviews…</p>
              ) : sortedInterviews.length === 0 ? (
                <p className="mt-4 rounded-lg border border-dashed border-gray-200 bg-white p-4 text-sm text-gray-500">
                  No interview rows yet. Add rounds on{' '}
                  <Link href="/interviews" className="font-medium text-blue-600 hover:underline">
                    Interview tracking
                  </Link>
                  .
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {sortedInterviews.map((inv) => {
                    const fd = formatFinalDecision(inv.finalDecision);
                    const isFinal = inv.round.toLowerCase().includes('final');
                    return (
                      <li
                        key={inv.id}
                        className={`rounded-lg border p-4 shadow-sm ${
                          isFinal && inv.status.toLowerCase() === 'completed'
                            ? 'border-emerald-200 bg-emerald-50/40'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-gray-900">
                            {inv.round}
                            <span className="font-normal text-gray-500"> · {inv.mode}</span>
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${interviewStatusClass(inv.status)}`}
                          >
                            {inv.status}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-gray-600">
                          {inv.scheduledAt
                            ? formatDateTime(inv.scheduledAt)
                            : '—'}
                        </p>
                        {fd ? (
                          <p className="mt-2 text-xs font-medium text-emerald-800">
                            Outcome: {fd}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}

              {!offerEligible && (
                <div
                  className="mt-4 rounded-lg border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950"
                  role="status"
                >
                  <p className="font-medium">Offer release is locked</p>
                  <p className="mt-1 text-amber-900/90">
                    On{' '}
                    <Link href="/interviews" className="font-semibold underline hover:no-underline">
                      Interview tracking
                    </Link>
                    , open <strong>Final Decision</strong> and choose <strong>Select</strong> for this
                    candidate. That records the final outcome and unlocks the offer form below.
                  </p>
                </div>
              )}

              {offerEligible && finalInterviewRow && (
                <p className="mt-4 flex items-start gap-2 text-xs text-emerald-800">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Final interview is completed. Fill in the offer sections below, then{' '}
                    <strong>Release offer letter</strong> when you are ready.
                  </span>
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {offerEligible && (
        <section
          id="offer-letter"
          className="scroll-mt-6 overflow-hidden rounded-xl border-2 border-emerald-200/90 bg-white shadow-md"
          aria-labelledby="offer-letter-heading"
        >
          <div className="border-b border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-teal-50/30 px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-emerald-700" aria-hidden />
                  <h2 id="offer-letter-heading" className="text-lg font-semibold text-gray-900">
                    Offer release
                  </h2>
                </div>
                <p className="mt-2 max-w-2xl text-sm text-gray-600">
                  Document the formal offer for <strong>{cand.name}</strong>. Save a draft anytime.
                  When you release, the fields lock and we email a summary to{' '}
                  <strong>{cand.email}</strong> (same mail setup as interview notifications).
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {offerLetter?.status === 'RELEASED' && (
                  <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                    Released
                    {offerLetter.releasedAt
                      ? ` · ${formatDateTime(offerLetter.releasedAt)}`
                      : ''}
                  </span>
                )}
                {offerLetter?.status === 'ACCEPTED' && (
                  <span className="rounded-full bg-teal-600 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                    Offer accepted
                  </span>
                )}
                {offerLetter?.status === 'DECLINED' && (
                  <span className="rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                    Offer declined
                  </span>
                )}
                {offerLetter?.status === 'DRAFT' && (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                    Draft saved
                  </span>
                )}
                {!offerLetter && !offerLoading && (
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                    New offer
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="p-6">
            {offerLoading ? (
              <p className="text-sm text-gray-500">Loading offer details…</p>
            ) : (
              <div className="space-y-8">
                <div className="rounded-xl border border-gray-200 bg-gray-50/40 p-5">
                  <h3 className={labelClass}>1 · Selected candidate</h3>
                  <p className="mt-2 text-sm text-gray-600">
                    This offer applies to the submission above. Releasing sends the offer summary to{' '}
                    <strong>{cand.email}</strong> automatically.
                  </p>
                </div>

                <div className="rounded-xl border border-gray-200 p-5">
                  <h3 className={labelClass}>2 · Role &amp; compensation</h3>
                  <div className="mt-4 grid gap-5 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-sm font-medium text-gray-700">Position / designation</span>
                      <input
                        type="text"
                        className={inputClass}
                        value={offerForm.positionTitle}
                        onChange={(e) =>
                          setOfferForm((f) => ({ ...f, positionTitle: e.target.value }))
                        }
                        disabled={!offerDraftEditable}
                        placeholder="As stated in the offer (e.g. Cloud Security Engineer)"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-gray-700">Compensation package</span>
                      <input
                        type="text"
                        className={inputClass}
                        value={offerForm.compensation}
                        onChange={(e) =>
                          setOfferForm((f) => ({ ...f, compensation: e.target.value }))
                        }
                        disabled={!offerDraftEditable}
                        placeholder="e.g. ₹18 LPA fixed + variable, or full breakdown"
                      />
                    </label>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-5">
                  <h3 className={labelClass}>3 · Important dates</h3>
                  <div className="mt-4 grid gap-5 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-sm font-medium text-gray-700">Expected joining date</span>
                      <input
                        type="date"
                        className={inputClass}
                        value={offerForm.joiningDate}
                        onChange={(e) =>
                          setOfferForm((f) => ({ ...f, joiningDate: e.target.value }))
                        }
                        disabled={!offerDraftEditable}
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-gray-700">Offer valid until</span>
                      <input
                        type="date"
                        className={inputClass}
                        value={offerForm.validUntil}
                        onChange={(e) =>
                          setOfferForm((f) => ({ ...f, validUntil: e.target.value }))
                        }
                        disabled={!offerDraftEditable}
                      />
                      <p className="mt-1.5 text-xs text-gray-500">
                        Candidate must accept on or before this date (if applicable).
                      </p>
                    </label>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-5">
                  <h3 className={labelClass}>4 · Terms &amp; conditions</h3>
                  <p className="mt-2 text-sm text-gray-600">
                    Probation, notice period, benefits, or other legal / HR clauses.
                  </p>
                  <textarea
                    rows={4}
                    className={`${inputClass} mt-3 resize-y font-sans`}
                    value={offerForm.terms}
                    onChange={(e) => setOfferForm((f) => ({ ...f, terms: e.target.value }))}
                    disabled={!offerDraftEditable}
                    placeholder="e.g. 6 months probation; 90 days notice; medical insurance from day 1…"
                  />
                </div>

                <div className="rounded-xl border border-gray-200 p-5">
                  <h3 className={labelClass}>5 · Letter to candidate</h3>
                  <p className="mt-2 text-sm text-gray-600">
                    Full text you will send (email attachment, DocuSign body, or portal message). This is
                    stored for audit.
                  </p>
                  <textarea
                    rows={10}
                    className={`${inputClass} mt-3 resize-y font-mono text-[13px] leading-relaxed`}
                    value={offerForm.letterContent}
                    onChange={(e) =>
                      setOfferForm((f) => ({ ...f, letterContent: e.target.value }))
                    }
                    disabled={!offerDraftEditable}
                    placeholder={`Dear ${cand.name.split(' ')[0] || 'Candidate'},\n\nWe are pleased to offer you the position of…`}
                  />
                </div>

                {!offerDraftEditable && offerLetter?.releasedBy && (
                  <p className="text-center text-xs text-gray-500">
                    Released by {offerLetter.releasedBy.name} ({offerLetter.releasedBy.email})
                  </p>
                )}

                {offerLetter?.status === 'RELEASED' && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
                    <h3 className={labelClass}>Candidate response</h3>
                    <p className="mt-2 text-sm text-gray-600">
                      Record whether the candidate accepted or declined the released offer. If they accept,
                      set the agreed joining date for internal records.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAcceptJoiningDate(
                            offerLetter.joiningDate ? offerLetter.joiningDate.slice(0, 10) : '',
                          );
                          setOfferResponseModal('accept');
                        }}
                        className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
                      >
                        Accept offer
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeclineOfferReason('');
                          setOfferResponseModal('decline');
                        }}
                        className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-800 shadow-sm hover:bg-rose-50"
                      >
                        Decline offer
                      </button>
                    </div>
                  </div>
                )}

                {offerLetter?.status === 'ACCEPTED' && (
                  <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-5">
                    <h3 className={labelClass}>Candidate accepted</h3>
                    <p className="mt-2 text-sm text-gray-700">
                      <span className="font-medium">Agreed joining date (internal):</span>{' '}
                      {offerLetter.acceptedJoiningDate
                        ? new Date(offerLetter.acceptedJoiningDate).toLocaleDateString(undefined, {
                            dateStyle: 'medium',
                          })
                        : '—'}
                    </p>
                  </div>
                )}

                {offerLetter?.status === 'DECLINED' && offerLetter.declineReason?.trim() && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-5">
                    <h3 className={labelClass}>Candidate declined</h3>
                    <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
                      {offerLetter.declineReason}
                    </p>
                  </div>
                )}

                {offerDraftEditable && (
                  <div className="flex flex-col gap-3 border-t border-gray-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-gray-500">
                      Save often while drafting. Release only when the letter is final.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSaveOfferDraft()}
                        disabled={offerSaving}
                        className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                      >
                        {offerSaving ? 'Saving…' : 'Save draft'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReleaseOffer()}
                        disabled={offerSaving}
                        className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Release offer letter
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      <Modal
        isOpen={offerResponseModal === 'accept'}
        onClose={() => {
          if (offerResponseSubmitting) return;
          setOfferResponseModal(null);
          setAcceptJoiningDate('');
        }}
        title="Accept offer"
        className="max-w-md"
      >
        <p className="text-sm text-gray-600 dark:text-zinc-400 mb-3">
          Enter the agreed joining date for internal records (stored separately from the draft offer
          dates).
        </p>
        <label className="block text-sm font-medium text-gray-700 dark:text-zinc-200">
          Joining date
        </label>
        <input
          type="date"
          className={inputClass}
          value={acceptJoiningDate}
          onChange={(e) => setAcceptJoiningDate(e.target.value)}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={offerResponseSubmitting}
            onClick={() => {
              setOfferResponseModal(null);
              setAcceptJoiningDate('');
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={offerResponseSubmitting || !acceptJoiningDate.trim()}
            onClick={() => void submitOfferAccept()}
          >
            {offerResponseSubmitting ? 'Saving…' : 'Confirm acceptance'}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={offerResponseModal === 'decline'}
        onClose={() => {
          if (offerResponseSubmitting) return;
          setOfferResponseModal(null);
          setDeclineOfferReason('');
        }}
        title="Decline offer"
        className="max-w-lg"
      >
        <p className="text-sm text-gray-600 dark:text-zinc-400 mb-3">
          Describe why the candidate declined the offer. This is stored on the offer record.
        </p>
        <Textarea
          value={declineOfferReason}
          onChange={(e) => setDeclineOfferReason(e.target.value)}
          rows={4}
          maxLength={8000}
          placeholder="e.g. Accepted another offer; compensation mismatch"
          className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-zinc-100"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={offerResponseSubmitting}
            onClick={() => {
              setOfferResponseModal(null);
              setDeclineOfferReason('');
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={offerResponseSubmitting || !declineOfferReason.trim()}
            onClick={() => void submitOfferDecline()}
          >
            {offerResponseSubmitting ? 'Saving…' : 'Confirm decline'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
