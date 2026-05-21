'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient, hasBrowserSupabaseConfig } from '@/lib/supabase-browser';
import type { UserRole } from '@/lib/auth-guard';
import type { UsageMetrics } from '@/lib/usage-metrics';

/**
 * Office of the CEO — executive strategic dashboard.
 *
 * Distinct from Mission Control (cross-tenant ops) and Usage & Cost (detail
 * ops). This page is the "board view": revenue, customers, growth posture,
 * and strategic risks/opportunities. Mixes real ops metrics (from
 * /api/admin/usage-metrics) with stubbed revenue figures pending the
 * billing/CRM data layer.
 *
 * Access is gated to ceo / slt / admin via the user_profiles.role lookup,
 * with a demo-mode fast-path that treats the user as admin so the page
 * remains demoable without Supabase.
 */

const PERMITTED_ROLES: ReadonlyArray<UserRole> = ['ceo', 'slt', 'admin'];

type GateState =
  | { kind: 'loading' }
  | { kind: 'denied' }
  | { kind: 'ok'; role: UserRole };

export default function OfficeCeoPage() {
  const [gate, setGate] = useState<GateState>({ kind: 'loading' });
  const [metrics, setMetrics] = useState<UsageMetrics | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  // ── Role gate ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function checkRole() {
      // Demo mode (no browser supabase config) — treat as admin so the
      // exec page is fully demoable without provisioning auth.
      if (!hasBrowserSupabaseConfig()) {
        if (!cancelled) setGate({ kind: 'ok', role: 'admin' });
        return;
      }

      const browser = createBrowserClient();
      if (!browser) {
        if (!cancelled) setGate({ kind: 'ok', role: 'admin' });
        return;
      }

      const { data: { user } } = await browser.auth.getUser();
      if (!user) {
        if (!cancelled) setGate({ kind: 'denied' });
        return;
      }

      const { data: profile } = await browser
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const role = (profile?.role as UserRole | undefined) ?? null;
      if (role && (PERMITTED_ROLES as readonly string[]).includes(role)) {
        if (!cancelled) setGate({ kind: 'ok', role });
      } else {
        if (!cancelled) setGate({ kind: 'denied' });
      }
    }

    checkRole();
    return () => { cancelled = true; };
  }, []);

  // ── Real ops metrics ─────────────────────────────────────────────────
  useEffect(() => {
    if (gate.kind !== 'ok') return;
    let cancelled = false;

    async function loadMetrics() {
      try {
        const res = await fetch('/api/admin/usage-metrics');
        if (!res.ok) {
          if (!cancelled) {
            setMetricsError(
              res.status === 403
                ? 'Operational metrics require admin role'
                : `Could not load metrics (${res.status})`,
            );
          }
          return;
        }
        const data = (await res.json()) as UsageMetrics;
        if (!cancelled) setMetrics(data);
      } catch {
        if (!cancelled) setMetricsError('Could not load metrics');
      }
    }
    loadMetrics();
    return () => { cancelled = true; };
  }, [gate]);

  if (gate.kind === 'loading') {
    return (
      <Frame>
        <div className="text-muted">Loading executive view…</div>
      </Frame>
    );
  }

  if (gate.kind === 'denied') {
    return (
      <Frame>
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-10 max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-navy/10 mb-4">
            <svg className="w-6 h-6 text-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
 <h1 className="text-3xl text-navy mb-2">
            Office of the CEO
          </h1>
          <p className="text-muted text-base">requires executive access</p>
          <p className="text-xs text-muted mt-6">
            If you believe you should have access, contact your administrator.
          </p>
        </div>
      </Frame>
    );
  }

  // ── Derived numbers ──────────────────────────────────────────────────
  const totalCases = metrics
    ? metrics.cases.by_status.reduce((sum, s) => sum + s.count, 0)
    : null;
  const slaPct = metrics?.cases.sla.compliance_pct ?? null;
  const slaTone =
    slaPct === null ? 'navy'
      : slaPct >= 95 ? 'green'
      : slaPct >= 85 ? 'amber'
      : 'red';

  // Strategic stubs — pending revenue/CRM infrastructure.
  const ACTIVE_CUSTOMERS_STUB = 3;
  const MRR_STUB = 42_500;

  return (
    <Frame>
      {/* Header */}
      <div className="mb-10 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
 <h1 className="text-4xl md:text-5xl text-navy">
              Office of the CEO
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-gold/15 text-gold-dark border border-gold/30">
              <span className="w-1.5 h-1.5 rounded-full bg-gold" />
              Executive
            </span>
            {metrics?.source === 'demo' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                Demo Data
              </span>
            )}
          </div>
          <p className="text-muted mt-2 text-lg">Executive strategic overview</p>
        </div>
        {metrics && (
          <div className="text-right">
            <div className="text-xs text-muted">Updated</div>
            <div className="text-sm text-navy font-medium">
              {new Date(metrics.generated_at).toLocaleString()}
            </div>
          </div>
        )}
      </div>

      {/* Top-line KPI row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 mb-10">
        <HeroKpi
          label="Total Cases Processed"
          value={totalCases !== null ? totalCases.toLocaleString() : '—'}
          sub={metrics ? `${metrics.period.label}` : 'Loading…'}
          tone="navy"
        />
        <HeroKpi
          label="Active Customers"
          value={ACTIVE_CUSTOMERS_STUB.toString()}
          sub="TPAs in production"
          tone="navy"
          stub
        />
        <HeroKpi
          label="MRR"
          value={`$${MRR_STUB.toLocaleString()}`}
          sub="Monthly recurring revenue"
          tone="navy"
          stub
        />
        <HeroKpi
          label="SLA Compliance"
          value={slaPct !== null ? `${slaPct}%` : '—'}
          sub={
            metrics
              ? `${metrics.cases.sla.on_time} on-time · ${metrics.cases.sla.breached} breached`
              : 'Loading…'
          }
          tone={slaTone}
        />
      </div>

      {/* Strategic Pulse */}
      <section className="mb-10">
        <h2 className="font-semibold text-sm text-navy uppercase tracking-wide mb-3">
          Strategic Pulse
        </h2>
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Growth tile (stub) */}
          <div className="bg-surface rounded-xl border border-border shadow-sm p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="text-[11px] text-muted uppercase tracking-widest font-semibold mb-1">
                  Growth
                </div>
                <div className="font-[family-name:var(--font-dm-serif)] text-2xl text-navy">
                  Up 18% QoQ
                </div>
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                </svg>
                Trending
              </span>
            </div>
            <ul className="space-y-2 text-sm text-navy/85">
              <PulseRow label="New TPAs onboarded this quarter" value="3" />
              <PulseRow label="Pipeline value (qualified)" value="$1.2M" />
              <PulseRow label="Avg. contract length" value="24 months" />
              <PulseRow label="Net revenue retention" value="112%" />
            </ul>
            <div className="text-[10px] text-muted mt-4 italic">Strategic — stub data</div>
          </div>

          {/* Operational tile (real data) */}
          <div className="bg-surface rounded-xl border border-border shadow-sm p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="text-[11px] text-muted uppercase tracking-widest font-semibold mb-1">
                  Operational
                </div>
                <div className="font-[family-name:var(--font-dm-serif)] text-2xl text-navy">
                  {metrics ? `${metrics.briefs.generated_count.toLocaleString()} briefs` : '—'}
                </div>
              </div>
              {metrics && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-navy/10 text-navy border border-navy/20">
                  {metrics.period.label}
                </span>
              )}
            </div>
            {metricsError ? (
              <div className="text-sm text-red-700">{metricsError}</div>
            ) : !metrics ? (
              <div className="text-sm text-muted">Loading operational metrics…</div>
            ) : (
              <>
                <ul className="space-y-2 text-sm text-navy/85">
                  <PulseRow
                    label="Anthropic spend (MTD)"
                    value={`$${metrics.tokens.estimated_cost_usd.toFixed(2)}`}
                  />
                  <PulseRow
                    label="Intake events (MTD)"
                    value={metrics.intake.total.toLocaleString()}
                  />
                  <PulseRow
                    label="Active cases"
                    value={metrics.cases.active_count.toLocaleString()}
                  />
                  <PulseRow
                    label="Brief failures"
                    value={metrics.briefs.failed_count.toString()}
                  />
                </ul>
                {metrics.intake.by_channel.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-border">
                    <div className="text-[11px] text-muted uppercase tracking-wide font-semibold mb-2">
                      Intake by channel
                    </div>
                    <ul className="space-y-1.5">
                      {metrics.intake.by_channel.slice(0, 4).map((row) => {
                        const max = Math.max(
                          ...metrics.intake.by_channel.map((r) => r.count),
                        );
                        const pct = max > 0 ? Math.round((row.count / max) * 100) : 0;
                        return (
                          <li key={row.channel} className="text-xs">
                            <div className="flex justify-between mb-0.5">
                              <span className="text-navy capitalize">
                                {row.channel.replace(/_/g, ' ')}
                              </span>
                              <span className="font-semibold text-navy">{row.count}</span>
                            </div>
                            <div className="h-1 bg-gray-100 rounded overflow-hidden">
                              <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {/* Risks & Opportunities */}
      <section className="mb-10">
        <h2 className="font-semibold text-sm text-navy uppercase tracking-wide mb-3">
          Risks &amp; Opportunities
        </h2>
        <div className="grid md:grid-cols-2 gap-6">
          <SignalCard tone="amber" title="Risks">
            <SignalItem
              label="SLA dip on expedited cases"
              detail="Root cause analysis underway — staffing model adjustment proposed next sprint."
            />
            <SignalItem
              label="2 TPAs in pilot phase"
              detail="Conversion pending Q3 procurement reviews; both verbally committed."
            />
            <SignalItem
              label="Concentration risk"
              detail="Top customer represents 48% of MRR — diversification a 2026 priority."
            />
          </SignalCard>
          <SignalCard tone="green" title="Opportunities">
            <SignalItem
              label="Valenz expansion"
              detail="Wednesday demo positioned for multi-line upsell (UM + appeals)."
            />
            <SignalItem
              label="Auto-determination pilot"
              detail="Approval automation for low-risk procedures projected to cut RN load 25%."
            />
            <SignalItem
              label="Provider portal"
              detail="External-facing status checks ready to ship — high-leverage NPS lever."
            />
          </SignalCard>
        </div>
      </section>

      {/* Quick links */}
      <section className="mb-10">
        <h2 className="font-semibold text-sm text-navy uppercase tracking-wide mb-3">
          Drill Down
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickLink
            href="/mission-control"
            label="Mission Control"
            sub="System-wide ops"
          />
          <QuickLink
            href="/admin/usage"
            label="Usage & Cost"
            sub="Detailed metrics"
          />
          <QuickLink
            href="/clients"
            label="Clients"
            sub="TPA roster"
          />
          <QuickLink
            href="/quality"
            label="Quality"
            sub="Audits & compliance"
          />
        </div>
      </section>

      {/* Stub footnote */}
      <p className="text-[11px] text-muted text-center italic mt-4">
        Strategic numbers are stubbed pending revenue infrastructure.
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
    <div className={`bg-surface rounded-2xl border border-border p-6 shadow-sm ring-1 ${TONE_RING[tone]} relative`}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] text-muted uppercase tracking-widest font-semibold">
          {label}
        </div>
        {stub && (
          <span
            title="Strategic stub — pending revenue infrastructure"
            className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200"
          >
            Stub
          </span>
        )}
      </div>
 <div className={`text-4xl md:text-5xlleading-none ${TONE_TEXT[tone]}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-muted mt-3">{sub}</div>}
    </div>
  );
}

function PulseRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-border last:border-0 pb-1.5 last:pb-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm font-semibold text-navy">{value}</span>
    </li>
  );
}

const SIGNAL_TONE: Record<string, { dot: string; border: string; label: string }> = {
  amber: { dot: 'bg-amber-500', border: 'border-amber-200', label: 'text-amber-800' },
  green: { dot: 'bg-emerald-500', border: 'border-emerald-200', label: 'text-emerald-800' },
};

function SignalCard({
  tone,
  title,
  children,
}: {
  tone: 'amber' | 'green';
  title: string;
  children: React.ReactNode;
}) {
  const t = SIGNAL_TONE[tone];
  return (
    <div className={`bg-surface rounded-xl border ${t.border} shadow-sm p-6`}>
      <div className="flex items-center gap-2 mb-4">
        <span className={`w-2 h-2 rounded-full ${t.dot}`} />
        <h3 className={`font-semibold text-sm uppercase tracking-wide ${t.label}`}>{title}</h3>
      </div>
      <ul className="space-y-3">{children}</ul>
    </div>
  );
}

function SignalItem({ label, detail }: { label: string; detail: string }) {
  return (
    <li>
      <div className="text-sm font-semibold text-navy">{label}</div>
      <div className="text-xs text-muted mt-0.5 leading-relaxed">{detail}</div>
    </li>
  );
}

function QuickLink({ href, label, sub }: { href: string; label: string; sub: string }) {
  return (
    <Link
      href={href}
      className="group bg-surface rounded-xl border border-border p-4 shadow-sm hover:border-gold hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold text-navy group-hover:text-gold-dark transition-colors">
          {label}
        </div>
        <svg
          className="w-4 h-4 text-muted group-hover:text-gold-dark transition-colors"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
      <div className="text-[11px] text-muted mt-1">{sub}</div>
    </Link>
  );
}
