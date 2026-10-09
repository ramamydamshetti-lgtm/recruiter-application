'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { readFormMountKey } from '@/lib/formDrafts';

const CreateRequirementPage = dynamic(
  () => import('@/components/screens/CreateRequirementPage'),
  {
    loading: () => <div className="p-8">Loading requirement form...</div>,
  },
);

export default function CreateNewJobDemandPage() {
  const [mountKey] = useState(() => readFormMountKey('requirement_create'));
  return <CreateRequirementPage key={mountKey} />;
}
