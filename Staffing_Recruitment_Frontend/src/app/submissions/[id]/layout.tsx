import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Submission Details',
};

export default function SubmissionDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
