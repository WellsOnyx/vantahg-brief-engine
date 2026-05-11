'use client';

import { useEffect, useState } from 'react';
import type { UsageMetrics } from '@/lib/usage-metrics';
import type { RealModeStatus } from '@/lib/real-mode-status';

const CHANNEL_LABELS: Record<string, string> = {
  portal: 'Portal',
  efax: 'eFax',
  email: 'Email',
  phone: 'Phone',
  api: 'API',
  batch_upload: 'Batch Upload',
};

const STATUS_LABELS: Record<string, string> = {
  intake: 'Intake',
  processing: 'Processing',
  brief_ready: 'Brief Ready',
  lpn_review: 'LPN Review',
  rn_review: 'RN Review',
  md_review: 'MD Review',
  pend_missing_info: 'Pending Info',
  determination_made: 'Determination',
  delivered: 'Delivered',
};

export default function AdminUsagePage() {
  const [metrics, setMetrics] = useState<UsageMetrics | null>(null);
  const [status, setStatus] = useState<RealModeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      try {
        const [metricsRes, statusRes] = await Promise.all([
          fetch('/api/admin/usage-metrics'),
          fetch('/api/admin/real-mode-status'),
        ]);
        if (!metricsRes.ok) {
          if (metricsRes.status === 403) {
            if (!cancelled) setError('Admin role required');
          } else {
            if (!cancelled) setError(`Failed to load metrics (${metricsRes.status})`);
          }
          return;
        }
        const metricsData = (await metricsRes.json()) as UsageMetrics;
        if (!cancelled) setMetrics(metricsData);
        if (statusRes.ok) {
          const statusData = (await statusRes.json()) as RealModeStatus;
          if (!cancelled) setStatus(statusData);
        }
      } catch {
        if (!cancelled) setError('Failed to load metrics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchAll();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="py-10 md:py-16 bg-background min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-muted">
          Loading usage metrics...
        </div>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="py-10 md:py-16 bg-background min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-surface rounded-xl border border-red-200 shadow-sm p-6 text-red-800">
            {error ?? 'Unable to load metrics'}
          </div>
        </div>
      </div>
    );
  }

  const briefFailureRate =
    metrics.briefs.generated_count + metrics.briefs.failed_count > 0
      ? Math.round(
          (metrics.briefs.failed_count /
            (metrics.briefs.generated_count + metrics.briefs.failed_count)) *
            1000,
        ) / 10
      : 0;

  return (
    <div className="py-10 md:py-16 bg-background min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="font-[family-name:var(--font-dm-serif)] text-3xl md:text-4xl text-navy">
                Usage &amp; Cost
              </h1>
              <p className="text-muted mt-1 text-lg">
                Month-to-date · {metrics.period.label}
                {metrics.source === 'demo' && (
                  <span className="ml-2 inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs font-medium align-middle">
                    Demo Data
                  </span>
                )}
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted">Last updated</div>
              <div className="text-sm text-navy font-medium">
                {new Date(metrics.generated_at).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Real-mode status */}
        {status && <RealModeStatusBar status={status} />}

        {/* Top KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-10">
          <KpiCard
            label="Briefs Generated"
            value={metrics.briefs.generated_count.toLocaleString()}
            sub={
              metrics.briefs.failed_count > 0
                ? `${metrics.briefs.failed_count} failed (${briefFailureRate}%)`
                : 'No failures'
            }
            tone={metrics.briefs.failed_count > 0 ? 'amber' : 'green'}
          />
          <KpiCard
            label="Estimated Cost"
            value={`$${metrics.tokens.estimated_cost_usd.toFixed(2)}`}
            sub={`${formatTokens(metrics.tokens.input)} in / ${formatTokens(metrics.tokens.output)} out`}
            tone="navy"
          />
          <KpiCard
            label="Intake Volume"
            value={metrics.intake.total.toLocaleString()}
            sub={`${metrics.intake.by_channel.length} channels active`}
            tone="navy"
          />
          <KpiCard
            label="SLA Compliance"
            value={`${metrics.cases.sla.compliance_pct}%`}
            sub={`${metrics.cases.sla.on_time} on-time / ${metrics.cases.sla.breached} breached`}
            tone={
              metrics.cases.sla.compliance_pct >= 95
                ? 'green'
                : metrics.cases.sla.compliance_pct >= 85
                  ? 'amber'
                  : 'red'
            }
          />
        </div>

        {/* Token breakdown */}
        <Section title="Token Usage & Anthropic Cost">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Input tokens" value={formatTokens(metrics.tokens.input)} />
            <Stat label="Output tokens" value={formatTokens(metrics.tokens.output)} />
            <Stat label="Cache reads" value={formatTokens(metrics.tokens.cache_read)} />
            <Stat label="Estimated cost" value={`$${metrics.tokens.estimated_cost_usd.toFixed(2)}`} tone="navy" />
          </div>
          <p className="text-xs text-muted mt-4">
            Estimate based on Claude Opus 4.6 list pricing ($5/1M input, $25/1M output, $0.50/1M cache read).
            Includes brief generation and eFax extraction. Bedrock pricing differs — re-baseline if LLM_PROVIDER is changed.
          </p>
        </Section>

        <div className="grid lg:grid-cols-2 gap-6 mb-10">
          <Section title="Intake Volume by Channel">
            {metrics.intake.by_channel.length === 0 ? (
              <div className="text-sm text-muted py-4">No intake events this period.</div>
            ) : (
              <ul className="space-y-2">
                {metrics.intake.by_channel.map((row) => (
                  <BarRow
                    key={row.channel}
                    label={CHANNEL_LABELS[row.channel] ?? row.channel}
                    count={row.count}
                    max={metrics.intake.total}
                  />
                ))}
              </ul>
            )}
          </Section>

          <Section title="Active Cases by Status">
            {metrics.cases.by_status.length === 0 ? (
              <div className="text-sm text-muted py-4">No cases in the system.</div>
            ) : (
              <ul className="space-y-2">
                {metrics.cases.by_status.map((row) => (
                  <BarRow
                    key={row.status}
                    label={STATUS_LABELS[row.status] ?? row.status}
                    count={row.count}
                    max={Math.max(...metrics.cases.by_status.map((s) => s.count))}
                  />
                ))}
              </ul>
            )}
            <div className="mt-4 text-xs text-muted">
              Active = any status other than Delivered. {metrics.cases.active_count} active in total.
            </div>
          </Section>
        </div>

        {/* SLA detail */}
        <Section title="SLA Compliance Detail">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat
              label="Tracked"
              value={metrics.cases.sla.total_with_deadline.toLocaleString()}
              sub="Cases with deadline"
            />
            <Stat
              label="On Time"
              value={metrics.cases.sla.on_time.toLocaleString()}
              tone="green"
            />
            <Stat
              label="Breached"
              value={metrics.cases.sla.breached.toLocaleString()}
              tone={metrics.cases.sla.breached > 0 ? 'red' : 'navy'}
            />
            <Stat
              label="Compliance"
              value={`${metrics.cases.sla.compliance_pct}%`}
              tone={
                metrics.cases.sla.compliance_pct >= 95
                  ? 'green'
                  : metrics.cases.sla.compliance_pct >= 85
                    ? 'amber'
                    : 'red'
              }
            />
          </div>
        </Section>
      </div>
    </div>
  );
}

// ── Presentational helpers ─────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const TONE_CLASS: Record<string, string> = {
  navy: 'text-navy',
  green: 'text-green-700',
  amber: 'text-amber-700',
  red: 'text-red-700',
};

function KpiCard({
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
    <div className="bg-surface rounded-xl border border-border p-6 shadow-sm">
      <div className="text-xs text-muted uppercase tracking-wide font-medium mb-2">{label}</div>
      <div className={`text-3xl font-[family-name:var(--font-dm-serif)] ${TONE_CLASS[tone]}`}>{value}</div>
      {sub && <div className="text-xs text-muted mt-2">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface rounded-xl border border-border p-6 shadow-sm mb-6">
      <h2 className="font-semibold text-sm text-navy uppercase tracking-wide mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Stat({
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
    <div>
      <div className="text-xs text-muted uppercase tracking-wide font-medium mb-1">{label}</div>
      <div className={`text-2xl font-semibold ${TONE_CLASS[tone]}`}>{value}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  );
}

const STATUS_DOT_CLASS: Record<string, string> = {
  ready: 'bg-green-500',
  missing: 'bg-red-500',
  demo: 'bg-amber-400',
};

const OVERALL_BANNER_CLASS: Record<string, string> = {
  ready: 'bg-green-50 border-green-200 text-green-900',
  partial: 'bg-amber-50 border-amber-200 text-amber-900',
  demo: 'bg-blue-50 border-blue-200 text-blue-900',
};

const OVERALL_LABEL: Record<string, string> = {
  ready: 'Real mode — all required components ready',
  partial: 'Real mode — partially configured',
  demo: 'Demo mode — using static fixtures, no external calls',
};

function RealModeStatusBar({ status }: { status: RealModeStatus }) {
  const components = [
    { key: 'supabase', label: 'Supabase', c: status.components.supabase },
    { key: 'anthropic', label: 'Anthropic', c: status.components.anthropic },
    { key: 'cron', label: 'Cron', c: status.components.cron },
    { key: 'efax', label: 'eFax', c: status.components.efax },
    { key: 'ocr', label: 'OCR', c: status.components.ocr },
    { key: 'sentry', label: 'Sentry', c: status.components.sentry },
  ];
  return (
    <section
      className={`rounded-xl border shadow-sm p-4 mb-8 ${OVERALL_BANNER_CLASS[status.overall]}`}
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="text-sm font-semibold">{OVERALL_LABEL[status.overall]}</div>
        <div className="flex flex-wrap gap-2">
          {components.map(({ key, label, c }) => (
            <span
              key={key}
              title={[c.hint, ...(c.missing.length > 0 ? [`Missing: ${c.missing.join(', ')}`] : [])].join(' · ')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-border text-xs"
            >
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT_CLASS[c.status]}`} />
              <span className="font-medium text-navy">{label}</span>
              <span className="text-muted">{c.status === 'ready' ? '✓' : c.status === 'demo' ? '—' : '!'}</span>
            </span>
          ))}
        </div>
      </div>
      {status.overall !== 'ready' && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-navy/80 hover:text-navy">
            Show next steps to complete setup
          </summary>
          <ul className="mt-2 space-y-1">
            {components
              .filter(({ c }) => c.status !== 'ready')
              .map(({ key, label, c }) => (
                <li key={key} className="text-navy/90">
                  <span className="font-semibold">{label}:</span> {c.hint}
                  {c.missing.length > 0 && (
                    <span className="text-muted"> ({c.missing.join(', ')})</span>
                  )}
                </li>
              ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function BarRow({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <li className="flex items-center gap-3">
      <span className="text-sm font-medium w-32 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded overflow-hidden">
        <div className="h-full bg-navy" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold text-navy w-10 text-right shrink-0">{count}</span>
    </li>
  );
}
