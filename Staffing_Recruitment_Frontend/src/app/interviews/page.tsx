import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const InterviewTrackingPage = dynamic(
  () =>
    import('@/components/screens/InterviewTrackingPage').then(
      (mod) => mod.InterviewTrackingPage,
    ),
  {
    loading: () => <div className="p-8">Loading interviews...</div>,
  },
);

export default function InterviewTrackingRoute() {
  return (
    <Suspense fallback={<div className="p-8">Loading interviews...</div>}>
      <InterviewTrackingPage />
    </Suspense>
  );
}
