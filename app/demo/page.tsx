'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * /demo — THE demo hub. The single link a prospect ever needs.
 *
 * The demo-unlock flow already lands here (/api/verify-demo-password?pw=…
 * sets the demo_access cookie and redirects to /demo), so one URL unlocks
 * and presents everything: guided experiences for a call, and the live
 * platform surfaces on synthetic data.
 *
 * Chromeless (app/demo/layout.tsx). All data synthetic — no PHI, ever.
 */

interface DemoCard {
  href: string;
  title: string;
  blurb: string;
  icon: string;
  tag?: string;
}

const GUIDED: DemoCard[] = [
  {
    href: '/demo-tour',
    title: 'Guided Tour',
    blurb: 'The prospect-call walkthrough — one authorization from received to determined, narrated step by step.',
    icon: '🧭',
    tag: 'start here',
  },
  {
    href: '/cockpit',
    title: 'Pod Day Gauntlet',
    blurb: 'A full clinical day in the command cockpit — volume, SLAs, and the team absorbing it in real time.',
    icon: '🚀',
  },
  {
    href: '/demo/walkthrough',
    title: 'Case Walkthrough',
    blurb: 'Watch a single case build itself: intake, extraction, AI brief, fact-check, physician determination.',
    icon: '🎬',
  },
  {
    href: '/interactive-demo',
    title: 'Interactive Demo',
    blurb: 'Pick a role and drive the workflow yourself — no login, all simulated.',
    icon: '🕹️',
  },
];

const PLATFORM: DemoCard[] = [
  {
    href: '/system',
    title: 'The 10,000-Foot View',
    blurb: 'How the whole machine works — pipeline, live telemetry, and the engineering that is hard to replicate.',
    icon: '🛰️',
    tag: 'the big picture',
  },
  {
    href: '/concierge',
    title: 'Concierge (CX) Dashboard',
    blurb: 'The member-facing front line: live intake pulse across every channel, follow-ups, the human touch.',
    icon: '🎧',
  },
  {
    href: '/medical-review',
    title: 'Medical Review Dashboard',
    blurb: 'The clinical seat: AI-signaled worklist in SLA order, brief quality, and the wall between AI and decisions.',
    icon: '🩺',
  },
  {
    href: '/command-center',
    title: 'Executive Command Center',
    blurb: 'Volume, SLA posture, bottlenecks, and case flow at the leadership altitude.',
    icon: '📈',
  },
  {
    href: '/portal/tpa',
    title: 'TPA Client Portal',
    blurb: 'What your team sees: network cases, submissions, practices, billing.',
    icon: '🏢',
  },
  {
    href: '/cases/case-003-infliximab-j1745',
    title: 'Case Deep-Dive',
    blurb: 'One real case object, all the way down — AI brief, deterministic fact-check, criteria match, audit trail.',
    icon: '🔬',
  },
];

function hasDemoAccess(): boolean {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') return true;
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some((c) => c.trim() === 'demo_access=granted');
}

function Card({ card }: { card: DemoCard }) {
  return (
    <Link
      href={card.href}
      className="group relative rounded-2xl border border-white/10 bg-white/[0.03] p-5 hover:border-gold/50 hover:bg-white/[0.06] transition-all flex flex-col"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-2xl" aria-hidden>{card.icon}</span>
        {card.tag && (
          <span className="text-[9px] uppercase tracking-[0.14em] font-semibold text-gold border border-gold/40 rounded-full px-2 py-0.5">
            {card.tag}
          </span>
        )}
      </div>
      <h3 className="font-[family-name:var(--font-display)] text-xl text-white mt-3">{card.title}</h3>
      <p className="text-[13px] text-white/55 leading-relaxed mt-1.5 flex-1">{card.blurb}</p>
      <span className="text-xs text-gold mt-3 inline-flex items-center gap-1.5 group-hover:gap-2.5 transition-all">
        Open <span aria-hidden>→</span>
      </span>
    </Link>
  );
}

export default function DemoHubPage() {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setUnlocked(hasDemoAccess()), 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen bg-[#081a30] text-white font-[family-name:var(--font-dm-sans)]">
      {/* Header */}
      <header className="px-6 md:px-12 pt-12 pb-8 max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-[#c9a227] to-[#d4b54a] rounded-lg flex items-center justify-center font-bold text-[#0c2340] shadow-lg shadow-[#c9a227]/20">V</div>
            <span className="text-2xl tracking-tight font-[family-name:var(--font-display)]">
              Vanta<span className="text-gold">UM</span>
            </span>
          </div>
          <span className="text-[10px] uppercase tracking-wide text-white/40 border border-white/15 rounded-full px-2.5 py-1">
            demo environment · synthetic data · no PHI
          </span>
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl md:text-5xl leading-tight mt-8 max-w-3xl">
          Every seat at the table.<br />One place to see them all.
        </h1>
        <p className="text-white/60 mt-4 max-w-2xl text-sm md:text-base leading-relaxed">
          Guided experiences for a call, and the live platform on synthetic data. Inside the
          platform views, use the <span className="text-gold font-semibold">&ldquo;Viewing as&rdquo;</span> switcher
          (bottom-right) to flip between Concierge, Medical Review, Delivery Lead, Executive, and the
          TPA portal without ever leaving the app.
        </p>

        {unlocked === false && (
          <div className="mt-5 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 max-w-2xl">
            <p className="text-sm text-amber-200">
              The live platform views are locked on this deployment.{' '}
              <Link href="/demo-password" className="underline font-semibold hover:text-white">
                Enter the demo password
              </Link>{' '}
              (or open the unlock link you were sent) and come back — the guided tours below work either way.
            </p>
          </div>
        )}
      </header>

      {/* Guided experiences */}
      <section className="px-6 md:px-12 py-6 max-w-6xl mx-auto">
        <p className="text-[11px] uppercase tracking-[0.24em] text-gold font-semibold mb-4">Guided experiences</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {GUIDED.map((c) => <Card key={c.href} card={c} />)}
        </div>
      </section>

      {/* Live platform */}
      <section className="px-6 md:px-12 py-6 max-w-6xl mx-auto pb-16">
        <p className="text-[11px] uppercase tracking-[0.24em] text-gold font-semibold mb-4">The live platform · synthetic data</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PLATFORM.map((c) => <Card key={c.href} card={c} />)}
        </div>

        <p className="text-[11px] text-white/30 mt-10">
          VantaUM — a Wells Onyx service. Everything on these pages is simulated; production runs the
          same engine against real intake with a human clinician deciding every case.
        </p>
      </section>
    </div>
  );
}
