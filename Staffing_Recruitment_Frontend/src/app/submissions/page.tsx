import dynamic from 'next/dynamic';

const AllSubmissionsPage = dynamic(
  () =>
    import('@/components/screens/AllSubmissionsPage').then(
      (mod) => mod.AllSubmissionsPage,
    ),
  {
    loading: () => <div className="p-8">Loading submissions...</div>,
  },
);

export default function SubmissionsRoute() {
  return <AllSubmissionsPage />;
}
