import { Suspense } from 'react';
import { ClientsDashboard } from '@/components/screens/ClientsDashboard';

export default function ClientsPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <ClientsDashboard />
    </Suspense>
  );
}
