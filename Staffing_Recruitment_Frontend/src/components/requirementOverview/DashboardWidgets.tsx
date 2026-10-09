'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

export type DashboardWidgetCounts = {
  totalCandidates: number;
  submitted: number;
  interviewing: number;
  selected: number;
  rejected: number;
  offerReleased: number;
  slaRemaining: number;
};

export type DashboardWidgetKey =
  | 'totalCandidates'
  | 'submitted'
  | 'interviewing'
  | 'selected'
  | 'rejected'
  | 'offerReleased'
  | 'slaRemaining';

type Props = {
  counts: DashboardWidgetCounts;
  onTileClick?: (key: DashboardWidgetKey) => void;
  className?: string;
};

function Tile({
  tileKey,
  label,
  value,
  accent,
  onClick,
}: {
  tileKey: DashboardWidgetKey;
  label: string;
  value: number;
  accent: 'slate' | 'blue' | 'amber' | 'emerald' | 'rose' | 'violet';
  onClick?: (key: DashboardWidgetKey) => void;
}) {
  const ring =
    accent === 'blue'
      ? 'border-blue-100 bg-gradient-to-br from-blue-50/90 to-white'
      : accent === 'amber'
        ? 'border-amber-100 bg-gradient-to-br from-amber-50/90 to-white'
        : accent === 'emerald'
          ? 'border-emerald-100 bg-gradient-to-br from-emerald-50/90 to-white'
          : accent === 'rose'
            ? 'border-rose-100 bg-gradient-to-br from-rose-50/90 to-white'
            : accent === 'violet'
              ? 'border-violet-100 bg-gradient-to-br from-violet-50/90 to-white'
              : 'border-slate-100 bg-gradient-to-br from-slate-50/90 to-white';

  const numCls =
    accent === 'blue'
      ? 'text-blue-700'
      : accent === 'amber'
        ? 'text-amber-800'
        : accent === 'emerald'
          ? 'text-emerald-800'
          : accent === 'rose'
            ? 'text-rose-800'
            : accent === 'violet'
              ? 'text-violet-800'
              : 'text-slate-900';

  return (
    <button
      type="button"
      onClick={() => onClick?.(tileKey)}
      disabled={!onClick}
      className={cn(
        'w-full rounded-2xl border p-4 text-left shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md',
        onClick ? 'cursor-pointer' : 'cursor-default',
        ring,
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className={cn('mt-2 text-3xl font-bold tabular-nums transition-all', numCls)}>{value}</div>
    </button>
  );
}

export function DashboardWidgets({ counts, onTileClick, className }: Props) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7', className)}>
      <Tile tileKey="totalCandidates" label="Total Candidates" value={counts.totalCandidates} accent="slate" onClick={onTileClick} />
      <Tile tileKey="submitted" label="Submitted" value={counts.submitted} accent="blue" onClick={onTileClick} />
      <Tile tileKey="interviewing" label="Interviewing" value={counts.interviewing} accent="amber" onClick={onTileClick} />
      <Tile tileKey="selected" label="Selected" value={counts.selected} accent="emerald" onClick={onTileClick} />
      <Tile tileKey="rejected" label="Rejected" value={counts.rejected} accent="rose" onClick={onTileClick} />
      <Tile tileKey="offerReleased" label="Offer Released" value={counts.offerReleased} accent="violet" onClick={onTileClick} />
      <Tile tileKey="slaRemaining" label="SLA Remaining (days)" value={counts.slaRemaining} accent="blue" onClick={onTileClick} />
    </div>
  );
}
