import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Work',
};

export default function MyWorkLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
