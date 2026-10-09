import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Submissions',
};

export default function SubmissionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
