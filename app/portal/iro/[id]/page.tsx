import type { Metadata } from 'next';
import { IroCaseFile } from '@/components/iro/IroCaseDesk';

export const metadata: Metadata = {
  title: 'IRO case',
  robots: { index: false, follow: false },
};

export default async function IroCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <IroCaseFile caseId={id} />;
}
