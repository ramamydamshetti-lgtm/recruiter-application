import { CandidateSubmissionDetailsPage } from '@/components/screens/CandidateSubmissionDetailsPage';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function CandidateSubmissionsPage({ params }: Props) {
  const { id } = await params;
  return <CandidateSubmissionDetailsPage candidateId={id} />;
}
