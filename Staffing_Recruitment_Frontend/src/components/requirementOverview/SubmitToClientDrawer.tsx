'use client';

import React from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { SubmissionToClientPage } from '@/components/screens/SubmissionToClientPage';

type PreselectedCandidate = { id: string; name: string; email: string };

type Props = {
  open: boolean;
  onClose: () => void;
  requirementId: string;
  /** Submission IDs the recruiter ticked in the pipeline (informational only). */
  preselectedSubmissionIds?: string[];
  /** Candidate identities for the preselected submissions, used in the banner. */
  preselectedCandidates?: PreselectedCandidate[];
  initialDestination?: 'lead' | 'client';
  forwardOnly?: boolean;
  onSubmitted?: () => void;
};

/**
 * Slide-over wrapping the existing submit-to-client workspace. When the user
 * arrives here from the pipeline floating action bar we surface a banner with
 * the preselected candidates so they know what to confirm in the form.
 */
export function SubmitToClientDrawer({
  open,
  onClose,
  requirementId,
  preselectedSubmissionIds,
  preselectedCandidates,
  initialDestination = 'lead',
  forwardOnly = false,
  onSubmitted,
}: Props) {
  if (!open) return null;
  const hasPreselection = (preselectedSubmissionIds?.length ?? 0) > 0;
  const isForwardMode = forwardOnly || initialDestination === 'client';

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/40 backdrop-blur-[2px]" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close drawer backdrop"
        onClick={onClose}
      />
      <div className="relative flex h-full w-full max-w-4xl flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {isForwardMode ? 'Forward to client' : 'Submit to lead'}
            </div>
            <div className="text-sm font-semibold text-gray-900">
              {isForwardMode
                ? 'Forward approved candidates in the original email thread'
                : 'Compose, attach, and send candidates to lead for review'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {hasPreselection && (
          <div className="border-b border-emerald-100 bg-emerald-50/80 px-5 py-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              <div className="text-sm text-emerald-900">
                <div className="font-semibold">
                  {preselectedSubmissionIds?.length ?? 0} candidate
                  {(preselectedSubmissionIds?.length ?? 0) === 1 ? '' : 's'} selected from the pipeline
                </div>
                {preselectedCandidates && preselectedCandidates.length > 0 && (
                  <div className="mt-0.5 text-xs">
                    {preselectedCandidates.map((c) => c.name).join(', ')}
                  </div>
                )}
                <div className="mt-1 text-[11px] text-emerald-800/80">
                  Confirm these candidates are picked in the tracker below before sending.
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-8 pt-2">
          <SubmissionToClientPage
            requirementId={requirementId}
            compact
            initialDestination={initialDestination}
            forwardOnly={forwardOnly}
            preselectedSubmissionIds={preselectedSubmissionIds}
            onComplete={() => {
              onSubmitted?.();
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
