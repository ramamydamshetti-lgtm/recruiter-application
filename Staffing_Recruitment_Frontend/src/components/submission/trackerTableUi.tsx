'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

/** Shared Excel-inspired tracker table styling. */
export const TRACKER_TABLE_UI = {
  th: cn(
    'border border-slate-300 px-2.5 py-2.5 text-[12.5px] font-bold uppercase tracking-wide',
    'whitespace-nowrap align-bottom text-slate-900 sm:px-3 sm:py-3 sm:text-[13px]',
  ),
  td: cn(
    'border border-slate-200 px-2 py-1.5 align-top text-[12.5px] text-black whitespace-normal break-words sm:px-2.5 sm:py-2 sm:text-[13px]',
  ),
  tbodyTr: 'bg-white even:bg-slate-50/80 hover:bg-sky-50/40 transition-colors',
  input: cn(
    'w-full min-w-0 rounded-sm border border-transparent bg-transparent px-1.5 py-1',
    'text-[12.5px] text-black sm:text-[13px]',
    'focus:border-sky-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-400/20',
  ),
  readOnly: 'block px-1.5 py-1 text-[12.5px] text-black tabular-nums sm:text-[13px]',
} as const;

export function TrackerTableShell({
  headerBg,
  minWidth = 1100,
  children,
  className,
}: {
  headerBg: string;
  minWidth?: number | string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn(
          'tracker-wrap overflow-x-auto overscroll-x-contain rounded-xl border border-slate-300/90 bg-white',
          'shadow-[0_1px_4px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/50',
        )}
      >
        <table
          className="tracker-table w-full table-auto border-collapse text-left text-[12.5px] leading-snug sm:text-[13px]"
          style={{ minWidth: typeof minWidth === 'number' ? `${minWidth}px` : minWidth }}
        >
          {children}
        </table>
      </div>
      <p className="mt-1.5 text-center text-[10px] text-slate-400 md:hidden">
        Swipe to view all columns
      </p>
    </div>
  );
}

export function TrackerTableHeaderRow({
  headerBg,
  children,
  className,
}: {
  headerBg: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <thead>
      <tr
        className={cn('font-semibold text-slate-900', className)}
        style={{ backgroundColor: headerBg }}
      >
        {children}
      </tr>
    </thead>
  );
}
