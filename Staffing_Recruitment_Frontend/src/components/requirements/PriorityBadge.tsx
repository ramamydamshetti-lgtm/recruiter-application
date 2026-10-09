import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils/cn';
import type { RequirementPriority } from '@/lib/domain/requirements/types';

const styles: Record<RequirementPriority, string> = {
  High: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200',
  Medium:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200',
  Low: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200',
};

export function PriorityBadge({
  priority,
  className,
}: {
  priority: RequirementPriority;
  className?: string;
}) {
  return <Badge className={cn(styles[priority], className)}>{priority}</Badge>;
}
