import React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  right,
  className,
}: {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950',
        className,
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-zinc-500" />
          <input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder ?? 'Search...'}
            className="h-11 w-full rounded-xl border border-gray-200 bg-white pr-3 pl-10 text-sm text-gray-900 shadow-sm transition outline-none focus:border-gray-400 focus:ring-4 focus:ring-gray-200/60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-600 dark:focus:ring-zinc-800/60"
          />
        </div>
        {right ? <div className="flex w-full items-center gap-3 md:w-auto">{right}</div> : null}
      </div>
    </div>
  );
}
