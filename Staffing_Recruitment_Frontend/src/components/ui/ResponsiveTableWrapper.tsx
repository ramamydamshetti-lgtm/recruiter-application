import React from 'react';
import { cn } from '@/lib/utils/cn';

export function ResponsiveTableWrapper({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950',
        className,
      )}
    >
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
