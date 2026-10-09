'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterBar } from '@/components/ui/FilterBar';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/requirements/StatusBadge';
import { CandidateDetailsDrawer } from '@/components/requirementOverview/CandidateDetailsDrawer';
import { requirementDetailHref } from '@/lib/domain/requirements/logic';
import { SUBMISSION_CLIENTS } from '@/lib/domain/submissions/constants';
import { submissionMatchesClientQuery } from '@/lib/navigation/clientReportDrillDown';
import { getSubmissions } from '@/lib/api/submissions';
import { getInterviews, type InterviewRecord } from '@/lib/api/interviews';
import { getOfferLetterBySubmission, type OfferLetterRecord } from '@/lib/api/offerLetters';
import type { Submission, SubmissionStatus } from '@/lib/domain/submissions/types';
import {
  resolveSubmissionDateRange,
  submissionDateInRange,
  SUBMISSION_DATE_PRESET_OPTIONS,
  type SubmissionDatePreset,
} from '@/lib/utils/submissionDatePresets';

type StatusFilter = 'All' | SubmissionStatus;

const SUBMISSIONS_PAGE_SIZE = 15;

const statusOptions: StatusFilter[] = [
  'All',
  'Submitted to Lead',
  'Submitted to Client',
  'Submitted',
  'Interview',
  'Selected',
  'Rejected',
];

const CLIENT_FILTER_OPTIONS = [
  { value: '', label: 'All clients' },
  ...SUBMISSION_CLIENTS.map((c) => ({ value: c.value, label: c.label })),
] as const;

function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  });
}

function clientNameMatches(requirementClientName: string, selectedValue: string): boolean {
  if (!selectedValue) return true;
  const normalized = requirementClientName.toLowerCase().replace(/\s+/g, '');
  const label = CLIENT_FILTER_OPTIONS.find((c) => c.value === selectedValue)?.label ?? '';
  const labelNorm = label.toLowerCase().replace(/\s+/g, '').replace(/\(internal\)/g, '');
  return normalized.includes(labelNorm) || labelNorm.includes(normalized);
}

export function AllSubmissionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { recruiters } = useAuth();
  const submittedByFilter = (searchParams.get('submittedById') ?? '').trim();
  const clientFromQuery = (searchParams.get('client') ?? '').trim();
  const interviewsOnly = (searchParams.get('interviews') ?? '').trim() === '1';
  const statusFromQuery = (searchParams.get('status') ?? '').trim() as StatusFilter;
  const submissionIdFromQuery = (searchParams.get('submissionId') ?? '').trim();
  const decodedClientFilter = clientFromQuery ? decodeURIComponent(clientFromQuery) : '';
  const filteredRecruiter = recruiters.find((r) => r.id === submittedByFilter);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>(
    statusOptions.includes(statusFromQuery) ? statusFromQuery : 'All',
  );
  const [clientFilter, setClientFilter] = useState<string>('');
  const [datePreset, setDatePreset] = useState<SubmissionDatePreset>('');
  const [customDateStart, setCustomDateStart] = useState('');
  const [customDateEnd, setCustomDateEnd] = useState('');
  const [detailSubmission, setDetailSubmission] = useState<Submission | null>(null);
  const [detailInterviews, setDetailInterviews] = useState<InterviewRecord[]>([]);
  const [detailOffer, setDetailOffer] = useState<OfferLetterRecord | null>(null);
  const autoOpenedSubmissionIdRef = useRef<string | null>(null);

  useEffect(() => {
    setStatus(statusOptions.includes(statusFromQuery) ? statusFromQuery : 'All');
  }, [statusFromQuery]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSubmissionsLoading(true);
      try {
        const rows = await getSubmissions({ scope: 'team', limit: 500 });
        if (!cancelled) setSubmissions(rows);
      } catch (e) {
        console.error('Failed to load team submissions', e);
        if (!cancelled) setSubmissions([]);
      } finally {
        if (!cancelled) setSubmissionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submissionDateRange = useMemo(
    () => resolveSubmissionDateRange(datePreset, customDateStart, customDateEnd),
    [datePreset, customDateStart, customDateEnd],
  );

  const rows = useMemo(() => {
    const recruiterFilter = (searchParams.get('submittedById') ?? '').trim();
    const q = query.trim().toLowerCase();
    return submissions
      .filter((s) => {
        const matchesQ =
          !q ||
          s.candidate.name.toLowerCase().includes(q) ||
          (s.candidate.currentCompany ?? '').toLowerCase().includes(q);
        const matchesInterview = interviewsOnly
          ? s.status === 'Interview' ||
            s.status === 'Selected' ||
            (s.status === 'Rejected' && Boolean(s.interviewDate))
          : true;
        const matchesStatus = status === 'All' ? true : s.status === status;
        const matchesClient =
          clientNameMatches(s.requirement.clientName, clientFilter) &&
          submissionMatchesClientQuery(s, decodedClientFilter);
        const matchesRecruiter = !recruiterFilter || s.submittedBy.id === recruiterFilter;
        const matchesDate = submissionDateInRange(s.submittedOn, submissionDateRange);
        return matchesQ && matchesInterview && matchesStatus && matchesClient && matchesRecruiter && matchesDate;
      })
      .sort((a, b) => new Date(b.submittedOn).getTime() - new Date(a.submittedOn).getTime());
  }, [
    submissions,
    query,
    interviewsOnly,
    status,
    clientFilter,
    decodedClientFilter,
    searchParams,
    submissionDateRange,
  ]);

  const openSubmissionDetail = useCallback(
    (submission: Submission) => {
      setDetailSubmission(submission);
      const params = new URLSearchParams(searchParams.toString());
      params.set('submissionId', submission.id);
      router.replace(`/submissions?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const closeSubmissionDetail = useCallback(() => {
    setDetailSubmission(null);
    setDetailInterviews([]);
    setDetailOffer(null);
    autoOpenedSubmissionIdRef.current = null;
    const params = new URLSearchParams(searchParams.toString());
    params.delete('submissionId');
    const next = params.toString();
    router.replace(next ? `/submissions?${next}` : '/submissions', { scroll: false });
  }, [router, searchParams]);

  useEffect(() => {
    if (!submissionIdFromQuery || submissionsLoading) return;
    if (autoOpenedSubmissionIdRef.current === submissionIdFromQuery && detailSubmission?.id === submissionIdFromQuery) {
      return;
    }
    const target = submissions.find((s) => s.id === submissionIdFromQuery);
    if (!target) return;
    autoOpenedSubmissionIdRef.current = submissionIdFromQuery;
    setDetailSubmission(target);
  }, [submissionIdFromQuery, submissions, submissionsLoading, detailSubmission?.id]);

  useEffect(() => {
    if (!detailSubmission?.id) {
      setDetailInterviews([]);
      setDetailOffer(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [interviews, offer] = await Promise.all([
          getInterviews({ submissionId: detailSubmission.id, limit: 100 }),
          getOfferLetterBySubmission(detailSubmission.id).catch(() => null),
        ]);
        if (!cancelled) {
          setDetailInterviews(interviews);
          setDetailOffer(offer);
        }
      } catch {
        if (!cancelled) {
          setDetailInterviews([]);
          setDetailOffer(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detailSubmission?.id]);

  const columns: Column<Submission>[] = [
    {
      key: 'candidate',
      header: 'Candidate Name',
      cell: (s) => (
        <span className="font-semibold text-gray-900 dark:text-zinc-50">{s.candidate.name}</span>
      ),
    },
    {
      key: 'req',
      header: 'Requirement',
      cell: (s) => (
        <Link
          href={requirementDetailHref(s.requirement)}
          onClick={(e) => e.stopPropagation()}
          className="text-gray-900 hover:text-blue-600 hover:underline dark:text-zinc-50 dark:hover:text-blue-500"
        >
          {s.requirement.roleTitle}
        </Link>
      ),
    },
    {
      key: 'exp',
      header: 'Experience',
      cell: (s) => (
        <span className="text-gray-900 dark:text-zinc-50">{s.candidate.experienceLabel}</span>
      ),
    },
    {
      key: 'company',
      header: 'Current Company',
      cell: (s) => (
        <span className="text-gray-900 dark:text-zinc-50">{s.candidate.currentCompany}</span>
      ),
    },
    {
      key: 'by',
      header: 'Submitted By',
      cell: (s) => (
        <span className="text-gray-900 dark:text-zinc-50">{s.submittedBy.name}</span>
      ),
    },
    {
      key: 'date',
      header: 'Submitted On',
      cell: (s) => <span className="tabular-nums">{fmtShort(s.submittedOn)}</span>,
    },
    { key: 'status', header: 'Status', cell: (s) => <StatusBadge status={s.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="All Submissions"
        subtitle={
          interviewsOnly && submittedByFilter
            ? `Interview submissions by ${filteredRecruiter?.name || filteredRecruiter?.email || 'selected recruiter'}`
            : decodedClientFilter
            ? `Submissions for client: ${decodedClientFilter}`
            : submittedByFilter
              ? `Submissions by ${filteredRecruiter?.name || filteredRecruiter?.email || 'selected recruiter'}`
              : 'View and manage all candidate submissions'
        }
      />

      {decodedClientFilter ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-200">
          <span>
            Filtered to submissions for client{' '}
            <span className="font-semibold">{decodedClientFilter}</span>.
          </span>
          <button
            type="button"
            onClick={() => router.replace('/submissions')}
            className="font-medium text-indigo-700 hover:underline dark:text-indigo-300"
          >
            Show all submissions
          </button>
        </div>
      ) : null}

      {submittedByFilter ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-200">
          <span>
            Filtered to submissions by{' '}
            <span className="font-semibold">
              {filteredRecruiter?.name || filteredRecruiter?.email || 'selected recruiter'}
            </span>
            . Each row links to the requirement it was submitted for.
          </span>
          <button
            type="button"
            onClick={() => router.replace('/submissions')}
            className="font-medium text-indigo-700 hover:underline dark:text-indigo-300"
          >
            Show all submissions
          </button>
        </div>
      ) : null}

      {submissionIdFromQuery && detailSubmission ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
          <span>
            Viewing submission for{' '}
            <span className="font-semibold">{detailSubmission.candidate.name}</span>
            {' · '}
            {detailSubmission.requirement.roleTitle}
          </span>
          <button
            type="button"
            onClick={closeSubmissionDetail}
            className="font-medium text-blue-700 hover:underline dark:text-blue-300"
          >
            Close details
          </button>
        </div>
      ) : null}

      {interviewsOnly ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200">
          <span>
            Showing interview scheduled/done submissions. Each row shows the submitted candidate and the requirement.
          </span>
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.delete('interviews');
              router.replace(`/submissions${params.toString() ? `?${params.toString()}` : ''}`);
            }}
            className="font-medium text-emerald-700 hover:underline dark:text-emerald-300"
          >
            Show all submissions
          </button>
        </div>
      ) : null}

      {/* Submitting to client — filter by which client we submitted to */}

      <FilterBar
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search by candidate name or company..."
        right={
          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as SubmissionDatePreset)}
              className="h-11 w-full appearance-none rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm transition outline-none focus:border-gray-400 focus:ring-4 focus:ring-gray-200/60 md:w-[180px] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-600 dark:focus:ring-zinc-800/60"
              aria-label="Date filter"
            >
              {SUBMISSION_DATE_PRESET_OPTIONS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {datePreset === 'custom' ? (
              <>
                <input
                  type="date"
                  value={customDateStart}
                  onChange={(e) => setCustomDateStart(e.target.value)}
                  className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                  aria-label="Custom start date"
                />
                <input
                  type="date"
                  value={customDateEnd}
                  onChange={(e) => setCustomDateEnd(e.target.value)}
                  className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                  aria-label="Custom end date"
                />
              </>
            ) : null}
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className="h-11 w-full appearance-none rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm transition outline-none focus:border-gray-400 focus:ring-4 focus:ring-gray-200/60 md:w-[220px] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-600 dark:focus:ring-zinc-800/60"
              aria-label="Status filter"
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {submissionsLoading && (
        <p className="text-sm text-slate-500 dark:text-zinc-400">Loading submissions…</p>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowsPerPage={SUBMISSIONS_PAGE_SIZE}
        fixedPagination
        getRowKey={(s) => s.id}
        onRowClick={openSubmissionDetail}
        getRowClassName={(s) =>
          detailSubmission?.id === s.id
            ? 'bg-blue-50/80 dark:bg-blue-950/30'
            : undefined
        }
        emptyText={submissionsLoading ? 'Loading…' : 'No submissions match your filters.'}
        mobileCard={(s) => (
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="text-sm font-semibold text-gray-900 dark:text-zinc-50">
                  {s.candidate.name}
                </span>
                <div className="mt-1 text-sm text-gray-600 dark:text-zinc-400">
                  {s.candidate.currentCompany}
                </div>
              </div>
              <div className="shrink-0 text-xs text-gray-500 tabular-nums dark:text-zinc-400">
                {fmtShort(s.submittedOn)}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={s.status} />
              <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-200">
                {s.candidate.experienceLabel}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="col-span-2">
                <div className="text-xs text-gray-500 dark:text-zinc-400">Requirement</div>
                <Link
                  href={requirementDetailHref(s.requirement)}
                  onClick={(e) => e.stopPropagation()}
                  className="font-medium text-gray-900 hover:text-blue-600 hover:underline dark:text-zinc-50 dark:hover:text-blue-500"
                >
                  {s.requirement.roleTitle}
                </Link>
                <div className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                  {s.requirement.clientName} • {s.requirement.requirementId ?? s.requirement.id}
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-gray-500 dark:text-zinc-400">Submitted By</div>
                <span className="font-medium text-gray-900 dark:text-zinc-50">{s.submittedBy.name}</span>
              </div>
            </div>
          </div>
        )}
      />

      <CandidateDetailsDrawer
        open={Boolean(detailSubmission)}
        onClose={closeSubmissionDetail}
        submission={detailSubmission}
        requirementId={detailSubmission?.requirement.id ?? ''}
        interviews={detailInterviews}
        offer={detailOffer}
        actionsEnabled={false}
      />
    </div>
  );
}
