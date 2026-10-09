'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CandidateSearchEntryPage } from '@/components/screens/CandidateSearchEntryPage';
import { readFormMountKey } from '@/lib/formDrafts';

function CandidateNewRouteInner() {
  const searchParams = useSearchParams();
  const requirementId = (searchParams.get('requirementId') ?? '').trim();
  const scope = requirementId || undefined;
  const [mountKey, setMountKey] = useState(() => readFormMountKey('candidate_entry', scope));

  useEffect(() => {
    setMountKey(readFormMountKey('candidate_entry', scope));
  }, [scope]);

  return (
    <CandidateSearchEntryPage key={`${scope ?? 'general'}-${mountKey}`} />
  );
}

export default function CandidateNewRoute() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-zinc-500">Loading new candidate…</div>}>
      <CandidateNewRouteInner />
    </Suspense>
  );
}
