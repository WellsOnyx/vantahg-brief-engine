import type { Metadata } from 'next';
import { ApprovalQueue } from '@/components/iro/ApprovalQueue';

export const metadata: Metadata = { title: 'IRO Panel Approval' };

export default function IroApprovalPage() {
  return <ApprovalQueue />;
}
