import { CandidateDetailPage } from '@/components/screens/CandidateDetailPage';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function CandidateByIdPage({ params }: Props) {
  const { id } = await params;
  return <CandidateDetailPage candidateId={id} />;
}
