import { SubmissionDetailClient } from './SubmissionDetailClient';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function SubmissionDetailPage({ params }: Props) {
  const { id } = await params;
  return <SubmissionDetailClient id={id} />;
}
