import { RequirementDetailsClient } from './RequirementDetailsClient';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function RequirementDetailsPage({ params }: Props) {
  const { id } = await params;
  return <RequirementDetailsClient id={id} />;
}
