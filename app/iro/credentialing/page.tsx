import type { Metadata } from 'next';
import { CredentialingWorkspace } from '@/components/iro/CredentialingWorkspace';

export const metadata: Metadata = { title: 'IRO Credentialing' };

export default function IroCredentialingPage() {
  return <CredentialingWorkspace />;
}
