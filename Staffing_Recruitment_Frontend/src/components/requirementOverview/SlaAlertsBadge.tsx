'use client';

import React from 'react';

export function SlaAlertsBadge({
  slaRemainingDays,
  overdueSubmittedCount,
}: {
  slaRemainingDays: number;
  overdueSubmittedCount: number;
}) {
  const warn = slaRemainingDays <= 2 || overdueSubmittedCount > 0;
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
        warn ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-gray-200 bg-white text-gray-700'
      }`}
      title="SLA + pipeline hygiene"
    >
      SLA {slaRemainingDays}d left
      {overdueSubmittedCount > 0 ? <span className="text-amber-800">• {overdueSubmittedCount} stale submitted</span> : null}
    </div>
  );
}
