'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type Column<T> = {
  key: string;
  header: string | React.ReactNode;
  className?: string;
  cell: (row: T) => React.ReactNode;
};

function PaginationFooter({
  startIdx,
  endIdx,
  totalRows,
  safePage,
  totalPages,
  onPrev,
  onNext,
  className,
}: {
  startIdx: number;
  endIdx: number;
  totalRows: number;
  safePage: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-between gap-2 px-4 py-3 sm:flex-row',
        className,
      )}
    >
      <p className="text-sm text-gray-600 dark:text-zinc-400">
        Showing {startIdx + 1}-{endIdx} of {totalRows}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={safePage <= 1}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[100px] text-center text-sm font-medium text-gray-700 dark:text-zinc-300">
          Page {safePage} of {totalPages}
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={safePage >= totalPages}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function DataTable<T>({
  title,
  subtitle,
  columns,
  rows,
  mobileCard,
  emptyText = 'No results found.',
  className,
  rowsPerPage = 5,
  getRowKey,
  fixedPagination = false,
  onRowClick,
  getRowClassName,
}: {
  title?: string;
  subtitle?: string;
  columns: Column<T>[];
  rows: T[];
  mobileCard: (row: T) => React.ReactNode;
  emptyText?: string;
  className?: string;
  rowsPerPage?: number;
  getRowKey?: (row: T, index: number) => string;
  /** Pin pagination to the viewport bottom while the page scrolls (no inner table scroll). */
  fixedPagination?: boolean;
  onRowClick?: (row: T) => void;
  getRowClassName?: (row: T) => string | undefined;
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);

  useEffect(() => {
    setCurrentPage(1);
  }, [rows.length]);
  const startIdx = (safePage - 1) * rowsPerPage;
  const endIdx = Math.min(startIdx + rowsPerPage, totalRows);
  const displayRows = useMemo(
    () => (rowsPerPage > 0 ? rows.slice(startIdx, endIdx) : rows),
    [rows, rowsPerPage, startIdx, endIdx],
  );
  const showPagination = rowsPerPage > 0 && totalRows > 0;

  return (
    <div
      className={cn(
        'space-y-3',
        fixedPagination && showPagination && 'pb-[4.5rem]',
        className,
      )}
    >
      {title ? (
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-zinc-50">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-sm text-gray-600 dark:text-zinc-400">{subtitle}</p>
          ) : null}
        </div>
      ) : null}

      {/* Desktop/tablet — full table height, horizontal scroll only when needed */}
      <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm md:block dark:border-zinc-800 dark:bg-zinc-950">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs tracking-wide text-gray-600 uppercase dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={cn('px-4 py-3', c.className)}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((r, idx) => (
                <tr
                  key={getRowKey ? getRowKey(r, startIdx + idx) : `${startIdx + idx}`}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  className={cn(
                    'border-b border-gray-200/70 last:border-b-0 hover:bg-gray-50/60 dark:border-zinc-800/70 dark:hover:bg-zinc-900/30',
                    onRowClick && 'cursor-pointer',
                    getRowClassName?.(r),
                  )}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cn('px-4 py-3 align-top', c.className)}>
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-10 text-center text-sm text-gray-600 dark:text-zinc-400"
                  >
                    {emptyText}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {displayRows.map((r, idx) => (
          <div
            key={getRowKey ? getRowKey(r, startIdx + idx) : `${startIdx + idx}`}
            onClick={onRowClick ? () => onRowClick(r) : undefined}
            className={cn(onRowClick && 'cursor-pointer', getRowClassName?.(r))}
          >
            {mobileCard(r)}
          </div>
        ))}
        {rows.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            {emptyText}
          </div>
        ) : null}
      </div>

      {/* Pagination footer */}
      {showPagination && (
        <PaginationFooter
          startIdx={startIdx}
          endIdx={endIdx}
          totalRows={totalRows}
          safePage={safePage}
          totalPages={totalPages}
          onPrev={() => setCurrentPage((p) => Math.max(1, p - 1))}
          onNext={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          className={
            fixedPagination
              ? 'fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200/90 bg-white/95 px-4 py-3 shadow-[0_-8px_30px_-12px_rgba(15,23,42,0.18)] backdrop-blur-md transition-[left] duration-300 supports-[backdrop-filter]:bg-white/90 dark:border-zinc-800/90 dark:bg-zinc-950/95 lg:left-[var(--app-sidebar-width,300px)] lg:px-8'
              : 'rounded-xl border border-gray-200 bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900/50'
          }
        />
      )}
    </div>
  );
}
