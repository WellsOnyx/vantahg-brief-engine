import type { Metadata } from 'next';
import { IroQueue } from '@/components/iro/IroCaseDesk';

export const metadata: Metadata = {
  title: 'IRO case desk',
  robots: { index: false, follow: false },
};

export default function IroQueuePage() {
  return <IroQueue />;
}
