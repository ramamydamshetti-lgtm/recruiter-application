import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils/cn';
import type { DashboardFilter } from '@/lib/domain/requirements/logic';

export type SemanticStatus = Exclude<DashboardFilter, 'All'>;

const styles: Record<SemanticStatus, string> = {
  Unassigned: 'border-gray-200 bg-gray-100 text-gray-700',
  Assigned: 'border-blue-200 bg-blue-50 text-blue-800',
  Submitted: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  'Submitted to Lead': 'border-violet-200 bg-violet-50 text-violet-800',
  'Submitted to Client': 'border-indigo-200 bg-indigo-50 text-indigo-800',
  Interview: 'border-amber-200 bg-amber-50 text-amber-800',
  Selected: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  Rejected: 'border-red-200 bg-red-50 text-red-800',
  Closed: 'border-slate-200 bg-slate-50 text-slate-700',
};

export function StatusBadge({ status, className }: { status: SemanticStatus; className?: string }) {
  return <Badge className={cn(styles[status], className)}>{status}</Badge>;
}

export function asSemanticStatus(filter: DashboardFilter): SemanticStatus {
  if (filter === 'All') return 'Unassigned';
  return filter;
}
