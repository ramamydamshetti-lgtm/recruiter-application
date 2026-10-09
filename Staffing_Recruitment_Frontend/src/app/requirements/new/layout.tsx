import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'New Requirement',
};

export default function NewRequirementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
