import { Suspense } from 'react';
import { CandidateRepositoryPage } from '@/components/screens/CandidateRepositoryPage';

export default function CandidatesRoute() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-zinc-500">Loading candidates…</div>}>
      <CandidateRepositoryPage />
    </Suspense>
  );
}
