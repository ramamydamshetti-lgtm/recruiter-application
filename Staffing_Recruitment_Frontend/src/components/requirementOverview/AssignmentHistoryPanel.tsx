'use client';

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search, Users } from 'lucide-react';
import type { RequirementAssignmentRow } from '@/lib/api/requirements';
import { formatDateTime } from '@/lib/utils/dateTime';
import { cn } from '@/lib/utils/cn';

type Props = {
  rows: RequirementAssignmentRow[];
  loading: boolean;
};

type StatusFilter = 'ALL' | 'ACTIVE' | 'REVOKED';

type AssignmentBatch = {
  key: string;
  assignedOn: string;
  assignerName: string;
  status: string;
  members: RequirementAssignmentRow[];
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
  }
  return (parts[0]?.[0] ?? '?').toUpperCase();
}

function batchKey(row: RequirementAssignmentRow): string {
  const d = new Date(row.assignedOn);
  const minute = Number.isNaN(d.getTime()) ? row.assignedOn : d.toISOString().slice(0, 16);
  return `${minute}|${row.assignedBy}|${row.status}`;
}

/** One ACTIVE row per recruiter (latest assignment); keep full REVOKED history. */
function dedupeAssignmentRows(rows: RequirementAssignmentRow[]): RequirementAssignmentRow[] {
  const revoked = rows.filter((row) => row.status === 'REVOKED');
  const latestActiveByRecruiter = new Map<string, RequirementAssignmentRow>();

  for (const row of rows) {
    if (row.status !== 'ACTIVE') continue;
    const key = row.recruiterId.trim();
    if (!key) continue;
    const existing = latestActiveByRecruiter.get(key);
    if (
      !existing ||
      new Date(row.assignedOn).getTime() > new Date(existing.assignedOn).getTime()
    ) {
      latestActiveByRecruiter.set(key, row);
    }
  }

  return [...latestActiveByRecruiter.values(), ...revoked];
}

function statusBadgeClass(status: string): string {
  if (status === 'ACTIVE') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  }
  if (status === 'REVOKED') {
    return 'border-amber-200 bg-amber-50 text-amber-800';
  }
  return 'border-gray-200 bg-gray-100 text-gray-700';
}

function RecruiterAvatar({ name }: { name: string }) {
  return (
    <span
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700"
      aria-hidden
    >
      {initials(name)}
    </span>
  );
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

function RecruiterRow({ row }: { row: RequirementAssignmentRow }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2.5">
      <RecruiterAvatar name={row.recruiterName} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-900">{row.recruiterName}</div>
        <div className="truncate text-xs text-gray-500">{row.recruiterEmail}</div>
      </div>
    </div>
  );
}

function BatchCard({
  batch,
  defaultExpanded,
}: {
  batch: AssignmentBatch;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isBulk = batch.members.length > 1;
  const sortedMembers = useMemo(
    () =>
      [...batch.members].sort((a, b) =>
        a.recruiterName.localeCompare(b.recruiterName, undefined, { sensitivity: 'base' }),
      ),
    [batch.members],
  );
  const previewMembers = sortedMembers.slice(0, 4);
  const overflowCount = Math.max(0, sortedMembers.length - previewMembers.length);

  if (!isBulk) {
    const row = sortedMembers[0];
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <RecruiterAvatar name={row.recruiterName} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-gray-900">{row.recruiterName}</div>
              <div className="truncate text-xs text-gray-500">{row.recruiterEmail}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
            <span>
              <span className="font-medium text-gray-500">Assigned on</span>{' '}
              {formatDateTime(row.assignedOn)}
            </span>
            <span>
              <span className="font-medium text-gray-500">By</span> {row.assignerName}
            </span>
            <span
              className={cn(
                'rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
                statusBadgeClass(row.status),
              )}
            >
              {row.status}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-4 text-left transition hover:bg-gray-50/80"
      >
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
          <Users className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">
              {batch.members.length} recruiters
            </span>
            <span
              className={cn(
                'rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
                statusBadgeClass(batch.status),
              )}
            >
              {batch.status}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-600">
            <span>
              <span className="font-medium text-gray-500">Assigned on</span>{' '}
              {formatDateTime(batch.assignedOn)}
            </span>
            <span>
              <span className="font-medium text-gray-500">By</span> {batch.assignerName}
            </span>
          </div>
          {!expanded && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {previewMembers.map((row) => (
                <span
                  key={row.id}
                  className="inline-flex max-w-[11rem] items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-800"
                  title={row.recruiterEmail}
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  <span className="truncate">{row.recruiterName}</span>
                </span>
              ))}
              {overflowCount > 0 && (
                <span className="text-xs font-medium text-blue-700">+{overflowCount} more</span>
              )}
            </div>
          )}
        </div>
        <span className="mt-1 shrink-0 text-gray-400">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/40 px-4 py-3">
          <div className="max-h-72 overflow-y-auto">
            <div className="grid gap-2 sm:grid-cols-2">
              {sortedMembers.map((row) => (
                <RecruiterRow key={row.id} row={row} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AssignmentHistoryPanel({ rows, loading }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');

  const displayRows = useMemo(() => dedupeAssignmentRows(rows), [rows]);

  const stats = useMemo(() => {
    let active = 0;
    let revoked = 0;
    for (const row of displayRows) {
      if (row.status === 'ACTIVE') active += 1;
      else if (row.status === 'REVOKED') revoked += 1;
    }
    return { active, revoked, total: displayRows.length };
  }, [displayRows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return displayRows.filter((row) => {
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false;
      if (!query) return true;
      const haystack = `${row.recruiterName} ${row.recruiterEmail} ${row.assignerName}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [displayRows, search, statusFilter]);

  const batches = useMemo(() => {
    const map = new Map<string, AssignmentBatch>();
    for (const row of filteredRows) {
      const key = batchKey(row);
      const existing = map.get(key);
      if (existing) {
        existing.members.push(row);
      } else {
        map.set(key, {
          key,
          assignedOn: row.assignedOn,
          assignerName: row.assignerName,
          status: row.status,
          members: [row],
        });
      }
    }
    return [...map.values()].sort(
      (a, b) => new Date(b.assignedOn).getTime() - new Date(a.assignedOn).getTime(),
    );
  }, [filteredRows]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600">
          Track who was assigned to this requirement and when. Updates when you Reassign or Revoke.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {stats.active} active
          </span>
          {stats.revoked > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
              {stats.revoked} revoked
            </span>
          )}
        </div>
      </div>

      {displayRows.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <FilterPill
              active={statusFilter === 'ALL'}
              label="All"
              count={stats.total}
              onClick={() => setStatusFilter('ALL')}
            />
            <FilterPill
              active={statusFilter === 'ACTIVE'}
              label="Active"
              count={stats.active}
              onClick={() => setStatusFilter('ACTIVE')}
            />
            <FilterPill
              active={statusFilter === 'REVOKED'}
              label="Revoked"
              count={stats.revoked}
              onClick={() => setStatusFilter('REVOKED')}
            />
          </div>
          <label className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recruiter or assigner…"
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>
        </div>
      )}

      {displayRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center">
          <p className="text-sm font-medium text-gray-700">No assignment records yet</p>
          <p className="mt-1 text-xs text-gray-500">
            Use Reassign in the header to add recruiters to this requirement.
          </p>
        </div>
      ) : batches.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-8 text-center text-sm text-gray-500">
          No assignments match your search or filter.
        </div>
      ) : (
        <div className="space-y-3">
          {batches.map((batch, index) => (
            <BatchCard
              key={batch.key}
              batch={batch}
              defaultExpanded={index === 0 && batch.members.length > 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
