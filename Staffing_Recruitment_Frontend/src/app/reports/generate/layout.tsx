import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Report Generation',
};

export default function ReportGenerationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
