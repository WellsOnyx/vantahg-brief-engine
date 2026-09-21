import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'VantaUM — Med Review sold by VantaUM',
  description:
    'VantaUM sells Med Review. Brief Engine is included free only under UM’s contract. Not a standalone UM product. Not included with another shop’s review. VantaHG is IRO and IDR only.',
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
