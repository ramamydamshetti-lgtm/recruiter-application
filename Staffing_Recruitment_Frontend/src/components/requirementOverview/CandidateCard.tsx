'use client';

import React from 'react';
import { getPublicApiBase } from '@/lib/publicOrigin';
import {
  Building2,
  CalendarPlus,
  CheckCircle2,
  Clock,
  FileText,
  Gift,
  Mail,
  Star,
  ThumbsDown,
} from 'lucide-react';
import type { Submission } from '@/lib/domain/submissions/types';
import type { Requirement } from '@/lib/domain/requirements/types';
import type { InterviewRecord } from '@/lib/api/interviews';
import type { OfferLetterStatus } from '@/lib/api/offerLetters';
import { cn } from '@/lib/utils/cn';
import { notify } from '@/lib/notify';
import { buildResumeDownloadFileName } from '@/lib/utils/resumeFileName';
import { computeMatchPercent, type PipelineColumnId } from '@/lib/requirementOverview/pipelineMapping';
import { Badge } from '@/components/ui/Badge';

type Props = {
  submission: Submission & { emailSent?: boolean };
  requirement: Requirement;
  columnId: PipelineColumnId;
  offerStatus?: OfferLetterStatus;
  latestInterview?: InterviewRecord | null;
  interviewBadge?: string;
  selected?: boolean;
  onToggleSelect?: (submissionId: string) => void;
  onOpenDetails?: (submissionId: string) => void;
  onAction?: (action: string, submissionId: string) => void;
  /** Hide the multi-select checkbox (e.g. on Rejected/Joined columns). */
  selectable?: boolean;
  canForwardToClient?: boolean;
};

type ActionDef = {
  key: string;
  label: string;
  icon: React.ReactNode;
  tone: 'primary' | 'success' | 'danger' | 'neutral' | 'violet';
  hint?: string;
};

const TONE: Record<ActionDef['tone'], string> = {
  primary: 'border-blue-100 bg-blue-50 text-blue-800 hover:bg-blue-100',
  success: 'border-emerald-100 bg-emerald-50 text-emerald-900 hover:bg-emerald-100',
  danger: 'border-rose-100 bg-rose-50 text-rose-900 hover:bg-rose-100',
  neutral: 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50',
  violet: 'border-violet-100 bg-violet-50 text-violet-900 hover:bg-violet-100',
};

/**
 * Build the contextual action set for a card based on which pipeline column
 * it lives in. Keeps the card minimal — only actions that make sense at this
 * stage are rendered.
 */
function actionsForColumn(
  columnId: PipelineColumnId,
  latestInterview?: InterviewRecord | null,
  offerStatus?: OfferLetterStatus,
  canForwardToClient = false,
): ActionDef[] {
  const decision = String(latestInterview?.finalDecision ?? '').trim().toUpperCase();
  const isSelected = decision === 'SELECTED';
  const isRejected = decision === 'REJECTED';
  switch (columnId) {
    case 'sourced':
    case 'submitted':
      // Pre-submission stage: recruiter selects candidates and uses the bulk
      // floating action bar to send them to the client. We surface a single
      // small "Submit" affordance for one-off sends.
      return [
        {
          key: 'submit_client',
          label: 'Submit to Lead',
          icon: <Mail className="h-3 w-3" />,
          tone: 'primary',
        },
        { key: 'rejected', label: 'Reject', icon: <ThumbsDown className="h-3 w-3" />, tone: 'danger' },
      ];
    case 'submitted_to_lead':
      return canForwardToClient
        ? [
            {
              key: 'forward_client',
              label: 'Forward & Submit',
              icon: <Mail className="h-3 w-3" />,
              tone: 'primary',
            },
          ]
        : [];
    case 'submitted_to_client':
      return [];
    case 'l1':
      if (isRejected) return [];
      if (isSelected) {
        return [
          {
            key: 'next_round_l2',
            label: 'Next Round',
            icon: <CalendarPlus className="h-3 w-3" />,
            tone: 'primary',
          },
        ];
      }
      return [
        {
          key: 'round_selected',
          label: 'Selected',
          icon: <CheckCircle2 className="h-3 w-3" />,
          tone: 'success',
        },
        { key: 'rejected', label: 'Reject', icon: <ThumbsDown className="h-3 w-3" />, tone: 'danger' },
      ];
    case 'l2':
      if (isRejected) return [];
      if (isSelected) {
        return [
          {
            key: 'next_round_final',
            label: 'Next Round',
            icon: <CalendarPlus className="h-3 w-3" />,
            tone: 'primary',
          },
        ];
      }
      return [
        {
          key: 'round_selected',
          label: 'Selected',
          icon: <CheckCircle2 className="h-3 w-3" />,
          tone: 'success',
        },
        { key: 'rejected', label: 'Reject', icon: <ThumbsDown className="h-3 w-3" />, tone: 'danger' },
      ];
    case 'final':
      if (isRejected) return [];
      if (isSelected) {
        const isReleased = offerStatus === 'RELEASED' || offerStatus === 'ACCEPTED' || offerStatus === 'DECLINED';
        return [
          {
            key: 'offer',
            label: isReleased ? 'Edit Offer Letter' : 'Release Offer',
            icon: <Gift className="h-3 w-3" />,
            tone: 'violet',
          },
        ];
      }
      return [
        { key: 'round_selected', label: 'Selected', icon: <CheckCircle2 className="h-3 w-3" />, tone: 'success' },
        { key: 'rejected', label: 'Reject', icon: <ThumbsDown className="h-3 w-3" />, tone: 'danger' },
      ];
    case 'selected':
      // Final round selected — offer becomes available.
      return [
        { key: 'offer', label: 'Release Offer', icon: <Gift className="h-3 w-3" />, tone: 'violet' },
      ];
    case 'offered':
      return [
        { key: 'candidate_response', label: 'Candidate Response', icon: <CheckCircle2 className="h-3 w-3" />, tone: 'success' },
      ];
    case 'joined':
    case 'rejected':
      return [];
  }
}

export function CandidateCard({
  submission,
  requirement,
  columnId,
  offerStatus,
  latestInterview,
  interviewBadge,
  selected = false,
  onToggleSelect,
  onOpenDetails,
  onAction,
  selectable = true,
  canForwardToClient = false,
}: Props) {
  const c = submission.candidate;
  const match = computeMatchPercent(requirement.technologies, c.technologies ?? c.skills);
  const isSubmittedToClientLane = columnId === 'submitted_to_client';
  const isL1Lane = columnId === 'l1';
  const showUtilityActions = columnId === 'sourced' || columnId === 'submitted';
  const decision = String(latestInterview?.finalDecision ?? '').trim().toUpperCase();
  const hasInterviewDecision = decision === 'SELECTED' || decision === 'REJECTED';
  const rejectionReason = (submission.rejectionReason ?? '').trim();
  const lastActivity = new Date(submission.submittedOn).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const actions = actionsForColumn(columnId, latestInterview, offerStatus, canForwardToClient);

  const stopPropagation = (handler: () => void) => (event: React.MouseEvent) => {
    event.stopPropagation();
    handler();
  };

  const showCheckbox = selectable && (columnId === 'sourced' || columnId === 'submitted');

  return (
    <div
      role={onOpenDetails ? 'button' : undefined}
      tabIndex={onOpenDetails ? 0 : undefined}
      onClick={() => onOpenDetails?.(submission.id)}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && onOpenDetails) {
          e.preventDefault();
          onOpenDetails(submission.id);
        }
      }}
      className={cn(
        'group relative cursor-pointer rounded-xl border bg-white p-3 shadow-sm transition',
        'hover:-translate-y-0.5 hover:shadow-md',
        selected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-blue-200',
      )}
    >
      {showCheckbox && (
        <label
          className="absolute right-2 top-2 inline-flex cursor-pointer items-center"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect?.(submission.id)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            aria-label={`Select ${c.name}`}
          />
        </label>
      )}

      <div className="flex items-start justify-between gap-2 pr-6">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-gray-900">{c.name}</div>
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-500">
            <Clock className="h-3 w-3" />
            {c.experienceLabel || '—'} exp
          </div>
        </div>
        {!isSubmittedToClientLane && match > 0 && (
          <Badge className="shrink-0 border-emerald-100 bg-emerald-50 text-emerald-900">{match}%</Badge>
        )}
      </div>

      <div className="mt-2 space-y-1 text-[11px] text-gray-600">
        <div className="flex items-center gap-1">
          <Building2 className="h-3 w-3 text-gray-400" />
          <span className="truncate">{c.currentCompany || 'Company —'}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3 text-gray-400" />
          <span className="truncate">Notice: {c.noticePeriod || '—'}</span>
        </div>
      </div>

      {!isSubmittedToClientLane && (
        <div className="mt-2 flex flex-wrap gap-1">
          {interviewBadge ? (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
              {interviewBadge}
            </span>
          ) : null}
          {!hasInterviewDecision ? (
            <span className="rounded-full bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-700 ring-1 ring-gray-200">
              {submission.status}
            </span>
          ) : null}
        </div>
      )}

      {!isSubmittedToClientLane &&
      (decision === 'REJECTED' || submission.status === 'Rejected') &&
      rejectionReason &&
      rejectionReason !== '—' ? (
        <div className="mt-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-medium text-rose-700">
          Rejected: {rejectionReason}
        </div>
      ) : null}

      <div className="mt-2 text-[10px] text-gray-400">Last activity: {lastActivity}</div>

      {actions.length > 0 && (
        <div
          className="mt-3 flex flex-wrap gap-1 border-t border-gray-100 pt-2"
          onClick={(e) => e.stopPropagation()}
        >
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              title={a.hint ?? a.label}
              onClick={stopPropagation(() => onAction?.(a.key, submission.id))}
              className={cn(
                'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition',
                TONE[a.tone],
              )}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      )}

      {showUtilityActions && (
        <div className="mt-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            disabled={!c.resumeUrl?.trim()}
            onClick={async (e) => {
              e.stopPropagation();
              const url = (c.resumeUrl ?? '').trim();
              if (!url) return;
              const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
              const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
              try {
                let blob: Blob;
                if (url.startsWith('http://') || url.startsWith('https://')) {
                  const res = await fetch(url);
                  if (!res.ok) throw new Error('fetch');
                  blob = await res.blob();
                } else {
                  const res = await fetch(`${getPublicApiBase()}/api/candidates/${encodeURIComponent(c.id)}/resume`, {
                    headers,
                  });
                  if (!res.ok) throw new Error('resume');
                  blob = await res.blob();
                }
                const ext = url.match(/\.(pdf|doc|docx)$/i)?.[1] ?? 'pdf';
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = buildResumeDownloadFileName(
                  {
                    name: c.name,
                    skills: c.skills ?? [],
                    technologies: c.technologies ?? [],
                    experienceLabel: c.experienceLabel,
                    totalExperience: c.totalExperience ?? null,
                  },
                  `.${ext}`,
                );
                a.click();
                URL.revokeObjectURL(a.href);
              } catch {
                notify.error('Could not download resume.');
              }
            }}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-gray-200 py-1.5 text-[11px] font-semibold text-gray-800 hover:bg-gray-50',
              !c.resumeUrl?.trim() && 'cursor-not-allowed opacity-40',
            )}
          >
            <FileText className="h-3 w-3" />
            Resume
          </button>
          <button
            type="button"
            onClick={stopPropagation(() => onOpenDetails?.(submission.id))}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-gray-200 py-1.5 text-[11px] font-semibold text-gray-800 hover:bg-gray-50"
          >
            <Star className="h-3 w-3" />
            Open
          </button>
        </div>
      )}
    </div>
  );
}
