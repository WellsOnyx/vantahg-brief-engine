import type { Metadata } from 'next';
import { IroPublicDemo } from '@/components/iro/IroPublicDemo';
import { buildIroPublicDemo } from '@/lib/iro/public-demo';

export const metadata: Metadata = {
  title: 'IRO portal demo',
  description: 'Synthetic Ohio IRO walkthrough. Demo data only. Not a live case feed.',
  robots: { index: false, follow: false },
};

export default function IroPublicDemoPage() {
  return <IroPublicDemo demo={buildIroPublicDemo()} />;
}
