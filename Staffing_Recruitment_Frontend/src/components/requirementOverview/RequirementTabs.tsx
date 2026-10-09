'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

export type RequirementOverviewTabId =
  | 'overview'
  | 'pipeline'
  | 'interviews'
  | 'offers'
  | 'activity';

const TABS: { id: RequirementOverviewTabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'interviews', label: 'Interviews' },
  { id: 'offers', label: 'Offers' },
  { id: 'activity', label: 'Activity' },
];

type Props = {
  active: RequirementOverviewTabId;
  onChange: (id: RequirementOverviewTabId) => void;
};

export function RequirementTabs({ active, onChange }: Props) {
  return (
    <>
      <div className="hidden gap-1 rounded-xl border border-gray-200 bg-gray-50/80 p-1 sm:flex sm:flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-semibold transition',
              active === t.id
                ? 'bg-white text-[#1a2b4a] shadow-sm ring-1 ring-gray-200'
                : 'text-gray-600 hover:bg-white/70 hover:text-gray-900',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="sm:hidden">
        <label className="sr-only" htmlFor="req-overview-tab">
          Section
        </label>
        <select
          id="req-overview-tab"
          value={active}
          onChange={(e) => onChange(e.target.value as RequirementOverviewTabId)}
          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-900 shadow-sm"
        >
          {TABS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
