'use client';

import React from 'react';
import Link from 'next/link';
import {
  Briefcase,
  CalendarDays,
  Edit3,
  FileDown,
  UserPlus,
} from 'lucide-react';
import type { Requirement } from '@/lib/domain/requirements/types';
import { PriorityBadge } from '@/components/requirements/PriorityBadge';
import { StatusBadge } from '@/components/requirements/StatusBadge';
import { PageBackNav } from '@/components/ui/PageBackNav';
import type { DashboardFilter } from '@/lib/domain/requirements/logic';
import { bumpFormMountKey } from '@/lib/formDrafts';

type Props = {
  requirement: Requirement;
  /** Derived dashboard step label */
  stepLabel: Exclude<DashboardFilter, 'All'> | string;
  slaRemainingDays: number;
  sourcePdfLoading: boolean;
  mayHaveEmailSourcePdf: boolean;
  onDownloadSourcePdf: () => void;
  canEditRequirement?: boolean;
  canAddCandidate?: boolean;
  /** Compact owner details rendered inline beside SLA text. */
  ownerSlot?: React.ReactNode;
};

/**
 * Sticky top header for the Requirement Overview workspace.
 *
 * Intentionally minimal — only **navigation, identity and a small set of
 * requirement-level actions** live here. All recruiter-flow actions (Send to
 * Client, Schedule Interview, Release Offer) are contextual and live on the
 * candidate card or the candidate-details drawer. Recruiters trigger them
 * per-candidate so the top bar stays uncluttered.
 */
export function StickyRequirementHeader({
  requirement,
  stepLabel,
  slaRemainingDays,
  sourcePdfLoading,
  mayHaveEmailSourcePdf,
  onDownloadSourcePdf,
  canEditRequirement = true,
  canAddCandidate = true,
  ownerSlot,
}: Props) {
  const rid = requirement.requirementId ?? requirement.id;
  const clientName =
    requirement.clientLeadPoc ||
    requirement.submittingTo ||
    'Client';

  return (
    <header className="sticky top-0 z-40 -mx-4 border-b border-gray-200/80 bg-white/85 px-4 py-4 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.12)] backdrop-blur-md supports-[backdrop-filter]:bg-white/75 lg:-mx-6 lg:px-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <PageBackNav />
          <div className="flex flex-wrap items-center gap-2">
            <Briefcase className="hidden h-5 w-5 shrink-0 text-[#1a2b4a] sm:inline" />
            <span className="font-mono text-sm font-semibold text-[#1a2b4a]">{rid}</span>
            <PriorityBadge priority={requirement.priority || 'MEDIUM'} />
            <StatusBadge status={stepLabel as any} />
          </div>
          <h1 className="mt-1 truncate text-xl font-semibold text-gray-900 sm:text-2xl">
            {requirement.roleTitle || 'Untitled role'}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
            <span className="font-medium text-gray-800">{clientName}</span>
            <span className="hidden text-gray-300 sm:inline">•</span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-4 w-4 text-blue-600" />
              SLA remaining:{' '}
              <strong className={slaRemainingDays <= 2 ? 'text-amber-700' : 'text-gray-900'}>
                {slaRemainingDays} days
              </strong>
            </span>
            {ownerSlot && <span className="hidden text-gray-300 sm:inline">•</span>}
            {ownerSlot}
          </p>
        </div>

        <div className="flex flex-shrink-0 flex-wrap gap-2 lg:justify-end">
          {canAddCandidate ? (
            <Link
              href={`/candidates/new?requirementId=${encodeURIComponent(requirement.id)}`}
              onClick={() => bumpFormMountKey('candidate_entry', requirement.id)}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
            >
              <UserPlus className="h-4 w-4" />
              Add Candidate
            </Link>
          ) : null}
          {mayHaveEmailSourcePdf && (
            <button
              type="button"
              disabled={sourcePdfLoading}
              onClick={onDownloadSourcePdf}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
            >
              <FileDown className="h-4 w-4" />
              {sourcePdfLoading ? 'PDF…' : 'Original email'}
            </button>
          )}
          {canEditRequirement && (
            <Link
              href={`/requirements/${requirement.id}/edit`}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-800 transition hover:bg-gray-200"
            >
              <Edit3 className="h-4 w-4" />
              Edit Requirement
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
