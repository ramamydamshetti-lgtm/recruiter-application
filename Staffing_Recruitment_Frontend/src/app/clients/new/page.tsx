import { Suspense } from 'react';
import { NewClientPage } from '@/components/screens/NewClientPage';

export default function NewClientRoute() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <NewClientPage />
    </Suspense>
  );
}
