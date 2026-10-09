import { Suspense } from 'react';
import { RequirementsDashboard } from '@/components/screens/RequirementsDashboard';

export default function RequirementsPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <RequirementsDashboard />
    </Suspense>
  );
}
