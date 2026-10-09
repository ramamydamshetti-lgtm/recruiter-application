'use client';

import React from 'react';
import { Eye } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type Props = {
  message: string;
  className?: string;
};

export function RequirementViewOnlyBanner({ message, className }: Props) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100',
        className,
      )}
      role="status"
    >
      <Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold">View only</p>
        <p className="mt-0.5">{message}</p>
      </div>
    </div>
  );
}
