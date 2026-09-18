'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHero, PageList, PageSectionHeading } from '@/components/layouts/PageLayouts';
import { EmptyState } from '@/components/EmptyState';

const KINDS = ['volume', 'turnaround', 'outcomes', 'deny_reasons', 'sla'] as const;
type ReportKind = (typeof KINDS)[number];

interface Bundle {
  volume: { totals: { received: number; signed: number; open: number; ledger_signed: number }; ledger_match: boolean };
  turnaround: { p50_hours: number | null; p90_hours: number | null; rows: unknown[] };
  outcomes: { counts: Record<string, number>; rates: Record<string, number> };
  deny_reasons: { counts: Record<string, number> };
  sla: { counts: { hit: number; miss: number; at_risk: number } };
  ledger_signed: number;
  signed_cases: number;
}

export default function TpaReportsPage() {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [kind, setKind] = useState<ReportKind>('volume');
  const [grain, setGrain] = useState<'day' | 'week'>('day');
  const [type, setType] = useState('');
  const [lob, setLob] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const query = useCallback(() => {
    const params = new URLSearchParams({ seed: 'synthetic', grain });
    if (type) params.set('type', type);
    if (lob) params.set('lob', lob);
    return params.toString();
  }, [grain, type, lob]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports?${query()}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setBundle(data as Bundle);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageList
      hero={
        <PageHero
          eyebrow="TPA Portal"
          title="Reports"
          subtitle="Volume, turnaround, outcomes, deny reasons, and SLA. Signed volume matches the billing ledger. Synthetic only — no live PHI."
          actions={
            <Link href={`/api/reports/${kind}?${query()}&format=csv`} className="btn btn-primary text-sm">
              Download {kind} CSV
            </Link>
          }
        />
      }
    >
      <div className="card p-5 md:p-6 space-y-5">
        <PageSectionHeading hint={<Link href="/portal/tpa/cm" className="text-xs text-navy underline">CM queue →</Link>}>
          Five client reports
        </PageSectionHeading>

        <div className="flex flex-wrap gap-3 text-xs">
          <select className="border border-border rounded px-2 py-1" value={kind} onChange={(e) => setKind(e.target.value as ReportKind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k.replace('_', ' ')}
              </option>
            ))}
          </select>
          <select className="border border-border rounded px-2 py-1" value={grain} onChange={(e) => setGrain(e.target.value as 'day' | 'week')}>
            <option value="day">Day</option>
            <option value="week">Week</option>
          </select>
          <select className="border border-border rounded px-2 py-1" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            <option value="prior_auth">Prior auth</option>
            <option value="first_level_appeal">Appeal</option>
          </select>
          <select className="border border-border rounded px-2 py-1" value={lob} onChange={(e) => setLob(e.target.value)}>
            <option value="">All LOB</option>
            <option value="medical">Medical</option>
            <option value="pharmacy">Pharmacy</option>
          </select>
        </div>

        {loading && <p className="text-sm text-muted">Loading reports…</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}

        {bundle && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <Stat label="Received" value={bundle.volume.totals.received} />
            <Stat
              label="Signed"
              value={bundle.volume.totals.signed}
              hint={bundle.volume.ledger_match ? `Ledger ${bundle.ledger_signed}` : `Ledger mismatch ${bundle.ledger_signed}`}
            />
            <Stat label="Open" value={bundle.volume.totals.open} />
            <Stat
              label="Turnaround"
              value={bundle.turnaround.p50_hours == null ? '—' : `${bundle.turnaround.p50_hours}h p50`}
              hint={bundle.turnaround.p90_hours == null ? undefined : `${bundle.turnaround.p90_hours}h p90`}
            />
            <Stat label="Approve" value={bundle.outcomes.counts.approve ?? 0} />
            <Stat label="Deny" value={bundle.outcomes.counts.deny ?? 0} />
            <Stat label="SLA hit" value={bundle.sla.counts.hit} />
            <Stat label="SLA miss" value={bundle.sla.counts.miss} />
          </div>
        )}

        {bundle && kind === 'deny_reasons' && (
          <div>
            <p className="text-xs uppercase tracking-wider text-muted mb-2">Deny reason codes</p>
            {Object.keys(bundle.deny_reasons.counts).length === 0 ? (
              <EmptyState title="No denials." body="Normalized reason codes appear after a deny sign." />
            ) : (
              <ul className="text-sm divide-y divide-border">
                {Object.entries(bundle.deny_reasons.counts).map(([code, n]) => (
                  <li key={code} className="py-2 flex justify-between">
                    <span className="font-mono text-xs">{code}</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </PageList>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className="text-lg font-semibold text-navy">{value}</p>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
