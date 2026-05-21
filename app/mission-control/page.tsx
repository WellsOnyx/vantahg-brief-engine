'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { UsageMetrics } from '@/lib/usage-metrics';
import { PageDashboard, PageHero } from '@/components/layouts/PageLayouts';
import { SectionCard } from '@/components/SectionCard';
import { EmptyState } from '@/components/EmptyState';
import { MetricValue, type MetricFormat } from '@/components/MetricValue';

/**
 * Mission Control — system-wide executive overview.
 *
 * Different audience from /admin/usage (which is ops-detail). This page
 * is for execs who want at-a-glance answers: how big is the operation,
 * is it on time, what is it costing, and where do I drill in.
 *
 * Reuses /api/admin/usage-metrics deliberately — the aggregation
 * logic lives in one place. This page is purely a different lens on the
 * same data, focused on cross-tenant totals.
 */

const STATUS_LABEL: Record<string, string> = {
  intake: 'Intake',
  processing: 'Processing',
  brief_ready: 'Brief Ready',
  lpn_review: 'Nursing Review',
  rn_review: 'Nursing Review',
  md_review: 'Physician Review',
  pend_missing_info: 'Pending Info',
  determination_made: 'Determined',
  delivered: 'Delivered',
};

const TERMINAL = new Set(['delivered']);

export default function MissionControlPage() {
  const [metrics, setMetrics] = useState<UsageMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/admin/usage-metrics');
        if (!res.ok) {
          if (!cancelled) {
            setError(res.status === 403 ? 'Admin role required' : `Failed to load (${res.status})`);
          }
          return;
        }
        const data = (await res.json()) as UsageMetrics;
        if (!cancelled) setMetrics(data);
      } catch {
        if (!cancelled) setError('Failed to load metrics');
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <PageDashboard
        hero={
          <PageHero
            eyebrow="Mission control"
            title="System-wide overview."
            subtitle="Cross-tenant executive view of every TPA, reviewer, and case."
          />
        }
      >
        <SectionCard>
          <p className="text-sm text-foreground">{error}</p>
        </SectionCard>
      </PageDashboard>
    );
  }

  if (!metrics) {
    return (
      <PageDashboard
        hero={
          <PageHero
            eyebrow="Mission control"
            title="System-wide overview."
            subtitle="Cross-tenant executive view of every TPA, reviewer, and case."
          />
        }
      >
        <SectionCard>
          <p className="text-sm text-muted animate-pulse">Loading mission control…</p>
        </SectionCard>
      </PageDashboard>
    );
  }

  // Pre-compute the executive-friendly numbers from the existing payload.
  const totalCases = metrics.cases.by_status.reduce((sum, s) => sum + s.count, 0);
  const completedCount = metrics.cases.by_status
    .filter((s) => TERMINAL.has(s.status))
    .reduce((sum, s) => sum + s.count, 0);
  const activeCount = totalCases - completedCount;
  const completedPct = totalCases > 0 ? Math.round((completedCount / totalCases) * 100) : 0;
  const sla = metrics.cases.sla;

  return (
    <PageDashboard
      hero={
        <PageHero
          eyebrow="Mission control · system-wide"
          title="The operation, at a glance."
          subtitle={`Cross-tenant executive overview · ${metrics.period.label}`}
          actions={
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-widest text-white/50">Updated</div>
              <div className="text-sm text-white/80">
                {new Date(metrics.generated_at).toLocaleString()}
              </div>
              {metrics.source === 'demo' && (
                <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200">
                  Demo data
                </span>
              )}
            </div>
          }
        />
      }
    >
      {/* Hero KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 stagger-children">
        <HeroKpi
          label="Total cases"
          value={totalCases}
          sub={`${activeCount.toLocaleString()} active · ${completedCount.toLocaleString()} delivered`}
          tone="navy"
        />
        <HeroKpi
          label="SLA compliance"
          value={sla.compliance_pct}
          format="percent"
          sub={`${sla.on_time} on-time · ${sla.breached} breached`}
          tone={
            sla.compliance_pct >= 95 ? 'green' :
            sla.compliance_pct >= 85 ? 'amber' :
            'red'
          }
        />
        <HeroKpi
          label="Briefs this month"
          value={metrics.briefs.generated_count}
          sub={
            metrics.briefs.failed_count > 0
              ? `${metrics.briefs.failed_count} failed`
              : 'No failures'
          }
          tone={metrics.briefs.failed_count > 0 ? 'amber' : 'green'}
        />
        <HeroKpi
          label="Anthropic cost"
          value={metrics.tokens.estimated_cost_usd}
          format="currency"
          sub="Month-to-date"
          tone="navy"
        />
      </div>

      {/* Pipeline + Intake side-by-side */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Pipeline (spans 2 cols on lg) */}
        <div className="lg:col-span-2">
          <SectionCard
            eyebrow="Pipeline"
            title="Case distribution"
            hint={<span className="text-xs text-muted">{totalCases.toLocaleString()} total</span>}
          >
            {/* Active vs completed split bar */}
            <div className="mb-5">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-navy font-semibold">Active · {activeCount.toLocaleString()}</span>
                <span className="text-emerald-700 font-semibold">
                  Delivered · {completedCount.toLocaleString()} ({completedPct}%)
                </span>
              </div>
              <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                <div
                  className="bg-navy"
                  style={{ width: totalCases > 0 ? `${((totalCases - completedCount) / totalCases) * 100}%` : '0%' }}
                />
                <div
                  className="bg-emerald-500"
                  style={{ width: totalCases > 0 ? `${(completedCount / totalCases) * 100}%` : '0%' }}
                />
              </div>
            </div>

            {metrics.cases.by_status.length === 0 ? (
              <EmptyState
                title="No cases in the system yet."
                body="The pipeline lights up as soon as the first auth lands."
              />
            ) : (
              <ul className="space-y-1.5">
                {metrics.cases.by_status.map((row) => (
                  <li key={row.status} className="flex items-center gap-3 text-sm">
                    <span className="w-36 shrink-0 text-navy">
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded overflow-hidden">
                      <div
                        className={`h-full ${TERMINAL.has(row.status) ? 'bg-emerald-500' : 'bg-navy/70'}`}
                        style={{ width: totalCases > 0 ? `${(row.count / totalCases) * 100}%` : '0%' }}
                      />
                    </div>
                    <span className="font-semibold text-navy w-12 text-right shrink-0">{row.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        {/* Intake snapshot */}
        <SectionCard
          eyebrow="Intake"
          title="This month"
          hint={<span className="text-xs text-muted">{metrics.intake.total.toLocaleString()} events</span>}
        >
          {metrics.intake.by_channel.length === 0 ? (
            <EmptyState
              title="The phone hasn't rung yet."
              body="Channels: eFax, email, portal, API. Activity surfaces as soon as it arrives."
            />
          ) : (
            <ul className="space-y-2">
              {metrics.intake.by_channel.map((row) => {
                const max = Math.max(...metrics.intake.by_channel.map((r) => r.count));
                const pct = max > 0 ? Math.round((row.count / max) * 100) : 0;
                return (
                  <li key={row.channel} className="text-sm">
                    <div className="flex justify-between mb-0.5">
                      <span className="text-navy capitalize">{row.channel.replace(/_/g, ' ')}</span>
                      <span className="font-semibold text-navy">{row.count}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded overflow-hidden">
                      <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* Quick links */}
      <SectionCard eyebrow="Drill down" title="Operational surfaces">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <QuickLink href="/cases" label="All cases" sub={`${totalCases.toLocaleString()} total`} />
          <QuickLink href="/clients" label="Clients (TPAs)" sub="Roster + onboarding" />
          <QuickLink href="/reviewers" label="Reviewer team" sub="Roster + availability" />
          <QuickLink href="/quality" label="Quality" sub="Audits + compliance" />
          <QuickLink href="/admin/usage" label="Usage & cost" sub="Detailed ops view" />
        </div>
      </SectionCard>
    </PageDashboard>
  );
}

// ── Presentational ────────────────────────────────────────────────────────

const TONE_RING: Record<string, string> = {
  navy: 'ring-navy/20',
  green: 'ring-green-200',
  amber: 'ring-amber-200',
  red: 'ring-red-200',
};

function HeroKpi({
  label,
  value,
  format = 'number',
  sub,
  tone = 'navy',
}: {
  label: string;
  value: number | null | undefined;
  format?: MetricFormat;
  sub?: string;
  tone?: 'navy' | 'green' | 'amber' | 'red';
}) {
  return (
    <div className={`bg-surface rounded-2xl border border-border p-6 shadow-sm ring-1 ${TONE_RING[tone]}`}>
      <div className="text-[11px] text-muted uppercase tracking-widest font-semibold mb-3">
        {label}
      </div>
      <div className="text-4xl md:text-5xl leading-none">
        <MetricValue value={value} format={format} />
      </div>
      {sub && <div className="text-xs text-muted mt-3">{sub}</div>}
    </div>
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
