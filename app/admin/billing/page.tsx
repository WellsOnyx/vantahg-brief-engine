'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient, hasBrowserSupabaseConfig } from '@/lib/supabase-browser';
import type { Client, OnboardingStatus } from '@/lib/types';

/**
 * Local role type. The shared `BillingRole` in `lib/auth-guard.ts` is narrower
 * than the full org role set (it does not yet include `ceo` / `slt`); rather
 * than mutate the shared lib (out of scope for this surface), we widen here
 * and let the orchestrator broaden the shared type when those roles are
 * formalised across the codebase.
 */
type BillingRole = 'admin' | 'reviewer' | 'client' | 'ceo' | 'slt';

/**
 * Local mirror of the relevant slice of `UsageMetricsLite` from
 * `lib/usage-metrics.ts`. We only render `briefs.generated_count`,
 * `tokens.estimated_cost_usd`, and `period.label`; mirroring the shape keeps
 * us decoupled from the (admin-only) module without dragging a server import
 * into a client component.
 */
interface UsageMetricsLite {
  period: { label: string };
  briefs: { generated_count: number };
  tokens: { estimated_cost_usd: number };
}

/**
 * Meow Billing — founder-facing billing dashboard (Phase 1).
 *
 * Role-gated to 'admin', 'ceo', 'slt'. Non-permitted users see a clean
 * access-denied state. Demo mode (no Supabase configured) treats the
 * viewer as admin so the page is reachable in local/preview deploys.
 *
 * Phase 1 = foundation. Revenue numbers are stubs ($15K/mo per client,
 * fixed $2.40 PEPM). Real Stripe + member-count plumbing lands in Phase 2.
 * The Anthropic cost line and brief volume are real (sourced from
 * /api/admin/usage-metrics).
 */

const ALLOWED_ROLES: BillingRole[] = ['admin', 'ceo', 'slt'];

// Stub pricing assumptions — replace once Stripe + real PEPM source land.
const STUB_MRR_PER_CLIENT_USD = 15_000;
const STUB_PEPM_USD = 2.4;

type GateState =
  | { kind: 'loading' }
  | { kind: 'allowed'; email: string | null; role: BillingRole }
  | { kind: 'denied'; reason: 'unauth' | 'role' };

const ONBOARDING_LABEL: Record<OnboardingStatus, string> = {
  pending: 'Pending',
  credentials_needed: 'Credentials Needed',
  active: 'Active',
  suspended: 'Suspended',
};

const ONBOARDING_PILL: Record<OnboardingStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  credentials_needed: 'bg-blue-100 text-blue-800 border-blue-200',
  active: 'bg-green-100 text-green-800 border-green-200',
  suspended: 'bg-red-100 text-red-800 border-red-200',
};

// ── Page ───────────────────────────────────────────────────────────────────

export default function AdminBillingPage() {
  const [gate, setGate] = useState<GateState>({ kind: 'loading' });
  const [metrics, setMetrics] = useState<UsageMetricsLite | null>(null);
  const [clients, setClients] = useState<Client[] | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  // ── Role gate ─────────────────────────────────────────────────────────
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

      const role = (profile?.role as BillingRole | undefined) ?? 'reviewer';

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

  // ── Data fetch (only after gate allows) ───────────────────────────────
  useEffect(() => {
    if (gate.kind !== 'allowed') return;
    let cancelled = false;

    async function loadData() {
      try {
        const [metricsRes, clientsRes] = await Promise.all([
          fetch('/api/admin/usage-metrics'),
          fetch('/api/clients'),
        ]);

        if (metricsRes.ok) {
          const m = (await metricsRes.json()) as UsageMetricsLite;
          if (!cancelled) setMetrics(m);
        } else if (!cancelled) {
          // Non-fatal — the page still renders with zeros and the rest
          // of the surface remains useful.
          setMetrics(null);
        }

        if (clientsRes.ok) {
          const c = (await clientsRes.json()) as Client[];
          if (!cancelled) setClients(c);
        } else if (!cancelled) {
          setClients([]);
          setDataError(`Failed to load clients (${clientsRes.status})`);
        }
      } catch {
        if (!cancelled) {
          setDataError('Failed to load billing data');
          setClients(clients ?? []);
        }
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate.kind]);

  // ── Gate states ───────────────────────────────────────────────────────
  if (gate.kind === 'loading') {
    return (
      <Frame>
        <div className="text-muted">Loading Billing…</div>
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
            Billing — admin access required
          </h1>
          <p className="text-muted text-sm leading-relaxed mb-6">
            {gate.reason === 'unauth'
              ? 'Sign in with an admin, CEO, or SLT account to view the Meow billing dashboard.'
              : 'Your account does not have access to billing. Ask an admin to grant the admin, CEO, or SLT role if you need it.'}
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
                href="/login?redirect=/admin/billing"
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

  // ── Allowed view ──────────────────────────────────────────────────────
  const clientCount = clients?.length ?? 0;
  const stubMrr = clientCount * STUB_MRR_PER_CLIENT_USD;
  const briefsThisMonth = metrics?.briefs.generated_count ?? 0;
  const estimatedAnthropicCost = metrics?.tokens.estimated_cost_usd ?? 0;

  return (
    <Frame>
      {/* Header */}
      <div className="mb-10 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-[family-name:var(--font-dm-serif)] text-4xl md:text-5xl text-navy">
              Billing
            </h1>
            <StubPill />
          </div>
          <p className="text-muted mt-2 text-lg">
            Phase 1 — Meow billing foundation
          </p>
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

      {/* Top-line revenue cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 mb-10">
        <HeroKpi
          label="MRR"
          value={`$${(stubMrr / 1000).toFixed(0)}K`}
          sub={`${clientCount} client${clientCount === 1 ? '' : 's'} × $15K / mo`}
          tone="green"
          stub
        />
        <HeroKpi
          label="PEPM"
          value={`$${STUB_PEPM_USD.toFixed(2)}`}
          sub="Per member, per month"
          tone="navy"
          stub
        />
        <HeroKpi
          label="This Month's Briefs"
          value={briefsThisMonth.toLocaleString()}
          sub={metrics ? `Period · ${metrics.period.label}` : 'Loading…'}
          tone="navy"
        />
        <HeroKpi
          label="Estimated Anthropic Cost"
          value={`$${estimatedAnthropicCost.toFixed(2)}`}
          sub="Claude Opus 4.6 · MTD"
          tone="amber"
        />
      </div>

      {/* Per-client breakdown */}
      <section className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden mb-10">
        <div className="px-6 pt-6 pb-3 flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-sm text-navy uppercase tracking-wide">
              Per-Client Billing
            </h2>
            <p className="text-xs text-muted mt-1">
              Contracted SLA, stub MRR + PEPM, and invoice action per TPA
            </p>
          </div>
          <span className="text-[11px] text-muted italic">
            Stub revenue · real client roster
          </span>
        </div>

        {clients === null ? (
          <div className="px-6 py-10 text-sm text-muted">Loading clients…</div>
        ) : clients.length === 0 ? (
          <div className="px-6 py-10 text-sm text-muted">
            <p className="text-navy font-medium mb-1">No clients yet</p>
            <p>
              Run{' '}
              <code className="px-1.5 py-0.5 rounded bg-gray-100 text-navy font-mono text-xs">
                scripts/bootstrap-real-client.ts
              </code>{' '}
              to seed your first TPA, then refresh this page.
            </p>
            {dataError && (
              <p className="mt-3 text-amber-700 text-xs">{dataError}</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <Th>Client</Th>
                  <Th>Onboarding</Th>
                  <Th>Contracted SLA</Th>
                  <Th>MRR</Th>
                  <Th>PEPM</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {clients.map((c) => (
                  <ClientRow key={c.id} client={c} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Coming in Phase 2 */}
      <section className="mb-10">
        <div className="flex items-end justify-between mb-3">
          <h2 className="font-semibold text-sm text-navy uppercase tracking-wide">
            Coming in Phase 2
          </h2>
          <span className="text-[11px] text-muted italic">
            Roadmap · backends not yet wired
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <PhaseTwoCard
            title="Stripe Integration"
            blurb="Payment processing, card-on-file, ACH for TPA invoices."
          />
          <PhaseTwoCard
            title="Invoice PDFs"
            blurb="Automated monthly invoices rendered + emailed on day 1."
          />
          <PhaseTwoCard
            title="Usage-based PEPM"
            blurb="Real member counts pulled from each TPA's eligibility feed."
          />
        </div>
      </section>

      {/* Footnote */}
      <p className="text-[11px] text-muted italic">
        Stub revenue numbers shown. Connect Stripe + member-count source in
        Phase 2 to make real.
      </p>
    </Frame>
  );
}

// ── Row ────────────────────────────────────────────────────────────────────

function ClientRow({ client }: { client: Client }) {
  const onboarding = client.onboarding_status;
  const isActive = onboarding === 'active';

  return (
    <tr className="hover:bg-gray-50">
      <Td>
        <div className="font-semibold text-navy">{client.name}</div>
        {client.contact_email && (
          <div className="text-[11px] text-muted mt-0.5">{client.contact_email}</div>
        )}
      </Td>
      <Td>
        <span
          className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${ONBOARDING_PILL[onboarding]}`}
        >
          {ONBOARDING_LABEL[onboarding]}
        </span>
      </Td>
      <Td>
        {client.contracted_sla_hours !== null ? (
          <span className="text-navy/80">
            {client.contracted_sla_hours}h
          </span>
        ) : (
          <span className="text-muted text-xs">—</span>
        )}
      </Td>
      <Td>
        <span className="font-mono text-navy/90">$15,000</span>
        <span className="ml-1 text-[10px] text-amber-700 font-semibold uppercase">
          stub
        </span>
      </Td>
      <Td>
        <span className="font-mono text-navy/90">$2.40</span>
        <span className="ml-1 text-[10px] text-amber-700 font-semibold uppercase">
          stub
        </span>
      </Td>
      <Td>
        <span
          className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
            isActive
              ? 'bg-green-100 text-green-800 border-green-200'
              : 'bg-amber-100 text-amber-800 border-amber-200'
          }`}
        >
          {isActive ? 'Active' : 'Pending'}
        </span>
      </Td>
      <Td className="text-right">
        <button
          type="button"
          disabled
          title="Generate Invoice — Phase 2"
          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-gray-100 text-muted text-xs font-semibold cursor-not-allowed border border-border"
        >
          Invoice
        </button>
      </Td>
    </tr>
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
      title="Revenue numbers are placeholder stubs. Real billing keys not connected."
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      Stub revenue numbers
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
  stub = false,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'navy' | 'green' | 'amber' | 'red';
  stub?: boolean;
}) {
  return (
    <div
      className={`relative bg-surface rounded-2xl border border-border p-6 shadow-sm ring-1 ${TONE_RING[tone]}`}
    >
      {stub && (
        <span
          title="Stub value — not wired to a real source."
          className="absolute top-3 right-3 text-[9px] font-semibold uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded"
        >
          Stub
        </span>
      )}
      <div className="text-xs text-muted uppercase tracking-wide font-medium mb-2">
        {label}
      </div>
      <div
        className={`text-3xl font-[family-name:var(--font-dm-serif)] ${TONE_TEXT[tone]}`}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-muted mt-2">{sub}</div>}
    </div>
  );
}

function PhaseTwoCard({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="bg-surface rounded-xl border border-border p-5 shadow-sm flex flex-col gap-2 hover:border-gold/40 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-navy text-sm">{title}</h3>
        <span className="text-[9px] font-semibold uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
          Phase 2
        </span>
      </div>
      <p className="text-xs text-muted leading-relaxed">{blurb}</p>
    </div>
  );
}

function Th({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`px-4 py-3 text-left font-semibold ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}
