'use client';

import React, { useMemo, useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import type { Requirement } from '@/lib/domain/requirements/types';
import {
  getDashboardStatus,
  getOpenDays,
  getSlaOverdue,
  type DashboardFilter,
} from '@/lib/domain/requirements/logic';
import { StatusBadge } from '@/components/requirements/StatusBadge';
import { PriorityBadge } from '@/components/requirements/PriorityBadge';
import { OwnerPill } from '@/components/requirements/OwnerPill';
import { cn } from '@/lib/utils/cn';

function looksLikeEmail(v?: string | null): boolean {
  const s = String(v ?? '').trim();
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function firstEmail(...candidates: Array<string | null | undefined>): string {
  for (const c of candidates) {
    const s = String(c ?? '').trim();
    if (looksLikeEmail(s)) return s;
  }
  return '—';
}

function firstPhoneLike(...candidates: Array<string | null | undefined>): string {
  for (const c of candidates) {
    const s = String(c ?? '').trim();
    if (!s) continue;
    const compact = s.replace(/[\s\-().]/g, '');
    if (/^\+?\d{8,15}$/.test(compact)) return s;
  }
  return 'Not available';
}

function resolveClientDisplayName(r: Requirement): string {
  const raw = String(r.submittingTo ?? '').trim();
  if (raw) return raw;
  if (looksLikeEmail(r.clientLeadPoc)) {
    const domain = String(r.clientLeadPoc).split('@')[1] || '';
    if (domain) return domain;
  }
  return 'Unknown client';
}

export function RequirementTable({
  requirements,
  filter,
  slaDays = 10,
  selectedIds,
  onToggle,
  onToggleAll,
  onRevoke,
}: {
  requirements: Requirement[];
  filter: DashboardFilter;
  slaDays?: number;
  selectedIds?: Set<string>;
  onToggle?: (id: string) => void;
  onToggleAll?: (checked: boolean, ids?: string[]) => void;
  onRevoke?: (requirementId: string) => void;
}) {

  /* =====================================================
     1️⃣  FILTER + AUTO SORT (Overdue first)
  ===================================================== */

  // Dashboard sorts and paginates before passing rows here.
  const rows = useMemo(
    () => requirements.filter((r) => !r.isDeleted),
    [requirements],
  );

  /* =====================================================
     2️⃣  SLA COUNT
  ===================================================== */

  const breachedCount = useMemo(
    () => rows.filter((r) => getSlaOverdue(r, slaDays)).length,
    [rows, slaDays]
  );

  const assignableRows = useMemo(
    () => rows.filter((r) => {
      const s = getDashboardStatus(r);
      return s === 'Assigned' || s === 'Unassigned';
    }),
    [rows]
  );

  /* =====================================================
     3️⃣  EMAIL SIMULATION
  ===================================================== */

  useEffect(() => {
    if (breachedCount > 0) {
      console.log(
        `📧 Auto Email Triggered: ${breachedCount} requirements breached SLA`
      );
    }
  }, [breachedCount]);

  return (
    <>
      {/* =====================================================
          🖥 DESKTOP TABLE
      ===================================================== */}

      <div className="hidden overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm md:block dark:border-zinc-800 dark:bg-zinc-900">
        <div className="max-h-[650px] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-gray-200 bg-slate-50 text-xs uppercase tracking-wide text-gray-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                {selectedIds && onToggle && onToggleAll && assignableRows.length > 0 && (
                  <th className="w-10 bg-slate-50 px-4 py-3 dark:bg-zinc-950">
                    <input
                      type="checkbox"
                      checked={
                        assignableRows.length > 0 &&
                        assignableRows.every((r) => selectedIds.has(r.id))
                      }
                      onChange={(e) =>
                        onToggleAll?.(e.target.checked, assignableRows.map((r) => r.id))
                      }
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800"
                    />
                  </th>
                )}
                <th className="bg-slate-50 px-4 py-3 dark:bg-zinc-950">Requirement ID</th>
                <th className="bg-slate-50 px-4 py-3 dark:bg-zinc-950">Client name</th>
                <th className="bg-slate-50 px-4 py-3 dark:bg-zinc-950">Client email ID</th>
                <th className="bg-slate-50 px-4 py-3 dark:bg-zinc-950">Client contact number</th>
                <th className="bg-slate-50 px-4 py-3 dark:bg-zinc-950">Role</th>
                <th className="bg-slate-50 px-4 py-3 dark:bg-zinc-950">Priority</th>
                <th className="bg-slate-50 px-4 py-3 dark:bg-zinc-950">Owner</th>
                <th className="bg-slate-50 px-4 py-3 dark:bg-zinc-950">Email Arrived Time</th>
                <th className="bg-slate-50 px-4 py-3 dark:bg-zinc-950">Open Since</th>
                <th className="bg-slate-50 px-4 py-3 text-right dark:bg-zinc-950">Submissions</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => {
                const status = getDashboardStatus(r);
                const openDays = getOpenDays(r);
                const overdue = getSlaOverdue(r, slaDays);

                return (
                  <tr
                    key={r.id}
                    className="border-b last:border-b-0 transition hover:bg-slate-50/60 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                  >
                    {selectedIds && onToggle && assignableRows.length > 0 && (
                      <td className="w-10 px-4 py-3">
                        {(status === 'Assigned' || status === 'Unassigned') ? (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(r.id)}
                            onChange={() => onToggle(r.id)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800"
                          />
                        ) : null}
                      </td>
                    )}
                    {/* Requirement ID */}
                    <td className="min-w-[11rem] px-4 py-3 align-top" title={r.requirementId ?? r.id}>
                      <Link
                        href={`/requirements/${r.id}`}
                        className="break-words font-semibold hover:underline dark:text-zinc-100 sm:whitespace-nowrap"
                        title={r.requirementId ?? r.id}
                      >
                        {r.requirementId ?? r.id}
                      </Link>
                      {status !== 'All' && (
                        <div className="mt-1">
                          <StatusBadge status={status} />
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-medium dark:text-zinc-100">
                        {resolveClientDisplayName(r)}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-zinc-300">
                      {firstEmail(r.clientLeadPoc, r.clientPoc)}
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-zinc-300">
                      {firstPhoneLike(r.clientPoc, r.clientLeadPoc)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-medium dark:text-zinc-100">
                        {r.roleTitle}
                      </div>
                      <div
                        className="max-w-[420px] truncate text-xs text-gray-500 dark:text-zinc-400"
                        title={r.location}
                      >
                        {r.location}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <PriorityBadge priority={r.priority} />
                    </td>

                    <td className="px-4 py-3">
                      <OwnerPill
                        owner={r.owner}
                        recruiters={r.assignedRecruiters}
                        assignedBy={r.assignedBy || r.assignmentAssignerName || undefined}
                        tableAssignedLayout={
                          filter === 'Assigned' ||
                          status === 'Assigned' ||
                          (r.assignedRecruiters?.length ?? 0) > 2
                        }
                        onRevoke={
                          (filter === 'Assigned' || status === 'Assigned') && onRevoke
                            ? () => onRevoke(r.id)
                            : undefined
                        }
                      />
                    </td>

                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900 dark:text-zinc-100">
                        {new Date(r.createdAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                        })}
                      </div>
                    </td>

                    {/* Open Since – SLA breach alert shown here when overdue */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "font-semibold tabular-nums",
                            overdue
                              ? "text-red-600 dark:text-red-400"
                              : "text-gray-900 dark:text-zinc-100"
                          )}
                        >
                          {openDays} days
                        </span>
                        {overdue && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-200"
                            title="SLA breached – requirement overdue"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            Overdue
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {r.submissionsCount}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
