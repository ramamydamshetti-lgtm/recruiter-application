import React from 'react';
import { cn } from '@/lib/utils/cn';

export function ChartCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950',
        className,
      )}
    >
      <div>
        <div className="text-lg font-medium text-gray-800 dark:text-zinc-100">{title}</div>
        {subtitle ? (
          <div className="mt-1 text-sm text-gray-600 dark:text-zinc-400">{subtitle}</div>
        ) : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}
