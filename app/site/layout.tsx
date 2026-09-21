import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'VantaUM — Included with VantaHG Med Review',
  description:
    'VantaUM Brief Engine is included only when you use Vanta med review. Not a standalone UM product. Not included with another shop’s review.',
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
