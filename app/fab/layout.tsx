import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Onyx Semiconductor — Domestic Fab for Strategic Supply Chain Resilience',
  description:
    'Domestic semiconductor manufacturing optimized for short-run custom production. 7nm-capable microfabs, PCB redesign library, and secure supply chain. A Wells Onyx company.',
};

export default function FabLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
