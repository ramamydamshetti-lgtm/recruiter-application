import React from 'react';
import { cn } from '@/lib/utils/cn';

export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold',
        className,
      )}
    >
      {children}
    </span>
  );
}
