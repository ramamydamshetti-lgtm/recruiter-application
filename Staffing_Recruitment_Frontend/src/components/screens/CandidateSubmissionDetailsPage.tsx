'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { PageBackNav } from '@/components/ui/PageBackNav';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/requirements/StatusBadge';
import { getCandidate } from '@/lib/api/candidates';
import { getSubmissions, getSubmissionStatusHistory, type StatusHistoryRow } from '@/lib/api/submissions';
import { requirementDetailHref } from '@/lib/domain/requirements/logic';
import type { Candidate } from '@/lib/domain/candidates/types';
import type { Submission } from '@/lib/domain/submissions/types';
import { displayCandidateTotalExperience } from '@/lib/utils/candidateExperienceInput';

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function leadDisplay(s: Submission): string {
  return s.assignedLead?.name || s.assignedLeadName || '—';
}

function StatusHistoryList({ rows, loading }: { rows: StatusHistoryRow[]; loading: boolean }) {
  if (loading) {
    return <p className="px-4 py-3 text-sm text-gray-500 dark:text-zinc-400">Loading status history…</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-gray-500 dark:text-zinc-400">
        No status changes recorded for this submission.
      </p>
    );
  }
  return (
    <ol className="relative ml-6 space-y-2 border-l border-gray-200 py-3 pl-5 dark:border-zinc-700">
      {rows.map((r) => (
        <li key={r.id} className="relative text-sm">
          <span className="absolute -left-[27px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-blue-600 bg-white dark:bg-zinc-950" />
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-gray-900 dark:text-zinc-100">
                {r.oldStatus ?? '—'} → {r.newStatus}
              </span>
              <span className="text-xs text-gray-500 tabular-nums dark:text-zinc-400">
                {fmtDateTime(r.createdAt)}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-gray-500 dark:text-zinc-400">
              {r.changedBy?.name ?? 'System'}
              {r.reason ? ` · ${r.reason}` : ''}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function CandidateSubmissionDetailsPage({ candidateId }: { candidateId: string }) {
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyBySubmissionId, setHistoryBySubmissionId] = useState<
    Record<string, { loading: boolean; rows: StatusHistoryRow[] }>
  >({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [c, allSubs] = await Promise.all([
        getCandidate(candidateId),
        getSubmissions({ scope: 'team', limit: 500 }),
      ]);
      const candidateSubs = allSubs
        .filter((s) => s.candidate?.id === candidateId)
        .sort((a, b) => new Date(b.submittedOn).getTime() - new Date(a.submittedOn).getTime());
      setCandidate(c);
      setSubmissions(candidateSubs);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load candidate submissions');
      setCandidate(null);
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleHistory = useCallback(
    async (submissionId: string) => {
      if (expandedId === submissionId) {
        setExpandedId(null);
        return;
      }
      setExpandedId(submissionId);
      if (historyBySubmissionId[submissionId]) return;

      setHistoryBySubmissionId((prev) => ({
        ...prev,
        [submissionId]: { loading: true, rows: [] },
      }));
      try {
        const rows = await getSubmissionStatusHistory(submissionId);
        setHistoryBySubmissionId((prev) => ({
          ...prev,
          [submissionId]: { loading: false, rows },
        }));
      } catch {
        setHistoryBySubmissionId((prev) => ({
          ...prev,
          [submissionId]: { loading: false, rows: [] },
        }));
      }
    },
    [expandedId, historyBySubmissionId],
  );

  const requirementCount = submissions.length;

  const aggregatedHistory = useMemo(() => {
    const events: Array<{
      id: string;
      submissionId: string;
      requirementTitle: string;
      oldStatus: string | null;
      newStatus: string;
      createdAt: string;
      changedBy: string;
    }> = [];
    for (const sub of submissions) {
      const hist = historyBySubmissionId[sub.id]?.rows ?? [];
      for (const row of hist) {
        events.push({
          id: row.id,
          submissionId: sub.id,
          requirementTitle: sub.requirement.roleTitle,
          oldStatus: row.oldStatus,
          newStatus: row.newStatus,
          createdAt: row.createdAt,
          changedBy: row.changedBy?.name ?? 'System',
        });
      }
    }
    return events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [submissions, historyBySubmissionId]);

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

  if (loading || !candidate) {
    return (
      <div className="p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Loading candidate submission details…
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div>
        <PageBackNav />
        <PageHeader
          title={candidate.name}
          subtitle={`Submitted to ${requirementCount} requirement${requirementCount === 1 ? '' : 's'}`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-zinc-400">
            Total requirements
          </div>
          <div className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums dark:text-zinc-50">
            {requirementCount}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-zinc-400">
            Experience
          </div>
          <div className="mt-1 text-sm font-medium text-gray-900 dark:text-zinc-50">
            {displayCandidateTotalExperience({
              totalExperience: candidate.totalExperience,
              experienceLabel: candidate.experienceLabel,
            })}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-zinc-400">
            Current company
          </div>
          <div className="mt-1 text-sm font-medium text-gray-900 dark:text-zinc-50">
            {candidate.currentEmployer || '—'}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-zinc-400">
            Location
          </div>
          <div className="mt-1 text-sm font-medium text-gray-900 dark:text-zinc-50">
            {candidate.currentLocation || candidate.location || '—'}
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-zinc-50">Candidate details</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-zinc-400">
              Profile summary for this candidate across all submissions.
            </p>
          </div>
          <Link
            href={`/candidates/${encodeURIComponent(candidate.id)}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Full profile
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-xs text-gray-500 dark:text-zinc-400">Email</dt>
            <dd className="mt-0.5 text-sm font-medium text-gray-900 dark:text-zinc-50">{candidate.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500 dark:text-zinc-400">Phone</dt>
            <dd className="mt-0.5 text-sm font-medium text-gray-900 dark:text-zinc-50">
              {candidate.phone?.trim() || '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500 dark:text-zinc-400">Candidate ID</dt>
            <dd className="mt-0.5 font-mono text-xs text-gray-700 dark:text-zinc-300">
              {candidate.candidateRef || candidate.id}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="border-b border-gray-100 px-6 py-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-zinc-50">
            Requirements &amp; submission status
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-zinc-400">
            All requirements this candidate has been submitted to, with recruiter, lead, and current status.
          </p>
        </div>
        {submissions.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-gray-500 dark:text-zinc-400">
            No submissions found for this candidate.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600 dark:bg-zinc-900 dark:text-zinc-300">
                <tr>
                  <th className="w-8 px-4 py-3" aria-label="Expand" />
                  <th className="px-4 py-3">Requirement</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Recruiter</th>
                  <th className="px-4 py-3">Lead</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Submitted on</th>
                  <th className="px-4 py-3">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                {submissions.map((s) => {
                  const expanded = expandedId === s.id;
                  const hist = historyBySubmissionId[s.id];
                  return (
                    <React.Fragment key={s.id}>
                      <tr className="hover:bg-gray-50/70 dark:hover:bg-zinc-900/50">
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => void toggleHistory(s.id)}
                            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                            aria-expanded={expanded}
                            aria-label={expanded ? 'Collapse status history' : 'Expand status history'}
                          >
                            {expanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={requirementDetailHref(s.requirement)}
                            className="font-medium text-gray-900 hover:text-blue-600 hover:underline dark:text-zinc-50 dark:hover:text-blue-400"
                          >
                            {s.requirement.roleTitle}
                          </Link>
                          <div className="mt-0.5 text-xs text-gray-500 dark:text-zinc-400">
                            {s.requirement.requirementId ?? s.requirement.id}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-zinc-300">
                          {s.requirement.clientName || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-zinc-300">
                          {s.submittedBy?.name || s.submittedBy?.email || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-zinc-300">{leadDisplay(s)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={s.status} />
                        </td>
                        <td className="px-4 py-3 tabular-nums text-gray-700 dark:text-zinc-300">
                          {fmtDate(s.submittedOn)}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/submissions?submissionId=${encodeURIComponent(s.id)}`}
                            className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                          >
                            Details
                          </Link>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr>
                          <td colSpan={8} className="bg-gray-50/50 dark:bg-zinc-900/30">
                            <div className="px-4 pb-2">
                              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                                Status history — {s.requirement.roleTitle}
                              </div>
                              {s.forwardedBy ? (
                                <p className="mt-1 text-xs text-gray-600 dark:text-zinc-400">
                                  Forwarded to client by {s.forwardedBy.name}
                                  {s.forwardedOn ? ` on ${fmtDateTime(s.forwardedOn)}` : ''}
                                </p>
                              ) : null}
                            </div>
                            <StatusHistoryList
                              rows={hist?.rows ?? []}
                              loading={hist?.loading ?? true}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {aggregatedHistory.length > 0 ? (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-zinc-50">Submission history</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-zinc-400">
            Combined status changes across all requirements (expand rows above to load per-submission history).
          </p>
          <ol className="relative ml-3 mt-4 space-y-3 border-l border-gray-200 pl-5 dark:border-zinc-700">
            {aggregatedHistory.slice(0, 20).map((ev) => (
              <li key={ev.id} className="relative text-sm">
                <span className="absolute -left-[27px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-emerald-600 bg-white dark:bg-zinc-950" />
                <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-gray-900 dark:text-zinc-100">
                      {ev.oldStatus ?? '—'} → {ev.newStatus}
                    </span>
                    <span className="text-xs text-gray-500 tabular-nums dark:text-zinc-400">
                      {fmtDateTime(ev.createdAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500 dark:text-zinc-400">
                    {ev.requirementTitle} · {ev.changedBy}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
