'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient, hasBrowserSupabaseConfig } from '@/lib/supabase-browser';
import type { UserRole } from '@/lib/auth-guard';

/**
 * Builders View — growth + product team operations console.
 *
 * Role-gated to 'builder', 'admin', 'ceo'. Non-permitted users see a
 * clean access-denied state. Demo mode (no Supabase configured) treats
 * the viewer as admin so the page is reachable in local/preview deploys.
 *
 * Data here is stub-only — the surface is meant to anchor the upcoming
 * growth tooling (mass email, CRM, waitlist, demo gen, SDK starter).
 */

const ALLOWED_ROLES: UserRole[] = ['builder', 'admin', 'ceo'];

type GateState =
  | { kind: 'loading' }
  | { kind: 'allowed'; email: string | null; role: UserRole }
  | { kind: 'denied'; reason: 'unauth' | 'role' };

// ── Stub data ──────────────────────────────────────────────────────────────

const STUB_KPIS = {
  active_prospects: 12,
  demo_calls_this_week: 3,
  pipeline_arr_usd: 480_000,
  conversion_pct: 23,
};

type Stage = 'Lead' | 'Demo' | 'Pilot' | 'Live';

interface ProspectRow {
  company: string;
  stage: Stage;
  last_contact: string;
  owner: string;
  next_step: string;
}

const STUB_PIPELINE: ProspectRow[] = [
  {
    company: 'Valenz Health',
    stage: 'Demo',
    last_contact: 'May 9, 2026',
    owner: 'Cole',
    next_step: 'Wed 15-min demo · technical deep-dive',
  },
  {
    company: 'Marpai Health',
    stage: 'Pilot',
    last_contact: 'May 6, 2026',
    owner: 'Cole',
    next_step: 'Pilot scoping doc · 1,500 lives subset',
  },
  {
    company: 'HealthComp',
    stage: 'Lead',
    last_contact: 'May 4, 2026',
    owner: 'Growth',
    next_step: 'Intro call · TPA ops lead',
  },
  {
    company: 'Allied Benefit Systems',
    stage: 'Demo',
    last_contact: 'May 2, 2026',
    owner: 'Growth',
    next_step: 'Send recorded demo + ROI one-pager',
  },
  {
    company: 'Nova Healthcare Admin.',
    stage: 'Lead',
    last_contact: 'Apr 30, 2026',
    owner: 'Growth',
    next_step: 'Warm intro via Notion network',
  },
  {
    company: 'Trustmark Health Benefits',
    stage: 'Live',
    last_contact: 'May 10, 2026',
    owner: 'Cole',
    next_step: 'Expansion: add behavioral health line',
  },
];

interface ToolCard {
  label: string;
  blurb: string;
  status: 'coming-soon' | 'beta';
}

const TOOLS: ToolCard[] = [
  {
    label: 'Mass Email',
    blurb: 'Drip + broadcast to TPA decision-makers from a verified domain.',
    status: 'coming-soon',
  },
  {
    label: 'Prospect CRM',
    blurb: 'Lightweight pipeline tracker tuned for TPA sales motion.',
    status: 'coming-soon',
  },
  {
    label: 'Waitlist & Invites',
    blurb: 'Capture interest, gate access, send signed invite tokens.',
    status: 'coming-soon',
  },
  {
    label: 'Demo Generator',
    blurb: 'Spin a sandboxed VantaUM tenant pre-seeded with realistic cases.',
    status: 'coming-soon',
  },
  {
    label: 'SDK Starter',
    blurb: 'Drop-in API client + sample app for partners integrating intake.',
    status: 'coming-soon',
  },
];

// ── Page ───────────────────────────────────────────────────────────────────

export default function BuildersPage() {
  const [gate, setGate] = useState<GateState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function resolveRole() {
      // Demo mode (no Supabase config) — treat as admin.
      if (!hasBrowserSupabaseConfig()) {
        if (!cancelled) {
          setGate({ kind: 'allowed', email: 'demo@vantaum.com', role: 'admin' });
        }
        return;
      }

      const browser = createBrowserClient();
      if (!browser) {
        if (!cancelled) {
          setGate({ kind: 'allowed', email: 'demo@vantaum.com', role: 'admin' });
        }
        return;
      }

      const {
        data: { user },
      } = await browser.auth.getUser();

      if (!user) {
        if (!cancelled) setGate({ kind: 'denied', reason: 'unauth' });
        return;
      }

      const { data: profile } = await browser
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const role = (profile?.role as UserRole | undefined) ?? 'reviewer';

      if (!ALLOWED_ROLES.includes(role)) {
        if (!cancelled) setGate({ kind: 'denied', reason: 'role' });
        return;
      }

      if (!cancelled) {
        setGate({ kind: 'allowed', email: user.email ?? null, role });
      }
    }

    resolveRole();
    return () => {
      cancelled = true;
    };
  }, []);

  if (gate.kind === 'loading') {
    return (
      <Frame>
        <div className="text-muted">Loading Builders View…</div>
      </Frame>
    );
  }

  if (gate.kind === 'denied') {
    return (
      <Frame>
        <div className="bg-surface rounded-xl border border-border shadow-sm p-10 max-w-2xl">
          <div className="text-[11px] uppercase tracking-widest text-amber-700 font-semibold mb-2">
            Access denied
          </div>
          <h1 className="font-[family-name:var(--font-dm-serif)] text-3xl text-navy mb-3">
            Builders View — requires builder access
          </h1>
          <p className="text-muted text-sm leading-relaxed mb-6">
            {gate.reason === 'unauth'
              ? 'Sign in with a builder, admin, or CEO account to view the growth + product roster.'
              : 'Your account does not have access to the Builders View. Ask an admin to grant the builder role if you need it.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center px-4 py-2 rounded-lg bg-navy text-white text-sm font-semibold hover:bg-navy-light transition-colors"
            >
              Back to dashboard
            </Link>
            {gate.reason === 'unauth' && (
              <Link
                href="/login?redirect=/builders"
                className="inline-flex items-center px-4 py-2 rounded-lg border border-border text-navy text-sm font-semibold hover:border-gold transition-colors"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </Frame>
    );
  }

  // ── Allowed view ────────────────────────────────────────────────────────
  return (
    <Frame>
      {/* Header */}
      <div className="mb-10 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-[family-name:var(--font-dm-serif)] text-4xl md:text-5xl text-navy">
              Builders View
            </h1>
            <StubPill />
          </div>
          <p className="text-muted mt-2 text-lg">Growth + product roster</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted">Signed in</div>
          <div className="text-sm text-navy font-medium">
            {gate.email ?? '—'}
            <span className="ml-2 inline-block px-2 py-0.5 rounded-full bg-navy/10 text-navy text-[10px] font-semibold uppercase tracking-wider border border-navy/20">
              {gate.role}
            </span>
          </div>
        </div>
      </div>

      {/* Hero KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 mb-10">
        <HeroKpi
          label="Active Prospects"
          value={STUB_KPIS.active_prospects.toLocaleString()}
          sub="TPAs in the funnel"
          tone="navy"
        />
        <HeroKpi
          label="Demo Calls This Week"
          value={STUB_KPIS.demo_calls_this_week.toLocaleString()}
          sub="Booked · May 11 – May 17"
          tone="navy"
        />
        <HeroKpi
          label="Deals in Pipeline"
          value={`$${(STUB_KPIS.pipeline_arr_usd / 1000).toFixed(0)}K ARR`}
          sub="Weighted by stage probability"
          tone="green"
        />
        <HeroKpi
          label="Conversion Rate"
          value={`${STUB_KPIS.conversion_pct}%`}
          sub="Lead → Pilot, trailing 90 days"
          tone="amber"
        />
      </div>

      {/* Pipeline */}
      <section className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden mb-10">
        <div className="px-6 pt-6 pb-3 flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-sm text-navy uppercase tracking-wide">
              Pipeline
            </h2>
            <p className="text-xs text-muted mt-1">
              TPAs across the sales funnel · Lead → Demo → Pilot → Live
            </p>
          </div>
          <span className="text-[11px] text-muted italic">Stub data</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-muted">
              <tr>
                <Th>Company</Th>
                <Th>Stage</Th>
                <Th>Last Contact</Th>
                <Th>Owner</Th>
                <Th>Next Step</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {STUB_PIPELINE.map((row) => (
                <tr key={row.company} className="hover:bg-gray-50">
                  <Td>
                    <div className="font-semibold text-navy">{row.company}</div>
                  </Td>
                  <Td>
                    <StageBadge stage={row.stage} />
                  </Td>
                  <Td>
                    <span className="text-navy/80">{row.last_contact}</span>
                  </Td>
                  <Td>
                    <span className="text-navy/80">{row.owner}</span>
                  </Td>
                  <Td>
                    <span className="text-navy/70">{row.next_step}</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Tools */}
      <section className="mb-10">
        <div className="flex items-end justify-between mb-3">
          <h2 className="font-semibold text-sm text-navy uppercase tracking-wide">
            Tools
          </h2>
          <span className="text-[11px] text-muted italic">
            Quick links · not yet wired to backends
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {TOOLS.map((t) => (
            <ToolTile key={t.label} tool={t} />
          ))}
        </div>
      </section>

      {/* Footnote */}
      <p className="text-[11px] text-muted italic">
        Numbers and pipeline rows on this page are stubbed for the demo. Wire to a
        real CRM / analytics source before relying on them operationally.
      </p>
    </Frame>
  );
}

// ── Presentational ─────────────────────────────────────────────────────────

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-10 md:py-16 bg-background min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">{children}</div>
    </div>
  );
}

function StubPill() {
  return (
    <span
      title="All numbers on this page are placeholder stubs. Backends not yet wired."
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      Stub data
    </span>
  );
}

const TONE_TEXT: Record<string, string> = {
  navy: 'text-navy',
  green: 'text-green-700',
  amber: 'text-amber-700',
  red: 'text-red-700',
};

const TONE_RING: Record<string, string> = {
  navy: 'ring-navy/20',
  green: 'ring-green-200',
  amber: 'ring-amber-200',
  red: 'ring-red-200',
};

function HeroKpi({
  label,
  value,
  sub,
  tone = 'navy',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'navy' | 'green' | 'amber' | 'red';
}) {
  return (
    <div
      className={`relative bg-surface rounded-2xl border border-border p-6 shadow-sm ring-1 ${TONE_RING[tone]}`}
    >
      <span
        title="Stub value — not wired to a real source."
        className="absolute top-3 right-3 text-[9px] font-semibold uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded"
      >
        Stub
      </span>
      <div className="text-[11px] text-muted uppercase tracking-widest font-semibold mb-3">
        {label}
      </div>
      <div
        className={`text-4xl md:text-5xl font-[family-name:var(--font-dm-serif)] leading-none ${TONE_TEXT[tone]}`}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-muted mt-3">{sub}</div>}
    </div>
  );
}

const STAGE_PILL: Record<Stage, string> = {
  Lead: 'bg-blue-100 text-blue-800 border-blue-200',
  Demo: 'bg-amber-100 text-amber-800 border-amber-200',
  Pilot: 'bg-purple-100 text-purple-800 border-purple-200',
  Live: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${STAGE_PILL[stage]}`}
    >
      {stage}
    </span>
  );
}

function ToolTile({ tool }: { tool: ToolCard }) {
  return (
    <a
      href="#"
      title="Coming soon — not yet wired up"
      onClick={(e) => e.preventDefault()}
      className="group bg-surface rounded-xl border border-border p-5 shadow-sm hover:border-gold hover:shadow-md transition-all cursor-not-allowed"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="text-sm font-semibold text-navy group-hover:text-gold-dark transition-colors">
          {tool.label}
        </div>
        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
          {tool.status === 'beta' ? 'Beta' : 'Coming soon'}
        </span>
      </div>
      <p className="text-xs text-muted leading-relaxed">{tool.blurb}</p>
    </a>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 text-left font-semibold ${className}`}>{children}</th>;
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}
