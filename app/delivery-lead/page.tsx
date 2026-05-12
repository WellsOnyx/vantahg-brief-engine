'use client';

import { useEffect, useState } from 'react';

/**
 * Delivery Lead dashboard.
 *
 * Surfaces the team of concierges this DL is responsible for, with live
 * load metrics. V1 scope: roster + load bars + utilization. V2 will add
 * upstream (TPA-facing) and downstream (case-level) drill-down.
 *
 * Access: admin / builder / ceo / slt / practice-lead / delivery-lead /
 * concierge — gated server-side by /api/delivery/concierges.
 */

interface Concierge {
  id: string;
  name: string;
  email: string;
  weekly_auth_cap: number;
  delivery_lead_id: string | null;
  active: boolean;
  estimated_weekly_load: number;
  active_client_count: number;
  utilization: number;
}

interface ListResponse {
  demo: boolean;
  concierges: Concierge[];
}

export default function DeliveryLeadPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch('/api/delivery/concierges', { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setError('You need delivery-lead, admin, or higher role to view this page.');
        } else {
          setError(`Could not load (${res.status}).`);
        }
        return;
      }
      setData((await res.json()) as ListResponse);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const concierges = data?.concierges ?? [];
  const totalLoad = concierges.reduce((sum, c) => sum + c.estimated_weekly_load, 0);
  const totalCap = concierges.reduce((sum, c) => sum + c.weekly_auth_cap, 0);
  const aggregateUtil = totalCap > 0 ? Math.min(1, totalLoad / totalCap) : 0;
  const atRisk = concierges.filter((c) => c.utilization >= 0.9).length;

  return (
    <div className="py-10 md:py-16 bg-background min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted font-semibold">Delivery Operations</p>
            <h1 className="text-3xl md:text-4xl font-bold text-navy mt-1">Delivery Lead Dashboard</h1>
            <p className="text-sm text-muted mt-2 max-w-2xl">
              Your concierge team, weekly load, and clients in flight. Concierges max out at 300 auths/week — keep utilization under 90% to absorb spikes.
            </p>
          </div>
          <button
            onClick={() => void load()}
            disabled={refreshing}
            className="bg-white border border-border text-navy px-4 py-2 rounded-lg text-sm font-medium hover:border-navy/40 disabled:opacity-50"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </header>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3">{error}</div>
        )}

        {data && (
          <>
            <section className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <Stat label="Concierges" value={concierges.length.toString()} />
              <Stat label="Active clients" value={concierges.reduce((s, c) => s + c.active_client_count, 0).toString()} />
              <Stat label="Aggregate weekly load" value={`${totalLoad} / ${totalCap}`} sub={`${Math.round(aggregateUtil * 100)}% capacity`} />
              <Stat label="At capacity (≥90%)" value={atRisk.toString()} tone={atRisk > 0 ? 'warn' : 'ok'} />
            </section>

            <section className="bg-surface rounded-xl border border-border shadow-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-navy">Concierge roster</h2>
                {data.demo && (
                  <span className="text-[11px] uppercase tracking-wide font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                    Demo data
                  </span>
                )}
              </div>
              {concierges.length === 0 ? (
                <p className="text-sm text-muted">No concierges yet. They'll show up here once the delivery org is staffed.</p>
              ) : (
                <ul className="space-y-3">
                  {concierges.map((c) => (
                    <ConciergeRow key={c.id} c={c} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn' }) {
  const ringClass = tone === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-border bg-surface';
  return (
    <div className={`rounded-xl border shadow-sm px-4 py-3 ${ringClass}`}>
      <p className="text-[11px] uppercase tracking-wide text-muted font-semibold">{label}</p>
      <p className="text-xl font-bold text-navy mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

function ConciergeRow({ c }: { c: Concierge }) {
  const pct = Math.round(c.utilization * 100);
  const tone =
    c.utilization >= 0.9 ? 'bg-red-500' : c.utilization >= 0.75 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <li className="border border-border rounded-lg px-4 py-3 hover:border-navy/40 transition-colors">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-navy truncate">{c.name}</p>
          <p className="text-xs text-muted truncate">{c.email}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-navy">{c.estimated_weekly_load} / {c.weekly_auth_cap}</p>
          <p className="text-[11px] text-muted">{c.active_client_count} {c.active_client_count === 1 ? 'client' : 'clients'} · {pct}%</p>
        </div>
      </div>
      <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${tone} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}
