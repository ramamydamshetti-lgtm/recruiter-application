'use client';

import React, { useMemo } from 'react';
import type { Submission } from '@/lib/domain/submissions/types';
import { isAnySubmittedStatus } from '@/lib/domain/submissions/status';
import type { InterviewRecord } from '@/lib/api/interviews';
import type { OfferLetterRecord } from '@/lib/api/offerLetters';

type Props = {
  submissions: Submission[];
  interviews: InterviewRecord[];
  offersBySubmissionId: Record<string, OfferLetterRecord | undefined>;
};

export function SmartSuggestionsBanner({ submissions, interviews, offersBySubmissionId }: Props) {
  const lines = useMemo(() => {
    const out: string[] = [];
    const idleSubmitted = submissions.filter(
      (s) =>
        isAnySubmittedStatus(s.status) &&
        s.status !== 'Interview' &&
        s.status !== 'Selected' &&
        s.status !== 'Rejected',
    );
    const oldestIdle = idleSubmitted
      .map((s) => ({ s, t: new Date(s.submittedOn).getTime() }))
      .sort((a, b) => a.t - b.t)[0];
    if (oldestIdle && Date.now() - oldestIdle.t > 7 * 86400000) {
      out.push(`• ${idleSubmitted.length} candidate(s) idle in Submitted for over 7 days.`);
    }

    const selectedWithoutOffer = submissions.filter((s) => {
      if (s.status !== 'Selected') return false;
      const o = offersBySubmissionId[s.id];
      return !o || o.status === 'DRAFT';
    });
    if (selectedWithoutOffer.length > 0) {
      out.push(`• ${selectedWithoutOffer.length} selected candidate(s) still need an offer released.`);
    }

    const completedFinal = interviews.filter((i) => i.round?.toLowerCase().includes('final') && i.status === 'Completed');
    if (completedFinal.length > 0) {
      out.push(`• Final rounds completed — confirm feedback & offer readiness for ${completedFinal.length} interview(s).`);
    }

    return out.slice(0, 3);
  }, [submissions, interviews, offersBySubmissionId]);

  if (lines.length === 0) return null;

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-blue-950 shadow-sm">
      <div className="font-semibold text-blue-900">Suggestions</div>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}
