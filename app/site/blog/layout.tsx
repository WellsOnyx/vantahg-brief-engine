import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blog — VantaUM',
  description: 'Insights on utilization management, AI in healthcare, and the future of prior authorization.',
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
