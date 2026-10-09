import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Edit Requirement',
};

export default function EditRequirementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
