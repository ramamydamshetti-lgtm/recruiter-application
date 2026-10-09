import React from 'react';
import { cn } from '@/lib/utils/cn';

export function KPIStatCard({
  label,
  value,
  trend,
  className,
}: {
  label: string;
  value: string;
  trend: { direction: 'up' | 'down'; value: string; helper?: string };
  className?: string;
}) {
  const trendCls =
    trend.direction === 'up'
      ? 'text-emerald-700 dark:text-emerald-300'
      : 'text-rose-700 dark:text-rose-300';

  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950',
        className,
      )}
    >
      <div className="text-sm font-medium text-gray-600 dark:text-zinc-400">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 dark:text-zinc-50">
        {value}
      </div>
      <div className={cn('mt-2 text-sm font-medium', trendCls)}>
        {trend.direction === 'up' ? '↑' : '↓'} {trend.value}
        <span className="ml-2 text-xs font-normal text-gray-500 dark:text-zinc-400">
          {trend.helper ?? 'vs last week'}
        </span>
      </div>
    </div>
  );
}
