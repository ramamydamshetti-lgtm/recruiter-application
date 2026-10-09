import { EditRequirementClient } from './EditRequirementClient';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditRequirementPage({ params }: Props) {
  const { id } = await params;
  return <EditRequirementClient id={id} />;
}
