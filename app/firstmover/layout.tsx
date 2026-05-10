import Link from 'next/link';
import type { ReactNode } from 'react';
import { getReleaseTrack } from '@/lib/firstmover/release-track';

export const metadata = {
  title: 'VantaUM — First Mover',
  description: 'Manual-first MVP intake engine for VantaUM utilization management.',
};

export default function FirstMoverLayout({ children }: { children: ReactNode }) {
  const track = getReleaseTrack();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="bg-amber-100 border-b border-amber-300 text-amber-900 text-xs px-4 py-1.5 text-center">
        <strong>First Mover</strong> — manual MVP. Synthetic data only until BAA scope confirmed.
        {track !== 'firstmover' && (
          <span className="ml-2 italic opacity-70">(dev preview — RELEASE_TRACK not set)</span>
        )}
      </div>
      <header className="bg-[#0c2340] text-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/firstmover" className="font-serif text-lg tracking-tight">
            VantaUM <span className="text-[#c9a227]">/ First Mover</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/firstmover/intake/call" className="hover:text-[#c9a227]">Concierge intake</Link>
            <Link href="/firstmover/triage" className="hover:text-[#c9a227]">Triage</Link>
            <Link href="/firstmover/queue" className="hover:text-[#c9a227]">Clinician queue</Link>
            <Link href="/firstmover/portal" className="hover:text-[#c9a227]">Provider portal</Link>
            <Link href="/firstmover/admin/gravity-rails" className="hover:text-[#c9a227] opacity-80">Gravity Rails</Link>
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
