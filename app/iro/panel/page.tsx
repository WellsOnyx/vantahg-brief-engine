import type { Metadata } from 'next';
import { AssignmentPanel } from '@/components/iro/AssignmentPanel';

export const metadata: Metadata = { title: 'IRO Panel' };

export default function IroPanelPage() {
  return <AssignmentPanel />;
}
