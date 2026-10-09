import { SubmissionToClientPage } from '@/components/screens/SubmissionToClientPage';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AddSubmissionPage({ params }: Props) {
  const { id } = await params;
  return <SubmissionToClientPage requirementId={id} />;
}
