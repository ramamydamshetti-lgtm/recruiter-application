import { Suspense } from 'react';
import { ClientDetailPage } from '@/components/screens/ClientDetailPage';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ClientDetailRoute({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <ClientDetailPage clientId={id} />
    </Suspense>
  );
}
