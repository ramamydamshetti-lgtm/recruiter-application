'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Mail, Users } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type RecruiterInfo = {
  id: string;
  name: string;
  email: string;
  title: string;
};

function dedupeRecruiters(list: RecruiterInfo[]): RecruiterInfo[] {
  const seen = new Set<string>();
  const out: RecruiterInfo[] = [];
  for (const rec of list) {
    const key = (rec.id || rec.email || rec.name || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(rec);
  }
  return out;
}

function recruiterHref(rec: RecruiterInfo): string {
  return `/requirements?recruiter=${encodeURIComponent(rec.id || rec.name || 'unknown')}`;
}

function RecruiterChip({
  rec,
  compact = false,
}: {
  rec: RecruiterInfo;
  compact?: boolean;
}) {
  return (
    <Link
      href={recruiterHref(rec)}
      className={cn(
        'group inline-flex max-w-full items-center gap-1.5 rounded-full border border-gray-200 bg-white font-medium text-gray-800 shadow-sm transition hover:border-blue-300 hover:bg-blue-50/50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:border-blue-600/50 dark:hover:bg-blue-950/30',
        compact ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1.5 text-xs',
      )}
      title={rec.email || rec.name}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
      <span className="truncate">{rec.name || 'Unknown'}</span>
    </Link>
  );
}

function RecruiterListRow({ rec }: { rec: RecruiterInfo }) {
  return (
    <Link
      href={recruiterHref(rec)}
      className="flex items-start gap-2 rounded-lg px-2 py-1.5 transition hover:bg-blue-50 dark:hover:bg-zinc-800"
    >
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-gray-900 dark:text-zinc-100">
          {rec.name || 'Unknown'}
        </div>
        <div className="flex items-center gap-1 truncate text-[10px] text-gray-500 dark:text-zinc-400">
          <Mail className="h-3 w-3 shrink-0" />
          <span className="truncate">{rec.email || 'No email'}</span>
        </div>
      </div>
    </Link>
  );
}

export function OwnerPill({
  owner,
  recruiters,
  assignedBy,
  tableAssignedLayout = false,
  onRevoke,
  className,
}: {
  owner: RecruiterInfo;
  recruiters?: RecruiterInfo[];
  assignedBy?: string;
  tableAssignedLayout?: boolean;
  onRevoke?: () => void;
  className?: string;
}) {
  const [listOpen, setListOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        setListOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [listOpen]);

  const displayList = useMemo(() => {
    const raw =
      recruiters && recruiters.length > 0
        ? recruiters
        : owner?.name?.trim()
          ? [owner]
          : [];
    return dedupeRecruiters(raw);
  }, [recruiters, owner]);

  const isAssigned = displayList.length > 0;
  const useMultiRecruiterLayout = displayList.length > 1;
  const primary = displayList[0];
  const overflowCount = Math.max(0, displayList.length - 1);
  const assignerLabel = assignedBy?.trim() || '';

  if (!isAssigned) {
    return (
      <div className={cn('flex flex-col gap-1.5', className)}>
        <span
          className={cn(
            'inline-flex w-fit items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400',
          )}
          title="No owner assigned"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-zinc-500" />
          Unassigned
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-1.5',
        useMultiRecruiterLayout && tableAssignedLayout && 'max-w-[11.5rem]',
        className,
      )}
    >
      {!useMultiRecruiterLayout ? (
        primary ? <RecruiterChip rec={primary} /> : null
      ) : (
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50/80 px-2 py-1 text-[11px] font-semibold text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
            <Users className="h-3.5 w-3.5 shrink-0" />
            {displayList.length} recruiters
          </div>

          {primary ? <RecruiterChip rec={primary} compact /> : null}

          {overflowCount > 0 ? (
            <div className="relative" ref={listRef}>
              <button
                type="button"
                onClick={() => setListOpen((v) => !v)}
                className="inline-flex w-full items-center justify-between gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-left text-[11px] font-medium text-gray-700 transition hover:border-blue-200 hover:bg-blue-50/60 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200 dark:hover:border-blue-800"
              >
                <span>
                  +{overflowCount} more
                </span>
                <ChevronDown
                  className={cn('h-3.5 w-3.5 shrink-0 transition', listOpen && 'rotate-180')}
                />
              </button>
              {listOpen ? (
                <div className="absolute left-0 z-30 mt-1 w-56 rounded-xl border border-gray-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                  <div className="border-b border-gray-100 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:border-zinc-800 dark:text-zinc-400">
                    All assignees ({displayList.length})
                  </div>
                  <div className="max-h-44 overflow-y-auto py-0.5">
                    {displayList.map((rec) => (
                      <RecruiterListRow key={rec.id || rec.email || rec.name} rec={rec} />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {assignerLabel ? (
        <span
          className={cn(
            'truncate text-[10px] leading-snug',
            tableAssignedLayout
              ? 'text-gray-500 dark:text-zinc-400'
              : 'text-gray-500 dark:text-zinc-400',
          )}
          title={`Assigned by ${assignerLabel}`}
        >
          By {assignerLabel}
        </span>
      ) : null}

      {onRevoke ? (
        <button
          type="button"
          onClick={onRevoke}
          className="w-fit text-left text-[11px] font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
        >
          {tableAssignedLayout ? 'Revoke' : 'Resign'}
        </button>
      ) : null}
    </div>
  );
}
