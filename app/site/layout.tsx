import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'VantaUM — Utilization Management, Elevated',
  description:
    'AI that makes UM more human, not less. VantaUM pairs a concierge team and elite same-specialty physicians with AI engineered to eliminate friction.',
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
