'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, Edit3, Eye, Search } from 'lucide-react';
import type { InterviewRecord } from '@/lib/api/interviews';
import type { Submission, SubmissionStatus } from '@/lib/domain/submissions/types';
import { canActOnSubmission } from '@/lib/domain/submissions/permissions';
import { canScheduleInterviewForStatus, isLeadReviewStatus } from '@/lib/domain/submissions/status';
import { formatDateTime } from '@/lib/utils/dateTime';
import { cn } from '@/lib/utils/cn';

const PAGE_SIZE = 5;

type StatusFilter = 'ALL' | SubmissionStatus;

type Props = {
  submissions: Submission[];
  loading: boolean;
  recruitersWorking: number;
  interviews: InterviewRecord[];
  currentUser: { id?: string; role?: string } | null | undefined;
  sourcingEnabled?: boolean;
  onScheduleInterview: (submissionId: string) => void;
  onRescheduleInterview: (submissionId: string) => void;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
  }
  return (parts[0]?.[0] ?? '?').toUpperCase();
}

function normalizeRoundLabel(raw: string | null | undefined): string {
  const r = String(raw ?? '').trim().toUpperCase();
  if (r === 'L1' || r.startsWith('L1')) return 'L1';
  if (r === 'L2' || r.startsWith('L2')) return 'L2';
  if (r === 'FINAL' || r.startsWith('FINAL')) return 'Final';
  return String(raw ?? '').trim() || 'Interview';
}

function displaySubmissionId(row: Submission): string {
  const ref = row.submissionRef?.trim();
  if (ref) return ref;
  const d = new Date(row.submittedOn);
  if (!Number.isNaN(d.getTime())) {
    return `SUB-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${row.id.slice(-4).toUpperCase()}`;
  }
  return row.id;
}

function deriveDisplayStatus(
  row: Submission,
  latestInterviewBySubmissionId: Map<string, InterviewRecord>,
): string {
  if (row.status === 'Rejected') return 'Rejected';
  const latest = latestInterviewBySubmissionId.get(row.id);
  if (!latest) return row.status;

  const round = normalizeRoundLabel(latest.round);
  const decision = String(latest.finalDecision ?? '').trim().toUpperCase();
  const interviewStatus = String(latest.status ?? '').trim().toUpperCase();

  if (decision === 'SELECTED') return `${round} Selected`;
  if (decision === 'REJECTED') return `${round} Rejected`;
  if (interviewStatus === 'COMPLETED') return `${round} Completed`;
  if (interviewStatus === 'SCHEDULED' || interviewStatus === 'RESCHEDULED') return `${round} Scheduled`;

  return `${round} ${latest.status}`;
}

function statusBadgeClass(status: string): string {
  const lower = status.toLowerCase();
  if (lower.includes('reject')) return 'border-red-200 bg-red-50 text-red-800';
  if (lower.includes('select')) return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (lower.includes('interview') || lower.includes('scheduled') || lower.includes('completed')) {
    return 'border-amber-200 bg-amber-50 text-amber-800';
  }
  if (lower === 'submitted') return 'border-indigo-200 bg-indigo-50 text-indigo-800';
  return 'border-gray-200 bg-gray-100 text-gray-700';
}

function FilterPill({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition',
        active
          ? 'border-blue-200 bg-blue-50 text-blue-800'
          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50',
      )}
    >
      {label}
      <span
        className={cn(
          'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
          active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600',
        )}
      >
        {count}
      </span>
    </button>
  );
}

export function RequirementHistoryPanel({
  submissions,
  loading,
  recruitersWorking,
  interviews,
  currentUser,
  sourcingEnabled = true,
  onScheduleInterview,
  onRescheduleInterview,
}: Props) {
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');

  const latestInterviewBySubmissionId = useMemo(() => {
    const map = new Map<string, InterviewRecord>();
    for (const row of interviews) {
      if (row.status === 'Cancelled') continue;
      const current = map.get(row.submissionId);
      if (!current || new Date(row.scheduledAt).getTime() > new Date(current.scheduledAt).getTime()) {
        map.set(row.submissionId, row);
      }
    }
    return map;
  }, [interviews]);

  const hasInterviewBySubmissionId = useMemo(() => {
    const set = new Set<string>();
    for (const row of interviews) {
      if (row.status !== 'Cancelled') set.add(row.submissionId);
    }
    return set;
  }, [interviews]);

  const statusCounts = useMemo(() => {
    let submittedToLead = 0;
    let submittedToClient = 0;
    let interview = 0;
    let selected = 0;
    let rejected = 0;
    for (const row of submissions) {
      if (isLeadReviewStatus(row.status)) submittedToLead += 1;
      else if (row.status === 'Submitted' || row.status === 'Submitted to Client') submittedToClient += 1;
      else if (row.status === 'Interview') interview += 1;
      else if (row.status === 'Selected') selected += 1;
      else if (row.status === 'Rejected') rejected += 1;
    }
    return {
      submittedToLead,
      submittedToClient,
      interview,
      selected,
      rejected,
      total: submissions.length,
    };
  }, [submissions]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return submissions
      .filter((row) => {
        if (statusFilter !== 'ALL' && row.status !== statusFilter) return false;
        if (!query) return true;
        const haystack = [
          displaySubmissionId(row),
          row.candidate.name,
          row.candidate.email,
          row.submittedBy.name,
          row.submittedBy.email,
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => new Date(b.submittedOn).getTime() - new Date(a.submittedOn).getTime());
  }, [submissions, search, statusFilter]);

  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safePage - 1) * PAGE_SIZE;
  const visibleRows = filteredRows.slice(pageStartIndex, pageStartIndex + PAGE_SIZE);
  const rangeStart = total === 0 ? 0 : pageStartIndex + 1;
  const rangeEnd = pageStartIndex + visibleRows.length;

  const resetPagination = () => setCurrentPage(1);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Recruiters working
          </div>
          <div className="mt-1 text-lg font-bold text-gray-900">{recruitersWorking}</div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Resumes submitted
          </div>
          <div className="mt-1 text-lg font-bold text-gray-900">{statusCounts.total}</div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm sm:col-span-2 lg:col-span-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            By status
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-600">
            <span>Lead review: <strong className="text-gray-900">{statusCounts.submittedToLead}</strong></span>
            <span>Client: <strong className="text-gray-900">{statusCounts.submittedToClient}</strong></span>
            <span>Interview: <strong className="text-gray-900">{statusCounts.interview}</strong></span>
            <span>Selected: <strong className="text-gray-900">{statusCounts.selected}</strong></span>
            <span>Rejected: <strong className="text-gray-900">{statusCounts.rejected}</strong></span>
          </div>
        </div>
      </div>

      {submissions.length > 0 && (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <FilterPill
              active={statusFilter === 'ALL'}
              label="All"
              count={submissions.length}
              onClick={() => {
                setStatusFilter('ALL');
                resetPagination();
              }}
            />
            <FilterPill
              active={statusFilter === 'Submitted to Lead'}
              label="Submitted to Lead"
              count={statusCounts.submittedToLead}
              onClick={() => {
                setStatusFilter('Submitted to Lead');
                resetPagination();
              }}
            />
            <FilterPill
              active={statusFilter === 'Submitted to Client'}
              label="Submitted to Client"
              count={statusCounts.submittedToClient}
              onClick={() => {
                setStatusFilter('Submitted to Client');
                resetPagination();
              }}
            />
            <FilterPill
              active={statusFilter === 'Interview'}
              label="Interview"
              count={statusCounts.interview}
              onClick={() => {
                setStatusFilter('Interview');
                resetPagination();
              }}
            />
            <FilterPill
              active={statusFilter === 'Selected'}
              label="Selected"
              count={statusCounts.selected}
              onClick={() => {
                setStatusFilter('Selected');
                resetPagination();
              }}
            />
            <FilterPill
              active={statusFilter === 'Rejected'}
              label="Rejected"
              count={statusCounts.rejected}
              onClick={() => {
                setStatusFilter('Rejected');
                resetPagination();
              }}
            />
          </div>
          <label className="relative w-full lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPagination();
              }}
              placeholder="Search candidate or submitter…"
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>
        </div>
      )}

      {submissions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center">
          <p className="text-sm font-medium text-gray-700">No candidate submissions yet</p>
          <p className="mt-1 text-xs text-gray-500">
            Submissions from all recruiters on this requirement will appear here.
          </p>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-8 text-center text-sm text-gray-500">
          No submissions match your search or filter.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/80 px-4 py-2.5">
            <p className="text-xs font-medium text-gray-600">
              {rangeStart}–{rangeEnd} of {total} submission{total === 1 ? '' : 's'}
            </p>
            {total > PAGE_SIZE && (
              <span className="text-[11px] text-gray-400">
                Page {safePage} of {totalPages} · {PAGE_SIZE} per page
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-100 bg-white">
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Submission</th>
                  <th className="px-4 py-3">Candidate</th>
                  <th className="px-4 py-3">Submitted by</th>
                  <th className="px-4 py-3">Submitted on</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleRows.map((row) => {
                  const displayStatus = deriveDisplayStatus(row, latestInterviewBySubmissionId);
                  const canAct = sourcingEnabled && canActOnSubmission(row, currentUser);
                  return (
                    <tr key={row.id} className="transition hover:bg-blue-50/30">
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-md border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-[11px] font-medium text-gray-700">
                          {displaySubmissionId(row)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                            {initials(row.candidate.name)}
                          </span>
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900">{row.candidate.name}</div>
                            <div className="truncate text-xs text-gray-500">{row.candidate.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{row.submittedBy.name || 'Unknown'}</div>
                        <div className="truncate text-xs text-gray-500">{row.submittedBy.email || '—'}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600">
                        {formatDateTime(row.submittedOn)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
                            statusBadgeClass(displayStatus),
                          )}
                        >
                          {displayStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {!canAct ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-500">
                              <Eye className="h-3 w-3" />
                              View only
                            </span>
                          ) : canScheduleInterviewForStatus(row.status) ? (
                            <>
                              <button
                                type="button"
                                title="Schedule interview"
                                aria-label={`Schedule interview for ${row.candidate.name}`}
                                onClick={() => onScheduleInterview(row.id)}
                                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-800 shadow-sm transition hover:bg-blue-100"
                              >
                                <CalendarPlus className="h-3.5 w-3.5" />
                                Schedule
                              </button>
                              <button
                                type="button"
                                title={
                                  hasInterviewBySubmissionId.has(row.id)
                                    ? 'Edit / reschedule interview'
                                    : 'No interview scheduled yet'
                                }
                                aria-label={`Edit interview for ${row.candidate.name}`}
                                disabled={!hasInterviewBySubmissionId.has(row.id)}
                                onClick={() => onRescheduleInterview(row.id)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {total > PAGE_SIZE && (
            <div className="flex flex-col gap-3 border-t border-gray-100 bg-gray-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-gray-500">
                Showing submissions {rangeStart}–{rangeEnd} on page {safePage}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={safePage <= 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Previous
                </button>
                {totalPages <= 7 ? (
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        className={cn(
                          'min-w-[2rem] rounded-lg border px-2 py-1.5 text-xs font-semibold transition',
                          page === safePage
                            ? 'border-blue-200 bg-blue-50 text-blue-800'
                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100',
                        )}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="px-2 text-xs font-semibold text-gray-700">
                    Page {safePage} of {totalPages}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={safePage >= totalPages}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
