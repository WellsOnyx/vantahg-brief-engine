import type { Metadata } from 'next';
import { DemoDisabled } from '@/components/vhg/DemoDisabled';
import { VHG_BRAND } from '@/lib/vhg/brand';
import { isVhgScoreDemoEnabled } from '@/lib/vhg/flag';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Stop-loss partner',
  description: `Synthetic ${VHG_BRAND} Score demo for stop-loss partners. De-identified. Advisory only.`,
  robots: { index: false, follow: false },
};

export default function StoplossLayout({ children }: { children: React.ReactNode }) {
  if (!isVhgScoreDemoEnabled()) return <DemoDisabled />;
  return children;
}
