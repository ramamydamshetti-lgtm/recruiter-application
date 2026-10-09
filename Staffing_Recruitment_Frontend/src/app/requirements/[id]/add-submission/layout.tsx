import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Add Submission',
};

export default function AddSubmissionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
