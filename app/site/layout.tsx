import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'VantaUM — Vanta Med Review',
  description:
    'Vanta Med Review is the only product we sell. The Brief Engine is included only under that contract. Not a standalone UM product. Not included with another shop’s review. IRO and IDR are separate lines.',
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
