import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Requirement Details',
};

export default function RequirementDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
