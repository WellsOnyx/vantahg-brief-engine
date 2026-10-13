'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AggregateBucket, StoplossAggregateOk } from '@/lib/vhg/aggregate';
import { LIKELY_IDR_CONTESTED_LABEL, VHG_BRAND, vhgBandLabel } from '@/lib/vhg/brand';
import {
  drillTarget,
  GRAINS,
  LEDGER_END,
  LEDGER_START,
  quickRange,
  type Grain,
  type QuickRange,
} from '@/lib/vhg/time-range';

function money(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function StopMark() {
  return (
    <svg viewBox="0 0 24 24" className="w-8 h-8 shrink-0" aria-hidden>
      <polygon points="7,2 17,2 22,7 22,17 17,22 7,22 2,17 2,7" fill="#9f1239" />
      <text x="12" y="14.5" textAnchor="middle" fontSize="5.5" fill="white" fontFamily="sans-serif">
        STOP
      </text>
    </svg>
  );
}

interface Crumb {
  label: string;
  grain: Grain;
  from: string;
  to: string;
}

const QUICK: { id: QuickRange; label: string }[] = [
  { id: 'ytd', label: 'YTD' },
  { id: '90', label: 'Last 90 days' },
  { id: '30', label: 'Last 30 days' },
  { id: 'today', label: 'Today' },
];

export function StoplossLive({
  initial,
  basePath,
  clientId,
  reviewBasePath,
}: {
  initial: StoplossAggregateOk;
  basePath: string;
  clientId: string;
  reviewBasePath?: string;
}) {
  const reviewPath = reviewBasePath ?? `${basePath}/review`;
  const [stack, setStack] = useState<Crumb[]>([
    { label: 'All', grain: 'year', from: LEDGER_START, to: LEDGER_END },
  ]);
  const [data, setData] = useState(initial);
  const [pulse, setPulse] = useState(false);
  const current = stack[stack.length - 1] ?? stack[0];

  useEffect(() => {
    let ignore = false;
    async function load() {
      const url = `/api/stoploss/aggregate?grain=${current.grain}&from=${current.from}&to=${current.to}&client=${encodeURIComponent(clientId)}`;
      const response = await fetch(url);
      if (!response.ok || ignore) return;
      const body = (await response.json()) as StoplossAggregateOk;
      if (!body.ok || ignore) return;
      setData((previous) => {
        if (body.totals.cases_reviewed > previous.totals.cases_reviewed) setPulse(true);
        return body;
      });
    }
    void load();
    const timer = setInterval(() => void load(), 20_000);
    return () => {
      ignore = true;
      clearInterval(timer);
    };
  }, [current.grain, current.from, current.to, clientId]);

  useEffect(() => {
    if (!pulse) return;
    const timer = setTimeout(() => setPulse(false), 1200);
    return () => clearTimeout(timer);
  }, [pulse]);

  function drill(bucket: AggregateBucket | undefined) {
    if (!bucket?.key) return;
    const target = drillTarget(current.grain, bucket);
    setStack((previous) => {
      const top = previous[previous.length - 1];
      const crumb = { label: bucket.label, ...target };
      if (top && top.grain === 'day' && top.from === top.to) return [...previous.slice(0, -1), crumb];
      return [...previous, crumb];
    });
  }

  const updated = new Date(data.updated_at).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="bg-navy text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-gold font-semibold">Demo, synthetic data</p>
              <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl mt-2">Stop-loss partner</h1>
              <p className="text-sm text-white/70 mt-3 max-w-xl">
                Aggregated, de-identified med-review cases. Role shown for this synthetic session: stoploss_partner.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <p className="text-sm text-white" aria-live="polite">
                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-emerald-400 align-middle animate-pulse" />
                Live · Updated {updated}
              </p>
              <Link href="/" className="text-sm text-gold hover:text-gold-light min-h-11 inline-flex items-center">
                vantaum.com
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="bg-gold text-navy">
        <p className="max-w-6xl mx-auto px-4 sm:px-6 py-3 text-sm font-semibold">{data.banner}</p>
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
        <div className="flex flex-wrap gap-2">
          <Link href={`${basePath}?client=syn-vhg-med-review`} className="text-sm min-h-11 px-3 inline-flex items-center rounded-full border border-border bg-white">
            Northwind Synthetic Benefits
          </Link>
          <Link href={`${basePath}?client=syn-vhg-no-contract`} className="text-sm min-h-11 px-3 inline-flex items-center rounded-full border border-border bg-white">
            Harbor Synthetic Benefits
          </Link>
        </div>

        <section className="rounded-xl border border-border bg-white p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Period">
            {GRAINS.map((grain) => (
              <button
                key={grain}
                type="button"
                aria-pressed={current.grain === grain}
                onClick={() => setStack((previous) => {
                  const next = [...previous];
                  next[next.length - 1] = { ...next[next.length - 1], grain };
                  return next;
                })}
                className={`min-h-11 px-3 rounded-full text-sm capitalize border ${
                  current.grain === grain ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-border'
                }`}
              >
                {grain}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-muted flex flex-col gap-1">
              From
              <input
                type="date"
                value={current.from}
                min={LEDGER_START}
                max={current.to}
                onChange={(event) => {
                  const from = event.target.value;
                  if (!from) return;
                  setStack([{ label: 'Range', grain: current.grain, from, to: current.to }]);
                }}
                className="min-h-11 rounded-lg border border-border px-3 text-base text-navy"
              />
            </label>
            <label className="text-xs text-muted flex flex-col gap-1">
              To
              <input
                type="date"
                value={current.to}
                min={current.from}
                max={LEDGER_END}
                onChange={(event) => {
                  const to = event.target.value;
                  if (!to) return;
                  setStack([{ label: 'Range', grain: current.grain, from: current.from, to }]);
                }}
                className="min-h-11 rounded-lg border border-border px-3 text-base text-navy"
              />
            </label>
            {QUICK.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  const range = quickRange(item.id);
                  setStack([{ label: item.label, ...range }]);
                }}
                className="min-h-11 px-3 rounded-full border border-border text-sm text-navy bg-white"
              >
                {item.label}
              </button>
            ))}
          </div>

          <nav aria-label="Time drill" className="flex flex-wrap items-center gap-1 text-sm">
            {stack.map((crumb, index) => {
              const last = index === stack.length - 1;
              return (
                <span key={`${crumb.label}-${crumb.from}-${index}`} className="inline-flex items-center gap-1">
                  {index > 0 && <span className="text-muted">/</span>}
                  {last ? (
                    <span className="font-semibold text-navy px-1" aria-current="page">{crumb.label}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setStack((previous) => previous.slice(0, index + 1))}
                      className="min-h-11 px-2 text-navy underline"
                    >
                      {crumb.label}
                    </button>
                  )}
                </span>
              );
            })}
          </nav>
          <p className="text-xs text-muted">
            {data.client.display_name} · {current.from} to {current.to} · {data.live_count} live synthetic arrivals · Demo, synthetic data
          </p>
        </section>

        <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <article className={`rounded-xl border bg-white p-4 ${pulse ? 'border-gold ring-2 ring-gold' : 'border-border'}`}>
            <p className="text-xs uppercase tracking-wider text-muted">Cases reviewed</p>
            <p className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl text-navy mt-2">{data.totals.cases_reviewed}</p>
          </article>
          <article className="rounded-xl border border-rose-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wider text-muted">High {VHG_BRAND} risk</p>
            <p className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl text-rose-800 mt-2">{data.totals.high_vhg_risk_count}</p>
            <p className="text-xs text-muted mt-1">Score 70–100</p>
          </article>
          <article className="rounded-xl border border-border bg-white p-4">
            <p className="text-xs uppercase tracking-wider text-muted">Avg {LIKELY_IDR_CONTESTED_LABEL}</p>
            <p className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl text-navy mt-2">{data.totals.avg_likely_idr_contested_score}%</p>
          </article>
          <article className="rounded-xl border border-border bg-white p-4">
            <p className="text-xs uppercase tracking-wider text-muted">Projected IDR exposure</p>
            <p className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl text-navy mt-2">{money(data.totals.projected_idr_exposure_usd)}</p>
          </article>
          <article className="rounded-xl border border-rose-200 bg-white p-4 col-span-2 md:col-span-1">
            <p className="text-xs uppercase tracking-wider text-muted">Stop-sign flags</p>
            <p className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl text-rose-800 mt-2">{data.totals.stop_sign_flags}</p>
            <p className="text-xs text-muted mt-1">Score 85–100</p>
          </article>
        </section>

        <section className="rounded-xl border border-border bg-white p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-navy capitalize">{current.grain} view</h2>
          <p className="text-xs text-muted mt-1">
            Tap a period to drill from year to quarter, month, then day. Demo, synthetic data.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.buckets.map((bucket) => (
              <button
                key={bucket.key}
                type="button"
                onClick={() => drill(bucket)}
                className="min-h-11 rounded-full border border-border px-3 text-sm text-navy"
              >
                {bucket.label}
              </button>
            ))}
          </div>
          <div className="h-64 sm:h-72 mt-4 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={data.buckets} margin={{ left: 0, right: 8, bottom: current.grain === 'day' ? 24 : 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={current.grain === 'day' ? 2 : 0} angle={current.grain === 'day' ? -40 : 0} textAnchor={current.grain === 'day' ? 'end' : 'middle'} height={current.grain === 'day' ? 60 : 30} />
                <YAxis allowDecimals={false} width={40} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar
                  dataKey="cases"
                  name="Cases reviewed"
                  fill="#0c2340"
                  cursor="pointer"
                  onClick={(bar) => {
                    const record = bar as unknown as AggregateBucket & { payload?: AggregateBucket };
                    drill(record.payload?.key ? record.payload : record);
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <article className="rounded-xl border border-border bg-white p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-navy">Exposure by service line</h2>
            <div className="h-64 mt-4 min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={data.by_service_line} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(value) => money(Number(value))} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="key" width={108} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => money(Number(value))} />
                  <Bar dataKey="projected_exposure_usd" fill="#0c2340" name="Projected exposure" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
          <article className="rounded-xl border border-border bg-white p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-navy">Exposure by state</h2>
            <div className="h-64 mt-4 min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={data.by_state}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="key" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(value) => money(Number(value))} width={64} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => money(Number(value))} />
                  <Bar dataKey="projected_exposure_usd" fill="#c9a227" name="Projected exposure" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
        </section>

        <section className="rounded-xl border border-rose-200 bg-white p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <StopMark />
            <div>
              <h2 className="text-lg font-semibold text-navy">Stop sign list</h2>
              <p className="text-sm text-muted">
                High-{VHG_BRAND}-risk flags in this period. Showing {data.stop_sign.length} of {data.stop_sign_total}. De-identified.
              </p>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted border-b border-border">
                  <th className="py-2 pr-3">Case</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Service line</th>
                  <th className="py-2 pr-3">State</th>
                  <th className="py-2 pr-3">{VHG_BRAND}</th>
                  <th className="py-2 pr-3">Top driver</th>
                  <th className="py-2">Exposure</th>
                </tr>
              </thead>
              <tbody>
                {data.stop_sign.map((row) => (
                  <tr key={row.case_token} className="border-b border-border/70">
                    <td className="py-3 pr-3">
                      <Link href={`${reviewPath}/${row.case_token}`} className="text-navy font-medium underline">
                        {row.case_number}
                      </Link>
                    </td>
                    <td className="py-3 pr-3">{row.service_date}</td>
                    <td className="py-3 pr-3">{row.service_line}</td>
                    <td className="py-3 pr-3">{row.state}</td>
                    <td className="py-3 pr-3 font-semibold">{row.score}% · {vhgBandLabel(row.band)}</td>
                    <td className="py-3 pr-3">{row.top_driver}</td>
                    <td className="py-3">{money(row.projected_exposure_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-xs text-muted">
          Open a med review case:{' '}
          <Link href={`${reviewPath}/vhg-mr-0101`} className="text-navy underline">MR-SYN-0101</Link>
          . {VHG_BRAND} Score is a demo model and is not validated. Demo, synthetic data.
        </p>
      </main>
    </div>
  );
}
