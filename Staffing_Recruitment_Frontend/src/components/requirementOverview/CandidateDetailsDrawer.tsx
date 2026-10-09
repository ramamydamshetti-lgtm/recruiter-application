'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CalendarPlus,
  CheckCircle2,
  Gift,
  Lock,
  Mail,
  RefreshCw,
  ThumbsDown,
  UserCheck,
  X,
} from 'lucide-react';
import type { Submission } from '@/lib/domain/submissions/types';
import type { InterviewRecord } from '@/lib/api/interviews';
import type { OfferLetterRecord } from '@/lib/api/offerLetters';
import { getSubmissionStatusHistory, type StatusHistoryRow } from '@/lib/api/submissions';
import { getRequirementCommunications, type CommunicationLogRow } from '@/lib/api/requirements';
import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/Badge';
import { displayCandidateTotalExperience } from '@/lib/utils/candidateExperienceInput';

type TabId = 'overview' | 'interviews' | 'feedback' | 'activity' | 'communication' | 'offer';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'interviews', label: 'Interviews' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'activity', label: 'Activity' },
  { id: 'communication', label: 'Communication' },
  { id: 'offer', label: 'Offer' },
];

type Props = {
  open: boolean;
  onClose: () => void;
  submission: Submission | null;
  requirementId: string;
  interviews: InterviewRecord[];
  offer?: OfferLetterRecord | null;
  /** When false, drawer is view-only (another recruiter's submission). */
  actionsEnabled?: boolean;
  /** Hook actions back into the parent so reschedule/feedback/offer reuse existing drawers. */
  onAction?: (action: string, submissionId: string) => void;
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function ActionButton({
  children,
  onClick,
  tone = 'neutral',
  disabled,
  hint,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  tone?: 'primary' | 'success' | 'danger' | 'neutral' | 'violet';
  disabled?: boolean;
  hint?: string;
}) {
  const tones: Record<string, string> = {
    primary: 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100',
    danger: 'border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100',
    violet: 'border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100',
    neutral: 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition',
        tones[tone],
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      {children}
    </button>
  );
}

export function CandidateDetailsDrawer({
  open,
  onClose,
  submission,
  requirementId,
  interviews,
  offer,
  actionsEnabled = true,
  onAction,
}: Props) {
  const [tab, setTab] = useState<TabId>('overview');
  const [statusHistory, setStatusHistory] = useState<StatusHistoryRow[]>([]);
  const [statusLoading, setStatusLoading] = useState(false);
  const [comms, setComms] = useState<CommunicationLogRow[]>([]);
  const [commsLoading, setCommsLoading] = useState(false);

  useEffect(() => {
    if (!open) setTab('overview');
  }, [open, submission?.id]);

  useEffect(() => {
    if (!open || !submission?.id) return;
    let cancelled = false;
    setStatusLoading(true);
    void (async () => {
      try {
        const rows = await getSubmissionStatusHistory(submission.id);
        if (!cancelled) setStatusHistory(rows);
      } catch {
        if (!cancelled) setStatusHistory([]);
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, submission?.id]);

  useEffect(() => {
    if (!open || tab !== 'communication' || !requirementId) return;
    let cancelled = false;
    setCommsLoading(true);
    void (async () => {
      try {
        const rows = await getRequirementCommunications(requirementId);
        if (!cancelled) setComms(rows);
      } catch {
        if (!cancelled) setComms([]);
      } finally {
        if (!cancelled) setCommsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tab, requirementId]);

  const submissionInterviews = useMemo(
    () =>
      submission
        ? [...interviews]
            .filter((i) => i.submissionId === submission.id)
            .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
        : [],
    [interviews, submission],
  );

  const interviewsByRound = useMemo(() => {
    const map: Record<'L1' | 'L2' | 'Final' | 'Other', InterviewRecord[]> = {
      L1: [],
      L2: [],
      Final: [],
      Other: [],
    };
    for (const i of submissionInterviews) {
      const r = i.round?.trim().toUpperCase() ?? '';
      if (r === 'L1') map.L1.push(i);
      else if (r === 'L2') map.L2.push(i);
      else if (r === 'FINAL' || r.startsWith('FINAL')) map.Final.push(i);
      else map.Other.push(i);
    }
    return map;
  }, [submissionInterviews]);

  const submissionComms = useMemo(
    () => (submission ? comms.filter((c) => !c.submissionId || c.submissionId === submission.id) : []),
    [comms, submission],
  );

  // Offer is gated until the latest Final round is marked Selected (or the
  // submission itself is Selected/Offered/Joined).
  const finalSelected = useMemo(() => {
    if (!submission) return false;
    if (submission.status === 'Selected') return true;
    if (offer?.status === 'RELEASED' || offer?.status === 'ACCEPTED') return true;
    const finalRow = interviewsByRound.Final[0];
    if (!finalRow) return false;
    const dec = (finalRow.finalDecision ?? '').toString().toUpperCase();
    return dec === 'SELECTED';
  }, [submission, offer, interviewsByRound.Final]);

  if (!open || !submission) return null;
  const c = submission.candidate;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close backdrop" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-800"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to Requirement Overview
            </button>
            <div className="truncate text-lg font-semibold text-gray-900">{c.name}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-600">
              <Badge className="border-gray-200 bg-gray-100 text-gray-700">{submission.status}</Badge>
              <span className="truncate">{c.email}</span>
              {c.phone ? <span>· {c.phone}</span> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Close drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-gray-100 px-2 py-2">
          <div className="flex flex-wrap gap-1">
            {TABS.map((t) => {
              const isOffer = t.id === 'offer';
              const offerLocked = isOffer && !finalSelected;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                    tab === t.id
                      ? 'bg-[#1a2b4a] text-white shadow-sm'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                    offerLocked && 'opacity-60',
                  )}
                  title={offerLocked ? 'Offer unlocks after Final Round = Selected' : t.label}
                >
                  {offerLocked && <Lock className="h-3 w-3" />}
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {tab === 'overview' && (
            <OverviewTab submission={submission} />
          )}

          {tab === 'interviews' && (
            <InterviewsTab
              interviewsByRound={interviewsByRound}
              actionsEnabled={actionsEnabled}
              onSchedule={() => onAction?.('schedule', submission.id)}
              onReschedule={() => onAction?.('reschedule', submission.id)}
              onFeedback={() => onAction?.('feedback', submission.id)}
            />
          )}

          {tab === 'feedback' && (
            <FeedbackTab
              interviews={submissionInterviews}
              actionsEnabled={actionsEnabled}
              onAddFeedback={() => onAction?.('feedback', submission.id)}
            />
          )}

          {tab === 'activity' && (
            <ActivityTab loading={statusLoading} rows={statusHistory} />
          )}

          {tab === 'communication' && (
            <CommunicationTab loading={commsLoading} rows={submissionComms} />
          )}

          {tab === 'offer' && (
            <OfferTab
              offer={offer ?? null}
              unlocked={finalSelected}
              actionsEnabled={actionsEnabled}
              onRelease={() => onAction?.('offer', submission.id)}
              onAccept={() => onAction?.('offer_accept', submission.id)}
              onDecline={() => onAction?.('offer_decline', submission.id)}
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-100 bg-gray-50/80 px-4 py-3">
          {actionsEnabled ? (
            <div className="flex flex-wrap gap-1.5">
              {submission.status !== 'Rejected' && submission.status !== 'Selected' && (
                <ActionButton tone="primary" onClick={() => onAction?.('schedule', submission.id)}>
                  <CalendarPlus className="h-3 w-3" />
                  Schedule
                </ActionButton>
              )}
              {submissionInterviews.length > 0 && submission.status !== 'Rejected' && (
                <ActionButton tone="neutral" onClick={() => onAction?.('reschedule', submission.id)}>
                  <RefreshCw className="h-3 w-3" />
                  Reschedule
                </ActionButton>
              )}
              {submission.status !== 'Rejected' && (
                <ActionButton tone="success" onClick={() => onAction?.('feedback', submission.id)}>
                  <CheckCircle2 className="h-3 w-3" />
                  Feedback
                </ActionButton>
              )}
              <ActionButton
                tone="violet"
                disabled={!finalSelected}
                hint={finalSelected ? 'Release offer letter' : 'Available after Final Round = Selected'}
                onClick={() => onAction?.('offer', submission.id)}
              >
                {finalSelected ? <Gift className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                Offer
              </ActionButton>
              {submission.status !== 'Rejected' && (
                <ActionButton tone="danger" onClick={() => onAction?.('rejected', submission.id)}>
                  <ThumbsDown className="h-3 w-3" />
                  Reject
                </ActionButton>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-500">
              View only — submitted by {submission.submittedBy?.name || submission.submittedBy?.email || 'another recruiter'}.
            </p>
          )}
          <Link
            href={`/candidates/${encodeURIComponent(c.id)}`}
            className="text-xs font-semibold text-blue-700 hover:underline"
          >
            View full profile
          </Link>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ submission }: { submission: Submission }) {
  const c = submission.candidate;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldRow label="Total experience" value={displayCandidateTotalExperience(c)} />
        <FieldRow label="Current Company" value={c.currentCompany || '—'} />
        <FieldRow label="Notice Period" value={c.noticePeriod || '—'} />
        <FieldRow label="Current Salary" value={c.currentSalary ?? '—'} />
        <FieldRow label="Expected Salary" value={c.expectedSalary ?? '—'} />
        <FieldRow label="Location" value={c.currentLocation ?? '—'} />
        <FieldRow label="Preferred Location" value={c.preferredLocation ?? '—'} />
        <FieldRow label="Source" value={c.sourcePlatform ?? '—'} />
      </div>

      {(c.skills?.length ?? 0) + (c.technologies?.length ?? 0) > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Skills</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[...(c.technologies ?? []), ...(c.skills ?? [])].slice(0, 24).map((s, idx) => (
              <span key={`${s}-${idx}`} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <FieldRow label="Submission ID" value={submission.submissionRef ?? submission.id} />
        <FieldRow label="Submitted" value={formatDateTime(submission.submittedOn)} />
        <FieldRow label="Submitted By" value={submission.submittedBy?.name || '—'} />
        <FieldRow label="Status" value={submission.status} />
      </div>

      {submission.rejectionReason && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          <div className="text-xs font-semibold uppercase tracking-wide">Rejection reason</div>
          <p className="mt-1">{submission.rejectionReason}</p>
        </div>
      )}
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-0.5 text-sm text-gray-900">{value}</div>
    </div>
  );
}

function InterviewsTab({
  interviewsByRound,
  actionsEnabled = true,
  onSchedule,
  onReschedule,
  onFeedback,
}: {
  interviewsByRound: Record<'L1' | 'L2' | 'Final' | 'Other', InterviewRecord[]>;
  actionsEnabled?: boolean;
  onSchedule: () => void;
  onReschedule: () => void;
  onFeedback: () => void;
}) {
  const sections: { key: 'L1' | 'L2' | 'Final'; label: string }[] = [
    { key: 'L1', label: 'L1 Round' },
    { key: 'L2', label: 'L2 Round' },
    { key: 'Final', label: 'Final Round' },
  ];

  return (
    <div className="space-y-4">
      {actionsEnabled ? (
        <div className="flex flex-wrap gap-2">
          <ActionButton tone="primary" onClick={onSchedule}>
            <CalendarPlus className="h-3 w-3" />
            Schedule Interview
          </ActionButton>
          <ActionButton tone="neutral" onClick={onReschedule}>
            <RefreshCw className="h-3 w-3" />
            Reschedule
          </ActionButton>
          <ActionButton tone="success" onClick={onFeedback}>
            <CheckCircle2 className="h-3 w-3" />
            Add Feedback
          </ActionButton>
        </div>
      ) : null}

      {sections.map((sec) => {
        const rows = interviewsByRound[sec.key];
        return (
          <div key={sec.key} className="rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
              <div className="text-sm font-semibold text-gray-900">{sec.label}</div>
              <span className="text-[11px] text-gray-500">
                {rows.length === 0 ? 'Pending' : `${rows.length} record${rows.length === 1 ? '' : 's'}`}
              </span>
            </div>
            {rows.length === 0 ? (
              <div className="px-3 py-4 text-xs text-gray-500">No interview yet for this round.</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {rows.map((iv, idx) => {
                  const isLatest = idx === 0;
                  const decision = (iv.finalDecision ?? '').toString();
                  return (
                    <li key={iv.id} className="px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-gray-900">{formatDateTime(iv.scheduledAt)}</div>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                          {iv.status}
                          {!isLatest ? ' · history' : ''}
                        </span>
                      </div>
                      <div className="mt-1 grid gap-1 text-[11px] text-gray-600 sm:grid-cols-2">
                        <span>Mode: {iv.mode}</span>
                        <span>Interviewer: {iv.candidate?.name ? '—' : '—'}</span>
                        {iv.meetingLink && (
                          <a
                            href={iv.meetingLink}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-blue-700 hover:underline"
                          >
                            {iv.meetingLink}
                          </a>
                        )}
                        {decision && (
                          <span>
                            Decision: <strong className="text-gray-800">{decision}</strong>
                          </span>
                        )}
                      </div>
                      {iv.feedback && (
                        <p className="mt-1 rounded bg-gray-50 px-2 py-1 text-[11px] text-gray-700">{iv.feedback}</p>
                      )}
                      {iv.notes && (
                        <p className="mt-1 text-[11px] italic text-gray-500">Notes: {iv.notes}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FeedbackTab({
  interviews,
  actionsEnabled = true,
  onAddFeedback,
}: {
  interviews: InterviewRecord[];
  actionsEnabled?: boolean;
  onAddFeedback: () => void;
}) {
  const withFeedback = interviews.filter((i) => i.feedback || (i.rating ?? 0) > 0 || i.finalDecision);
  return (
    <div className="space-y-3">
      <div className="flex justify-between">
        <p className="text-sm text-gray-600">All interviewer feedback for this candidate.</p>
        {actionsEnabled ? (
          <ActionButton tone="success" onClick={onAddFeedback}>
            <CheckCircle2 className="h-3 w-3" />
            Add Feedback
          </ActionButton>
        ) : null}
      </div>
      {withFeedback.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-4 py-8 text-center text-sm text-gray-500">
          No interview feedback yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {withFeedback.map((iv) => (
            <li key={iv.id} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-gray-900">
                  {iv.round} · {formatDateTime(iv.scheduledAt)}
                </div>
                <span className="text-xs text-gray-500">Rating: {iv.rating ?? '—'}/5</span>
              </div>
              {iv.feedback && <p className="mt-1 text-sm text-gray-700">{iv.feedback}</p>}
              {iv.finalDecision && (
                <div className="mt-1 text-[11px]">
                  Decision: <strong>{iv.finalDecision}</strong>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActivityTab({ loading, rows }: { loading: boolean; rows: StatusHistoryRow[] }) {
  if (loading) return <p className="text-sm text-gray-500">Loading status history…</p>;
  if (rows.length === 0)
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-4 py-8 text-center text-sm text-gray-500">
        No status changes recorded yet.
      </div>
    );
  return (
    <ol className="relative ml-3 space-y-3 border-l border-gray-200 pl-5">
      {rows.map((r) => (
        <li key={r.id} className="relative">
          <span className="absolute -left-[27px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-blue-600 bg-white" />
          <div className="rounded-lg border border-gray-100 bg-white p-3 text-sm">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-gray-900">
                {r.oldStatus ?? '—'} → {r.newStatus}
              </div>
              <span className="text-[11px] text-gray-500">{formatDateTime(r.createdAt)}</span>
            </div>
            <div className="mt-1 text-[11px] text-gray-500">
              {r.changedBy?.name ?? 'System'}
              {r.reason ? ` · ${r.reason}` : ''}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function CommunicationTab({ loading, rows }: { loading: boolean; rows: CommunicationLogRow[] }) {
  if (loading) return <p className="text-sm text-gray-500">Loading communication log…</p>;
  if (rows.length === 0)
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-4 py-8 text-center text-sm text-gray-500">
        No outbound mail logged yet.
      </div>
    );
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.id} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-gray-900">
              <Mail className="h-3 w-3" />
              {r.subject ?? '(no subject)'}
            </div>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                r.status === 'SENT'
                  ? 'bg-emerald-50 text-emerald-800'
                  : r.status === 'FAILED'
                    ? 'bg-rose-50 text-rose-800'
                    : 'bg-gray-100 text-gray-700',
              )}
            >
              {r.status}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-gray-500">
            To: {r.recipient} · {formatDateTime(r.createdAt)} · {r.type}
          </div>
        </li>
      ))}
    </ul>
  );
}

function OfferTab({
  offer,
  unlocked,
  actionsEnabled = true,
  onRelease,
  onAccept,
  onDecline,
}: {
  offer: OfferLetterRecord | null;
  unlocked: boolean;
  actionsEnabled?: boolean;
  onRelease: () => void;
  onAccept: () => void;
  onDecline: () => void;
}) {
  if (!unlocked) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="flex items-center gap-2 font-semibold">
          <Lock className="h-4 w-4" />
          Offer locked
        </div>
        <p className="mt-1 text-[13px]">
          The offer flow opens automatically once the candidate is marked <strong>Selected</strong> in the Final round.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {actionsEnabled ? (
        <div className="flex flex-wrap gap-2">
          <ActionButton tone="violet" onClick={onRelease}>
            <Gift className="h-3 w-3" />
            {offer ? 'Resend / Update Offer' : 'Send Offer Letter'}
          </ActionButton>
          {offer && (
            <>
              <ActionButton tone="success" onClick={onAccept}>
                Mark Accepted
              </ActionButton>
              <ActionButton tone="danger" onClick={onDecline}>
                Mark Declined
              </ActionButton>
            </>
          )}
        </div>
      ) : null}

      {!offer ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-4 py-8 text-center text-sm text-gray-500">
          No offer released yet.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldRow label="Status" value={offer.status} />
          <FieldRow label="Compensation" value={offer.compensation ?? '—'} />
          <FieldRow label="Joining Date" value={formatDateTime(offer.joiningDate)} />
          <FieldRow label="Valid Until" value={formatDateTime(offer.validUntil)} />
        </div>
      )}
    </div>
  );
}
