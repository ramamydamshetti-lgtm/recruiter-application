import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'New Candidate',
};

export default function NewCandidateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
