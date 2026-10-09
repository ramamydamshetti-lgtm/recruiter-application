'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/requirements/StatusBadge';
import { useCandidatesStore } from '@/lib/domain/candidates/store';
import type { CandidateStatus } from '@/lib/domain/candidates/types';
import { getPublicApiBase } from '@/lib/publicOrigin';
import { notify } from '@/lib/notify';
import { buildResumeDownloadFileName, type ResumeFileNameInput } from '@/lib/utils/resumeFileName';

function rowToCandidate(row: CandidateRow): ResumeFileNameInput {
  return {
    name: row.name,
    skills: row.resumeSkills ?? [],
    technologies: row.resumeTechnologies ?? [],
    experienceLabel: row.resumeExperienceLabel,
    totalExperience: row.resumeTotalExperience ?? null,
  };
}

async function openCandidateResume(row: CandidateRow, download: boolean) {
  const candidate = rowToCandidate(row);
  const token = localStorage.getItem('token');
  if (!token) {
    notify.warning('Please sign in again.');
    return;
  }
  try {
    const res = await fetch(`${getPublicApiBase()}/api/candidates/${encodeURIComponent(row.candidateId)}/resume`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message || res.statusText);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (download) {
      const cd = res.headers.get('content-disposition') ?? '';
      const fileNameMatch = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(cd);
      const fromHeader = fileNameMatch?.[1]
        ? decodeURIComponent(fileNameMatch[1].replace(/"/g, '').trim())
        : '';
      const ext = fromHeader.match(/\.(pdf|doc|docx)$/i)?.[0] ?? '.pdf';
      const a = document.createElement('a');
      a.href = url;
      a.download = fromHeader || buildResumeDownloadFileName(candidate, ext);
      a.click();
      URL.revokeObjectURL(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  } catch (e) {
    notify.error(e instanceof Error ? e.message : 'Could not load resume');
  }
}

type CandidateRow = {
  candidateId: string;
  name: string;
  email: string;
  company?: string;
  resumeRef?: string;
  resumeSkills?: string[];
  resumeTechnologies?: string[];
  resumeExperienceLabel?: string;
  resumeTotalExperience?: number | null;
  /** Internal requirement id (cuid) for URLs */
  requirementInternalId: string;
  /** Shown in table: REQ-… from API, else job title, else — */
  jobDemandCode: string;
  jobTitle?: string;
  clientName: string;
  recruiterName: string;
  submissionDate: string;
  status: CandidateStatus;
};

function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  });
}

export function CandidateTable({
  rows,
  title,
  subtitle,
}: {
  rows: CandidateRow[];
  title?: string;
  subtitle?: string;
}) {
  const columns: Column<CandidateRow>[] = useMemo(
    () => [
      {
        key: 'cand',
        header: 'Candidate',
        cell: (r) => (
          <div>
            <Link
              href={`/candidates/${encodeURIComponent(r.candidateId)}`}
              className="font-semibold text-gray-900 hover:underline dark:text-zinc-50"
              title="View and edit candidate profile"
            >
              {r.name}
            </Link>
            <div className="mt-1 text-xs text-gray-500 dark:text-zinc-400">{r.company ?? '—'}</div>
          </div>
        ),
      },
      {
        key: 'resume',
        header: 'Resume',
        cell: (r) => (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={!r.resumeRef?.trim()}
              onClick={() => void openCandidateResume(r, false)}
              className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
            >
              View
            </button>
            <button
              type="button"
              disabled={!r.resumeRef?.trim()}
              onClick={() => void openCandidateResume(r, true)}
              className="h-9 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Download
            </button>
          </div>
        ),
      },
      {
        key: 'jd',
        header: 'Requirement ID',
        cell: (r) => (
          <div className="max-w-[220px]">
            <Link
              href={`/requirements/${encodeURIComponent(r.requirementInternalId)}`}
              className="font-mono text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400"
              title={`Requirement · internal ref ${r.requirementInternalId}`}
            >
              {r.jobDemandCode}
            </Link>
            {/^REQ-/i.test(r.jobDemandCode.trim()) && r.jobTitle ? (
              <div className="mt-0.5 line-clamp-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                {r.jobTitle}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        key: 'edit',
        header: 'Edit',
        cell: (r) => (
          <Link
            href={`/candidates/${encodeURIComponent(r.candidateId)}`}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 sm:text-sm"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Edit
          </Link>
        ),
      },
      {
        key: 'client',
        header: 'Client Name',
        cell: (r) => <span className="text-gray-900 dark:text-zinc-50">{r.clientName}</span>,
      },
      {
        key: 'recruiter',
        header: 'Recruiter',
        cell: (r) => <span className="text-gray-900 dark:text-zinc-50">{r.recruiterName}</span>,
      },
      {
        key: 'date',
        header: 'Submission Date',
        cell: (r) => <span className="tabular-nums">{fmtShort(r.submissionDate)}</span>,
      },
      { key: 'status', header: 'Current Status', cell: (r) => <StatusBadge status={r.status} /> },
    ],
    [],
  );

  return (
    <DataTable
      title={title}
      subtitle={subtitle}
      columns={columns}
      rows={rows}
      mobileCard={(r) => (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={`/candidates/${encodeURIComponent(r.candidateId)}`}
                className="text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400"
              >
                {r.name}
              </Link>
              <div className="mt-1 text-sm text-gray-600 dark:text-zinc-400">
                {r.company ?? '—'}
              </div>
            </div>
            <StatusBadge status={r.status} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2">
              <div className="text-xs text-gray-500 dark:text-zinc-400">Requirement ID</div>
              <Link
                href={`/requirements/${encodeURIComponent(r.requirementInternalId)}`}
                className="font-mono text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400"
              >
                {r.jobDemandCode}
              </Link>
              {r.jobTitle ? (
                <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{r.jobTitle}</div>
              ) : null}
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-zinc-400">Client</div>
              <div className="font-medium text-gray-900 dark:text-zinc-50">{r.clientName}</div>
            </div>
            <div className="col-span-2">
              <div className="text-xs text-gray-500 dark:text-zinc-400">Recruiter</div>
              <div className="font-medium text-gray-900 dark:text-zinc-50">{r.recruiterName}</div>
            </div>
            <div className="col-span-2">
              <div className="text-xs text-gray-500 dark:text-zinc-400">Submission Date</div>
              <div className="font-medium text-gray-900 dark:text-zinc-50">
                {fmtShort(r.submissionDate)}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Link
              href={`/candidates/${encodeURIComponent(r.candidateId)}`}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            >
              <Pencil className="h-4 w-4" aria-hidden />
              Edit candidate
            </Link>
            <button
              type="button"
              disabled={!r.resumeRef?.trim()}
              onClick={() => void openCandidateResume(r, false)}
              className="h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
            >
              View resume
            </button>
            <button
              type="button"
              disabled={!r.resumeRef?.trim()}
              onClick={() => void openCandidateResume(r, true)}
              className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-200 dark:hover:bg-zinc-900 sm:col-span-2"
            >
              Download resume
            </button>
          </div>
        </div>
      )}
      emptyText="No candidates found."
    />
  );
}

export function useCandidateRows() {
  const { candidates, submissions, jobDemands } = useCandidatesStore();
  return useMemo<CandidateRow[]>(() => {
    const byCandidate = new Map(candidates.map((c) => [c.id, c]));
    const byJd = new Map(jobDemands.map((j) => [j.id, j]));
    return submissions.map((s) => {
      const c = byCandidate.get(s.candidateId);
      const jd = byJd.get(s.jdId);
      const reqCode = jd?.jdCode?.trim();
      const title = jd?.jobTitle?.trim();
      const jobDemandCode = reqCode || title || '—';
      return {
        candidateId: s.candidateId,
        name: c?.name ?? 'Unknown',
        email: c?.email ?? '—',
        company: c?.currentEmployer,
        resumeRef: c?.resumeRef,
        resumeSkills: c?.skills,
        resumeTechnologies: c?.technologies,
        resumeExperienceLabel: c?.experienceLabel,
        resumeTotalExperience: c?.totalExperience ?? null,
        requirementInternalId: s.jdId,
        jobDemandCode,
        jobTitle: title,
        clientName: jd?.clientLeadPoc ?? '—',
        recruiterName: s.submittedBy.name,
        submissionDate: s.submittedOn,
        status: s.status,
      };
    });
  }, [candidates, submissions, jobDemands]);
}
