'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';

const ReportGenerationPage = dynamic(
  () =>
    import('@/components/screens/ReportGenerationPage').then(
      (mod) => mod.ReportGenerationPage,
    ),
  {
    loading: () => <div className="p-8">Loading report workspace...</div>,
  },
);

export default function ReportsGenerateRoute() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <ReportGenerationPage />
    </Suspense>
  );
}

