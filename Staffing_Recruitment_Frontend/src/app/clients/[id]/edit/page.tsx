import { Suspense } from 'react';
import { EditClientPage } from '@/components/screens/EditClientPage';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditClientRoute({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <EditClientPage clientId={id} />
    </Suspense>
  );
}
