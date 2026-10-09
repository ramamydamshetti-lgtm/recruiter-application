'use client';

import React from 'react';
import { Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export const RECRUITMENT_TIMELINE_STAGES = [
  'Assigned',
  'Sourcing',
  'Submitted to Lead',
  'Submitted to Client',
  'L1 Scheduled',
  'L1 Completed',
  'L2 Scheduled',
  'L2 Completed',
  'Final Scheduled',
  'Final Completed',
  'Offer Released',
  'Joined',
  'Closed',
] as const;

export type RecruitmentTimelineStage = (typeof RECRUITMENT_TIMELINE_STAGES)[number];

export type StageVisualState = 'completed' | 'current' | 'pending' | 'rejected';

export type RecruitmentTimelineProps = {
  /** Index of current stage (0-based). Stages before are completed; after are pending. */
  currentIndex: number;
  rejected?: boolean;
};

export function RecruitmentTimeline({ currentIndex, rejected }: RecruitmentTimelineProps) {
  // Show up to the current stage so recruiters can see the active milestone
  // (e.g. "Submitted to Client"), not just prior completed steps.
  const visibleStages = RECRUITMENT_TIMELINE_STAGES.filter((_, idx) => idx <= currentIndex);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Recruitment Progress</h2>
        {rejected && (
          <span className="inline-flex w-fit rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
            Requirement marked rejected / closed negative
          </span>
        )}
      </div>
      {visibleStages.length > 0 ? (
        <div className="mt-6 overflow-x-auto pb-2">
          <div className="inline-flex items-start gap-1">
            {visibleStages.map((stage, idx) => {
              const isLast = idx === visibleStages.length - 1;
              const isCurrent = !rejected && isLast;
              return (
                <React.Fragment key={stage}>
                  <div className="flex max-w-[110px] flex-col items-center text-center">
                    <div
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors',
                        isCurrent
                          ? 'border-blue-600 bg-blue-600 text-white shadow-md'
                          : 'border-emerald-600 bg-emerald-600 text-white',
                      )}
                    >
                      {isCurrent ? <span className="h-2 w-2 rounded-full bg-white" /> : <Check className="h-4 w-4" />}
                    </div>
                    <span
                      className={cn(
                        'mt-2 text-[10px] font-medium leading-tight sm:text-[11px]',
                        isCurrent ? 'text-blue-700' : 'text-emerald-800',
                      )}
                    >
                      {stage}
                    </span>
                  </div>
                  {!isLast && <div className="mx-0.5 mt-[17px] h-0.5 w-6 bg-emerald-500 sm:w-8" />}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-gray-500">No completed stages yet.</p>
      )}
    </div>
  );
}
