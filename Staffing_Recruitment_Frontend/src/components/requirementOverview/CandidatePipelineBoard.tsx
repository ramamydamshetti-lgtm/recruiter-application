'use client';

import React, { useMemo } from 'react';
import { Users } from 'lucide-react';
import type { Submission } from '@/lib/domain/submissions/types';
import type { Requirement } from '@/lib/domain/requirements/types';
import type { InterviewRecord } from '@/lib/api/interviews';
import type { OfferLetterRecord, OfferLetterStatus } from '@/lib/api/offerLetters';
import { inferPipelineColumn, latestInterviewForSubmission } from '@/lib/requirementOverview/pipelineMapping';
import { StatusBadge } from '@/components/requirements/StatusBadge';
import type { SubmissionStatus } from '@/lib/domain/submissions/types';
import { submissionStageFromStatus } from '@/lib/domain/submissions/status';
import { formatDateTime } from '@/lib/utils/dateTime';

type Props = {
  requirement: Requirement;
  submissions: (Submission & { emailSent?: boolean })[];
  interviews: InterviewRecord[];
  offersBySubmissionId: Record<string, OfferLetterRecord | undefined>;
  canActOnSubmission?: (submission: Submission) => boolean;
  onCardAction?: (action: string, submissionId: string) => void;
  onOpenDetails?: (submissionId: string) => void;
  onSubmitSelected?: (submissionIds: string[]) => void;
  /** When true, show Forward & Submit on submitted-to-lead rows (lead role). */
  canForwardToClient?: boolean;
};

export function CandidatePipelineBoard({
  requirement: _requirement,
  submissions,
  interviews,
  offersBySubmissionId,
  canActOnSubmission: canActOnSubmissionProp,
  onCardAction,
  onOpenDetails,
  onSubmitSelected: _onSubmitSelected,
  canForwardToClient = false,
}: Props) {
  const normalizeRound = (raw: string): 'L1' | 'L2' | 'Final' | null => {
    const r = raw.trim().toUpperCase();
    if (r === 'L1' || r.startsWith('L1')) return 'L1';
    if (r === 'L2' || r.startsWith('L2')) return 'L2';
    if (r === 'FINAL' || r.startsWith('FINAL')) return 'Final';
    return null;
  };

  const latestInterviewForSubmissionRound = (submissionId: string, round: 'L1' | 'L2' | 'Final') => {
    const rows = interviews
      .filter((i) => i.submissionId === submissionId && i.status !== 'Cancelled')
      .filter((i) => normalizeRound(i.round) === round)
      .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
    return rows[0] ?? null;
  };

  const formatRoundCell = (row: InterviewRecord | null, round: 'L1' | 'L2' | 'Final') => {
    if (!row) return '—';
    const decision = String(row.finalDecision ?? '').trim().toUpperCase();
    if (decision === 'SELECTED') return `${round} Selected`;
    if (decision === 'REJECTED') return `${round} Rejected`;
    return `${round} ${row.status}`;
  };

  const formatOfferCell = (offer: OfferLetterRecord | undefined, finalInterview: InterviewRecord | null): string => {
    if (offer?.status === 'RELEASED' || offer?.status === 'ACCEPTED' || offer?.status === 'DECLINED') return 'Released';
    const decision = String(finalInterview?.finalDecision ?? '').trim().toUpperCase();
    if (decision === 'SELECTED') return 'Ready to release';
    return '—';
  };

  const tableRows = useMemo(
    () =>
      submissions
        .map((sub) => {
          const l1 = latestInterviewForSubmissionRound(sub.id, 'L1');
          const l2 = latestInterviewForSubmissionRound(sub.id, 'L2');
          const final = latestInterviewForSubmissionRound(sub.id, 'Final');
          const latest = latestInterviewForSubmission(sub.id, interviews);
          const currentColumn = inferPipelineColumn(sub, interviews, offersBySubmissionId);
          const offer = offersBySubmissionId[sub.id];
          return { sub, l1, l2, final, latest, currentColumn, offer };
        })
        .sort((a, b) => new Date(b.sub.submittedOn).getTime() - new Date(a.sub.submittedOn).getTime()),
    [submissions, interviews, offersBySubmissionId],
  );

  const actionDefsForRow = (
    currentColumn: string,
    latestInterview: InterviewRecord | null,
    offerStatus?: OfferLetterStatus,
  ): { key: string; label: string; tone: 'primary' | 'success' | 'danger' | 'neutral' }[] => {
    const decision = String(latestInterview?.finalDecision ?? '').trim().toUpperCase();
    const isSelected = decision === 'SELECTED';
    const isRejected = decision === 'REJECTED';
    const latestRound = normalizeRound(String(latestInterview?.round ?? ''));
    const isOfferReleased = offerStatus === 'RELEASED' || offerStatus === 'ACCEPTED' || offerStatus === 'DECLINED';

    // Global guard: whenever Final is selected, always expose offer action in Actions.
    // This avoids missing action labels when row stage mapping resolves to a hidden lane.
    if (latestRound === 'Final' && isSelected) {
      return [
        { key: 'offer', label: isOfferReleased ? 'Edit Offer Letter' : 'Release Offer Letter', tone: 'primary' },
        ...(isOfferReleased ? [{ key: 'candidate_response', label: 'Candidate Response', tone: 'neutral' as const }] : []),
      ];
    }

    if (currentColumn === 'submitted_to_lead') {
      return canForwardToClient
        ? [{ key: 'forward_client', label: 'Forward & Submit to Client', tone: 'primary' }]
        : [];
    }
    if (currentColumn === 'submitted_to_client') {
      return [{ key: 'schedule', label: 'Schedule Interview', tone: 'primary' }];
    }
    if (currentColumn === 'l1') {
      if (isRejected) return [];
      if (isSelected) {
        return [{ key: 'next_round_l2', label: 'Schedule Next Interview', tone: 'primary' }];
      }
      return [
        { key: 'round_selected', label: 'Selected', tone: 'success' },
        { key: 'rejected', label: 'Reject', tone: 'danger' },
      ];
    }
    if (currentColumn === 'l2') {
      if (isRejected) return [];
      if (isSelected) {
        return [{ key: 'next_round_final', label: 'Schedule Next Interview', tone: 'primary' }];
      }
      return [
        { key: 'round_selected', label: 'Selected', tone: 'success' },
        { key: 'rejected', label: 'Reject', tone: 'danger' },
      ];
    }
    if (currentColumn === 'final') {
      if (isRejected) return [];
      if (isSelected) {
        if (isOfferReleased) {
          return [
            { key: 'offer', label: 'Edit Offer Letter', tone: 'primary' },
            { key: 'candidate_response', label: 'Candidate Response', tone: 'neutral' },
          ];
        }
        return [{ key: 'offer', label: 'Release Offer Letter', tone: 'primary' }];
      }
      return [
        { key: 'round_selected', label: 'Selected', tone: 'success' },
        { key: 'rejected', label: 'Reject', tone: 'danger' },
      ];
    }
    if (currentColumn === 'offered') return [{ key: 'candidate_response', label: 'Candidate Response', tone: 'primary' }];
    return [];
  };

  const buttonTone = (tone: 'primary' | 'success' | 'danger' | 'neutral') => {
    if (tone === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100';
    if (tone === 'danger') return 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100';
    if (tone === 'primary') return 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100';
    return 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50';
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Candidate Pipeline</h2>
          <p className="mt-1 text-xs text-gray-500">Table view for high-volume tracking across all stages.</p>
        </div>
          <div className="hidden sm:block">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              <Users className="h-3.5 w-3.5" />
              {submissions.length} candidates
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto px-4 py-4">
        <table className="min-w-[1280px] w-full text-left text-sm">
          <thead>
            <tr className="border-y border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-600">
              <th className="px-4 py-2.5">Candidate</th>
              <th className="px-4 py-2.5">Experience</th>
              <th className="px-4 py-2.5">Company</th>
              <th className="px-4 py-2.5">Notice</th>
              <th className="px-4 py-2.5">Submission Status</th>
              <th className="px-4 py-2.5">L1</th>
              <th className="px-4 py-2.5">L2</th>
              <th className="px-4 py-2.5">Final</th>
              <th className="px-4 py-2.5">Offer Letter</th>
              <th className="px-4 py-2.5">Last Activity</th>
              <th className="px-4 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tableRows.length === 0 ? (
              <tr>
                <td className="px-3 py-10 text-center" colSpan={11}>
                  <div className="mx-auto max-w-md rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8">
                    <div className="text-sm font-semibold text-gray-700">No candidates in pipeline yet</div>
                    <p className="mt-1 text-xs text-gray-500">
                      Submit candidates to the client to start tracking interview progression here.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              tableRows.map(({ sub, l1, l2, final, latest, currentColumn, offer }) => {
                const rowActions = canActOnSubmissionProp?.(sub)
                  ? actionDefsForRow(currentColumn, latest, offer?.status)
                  : [];
                const submissionStage = submissionStageFromStatus(sub.status);
                const submissionStatusLabel =
                  submissionStage === 'lead'
                    ? 'Submitted to Lead'
                    : submissionStage === 'client'
                      ? sub.status === 'Interview' ||
                          sub.status === 'Selected' ||
                          sub.status === 'Rejected'
                        ? sub.status
                        : 'Submitted to Client'
                      : null;
                return (
                  <tr key={sub.id} className="align-top hover:bg-blue-50/30">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{sub.candidate.name}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{sub.candidate.experienceLabel || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{sub.candidate.currentCompany || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{sub.candidate.noticePeriod || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {submissionStatusLabel ? (
                        <StatusBadge status={submissionStatusLabel as SubmissionStatus} />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{formatRoundCell(l1, 'L1')}</td>
                    <td className="px-4 py-3 text-gray-700">{formatRoundCell(l2, 'L2')}</td>
                    <td className="px-4 py-3 text-gray-700">{formatRoundCell(final, 'Final')}</td>
                    <td className="px-4 py-3 text-gray-700">{formatOfferCell(offer, final)}</td>
                    <td className="px-4 py-3 text-gray-700">{formatDateTime(sub.submittedOn)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {rowActions.length > 0 ? (
                          rowActions.map((a) => (
                            <button
                              key={a.key}
                              type="button"
                              onClick={() => onCardAction?.(a.key, sub.id)}
                              className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${buttonTone(a.tone)}`}
                            >
                              {a.label}
                            </button>
                          ))
                        ) : canActOnSubmissionProp && !canActOnSubmissionProp(sub) ? (
                          <span className="text-xs text-gray-400">View only</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
