import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blog — VantaUM',
  description: 'Insights on medical review, clinical briefs, and prior authorization.',
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
