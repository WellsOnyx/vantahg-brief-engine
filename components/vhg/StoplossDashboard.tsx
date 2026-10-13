'use client';

import Link from 'next/link';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { StoplossDashboardResult } from '@/lib/vhg/dashboard';

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

export function StoplossDashboard({
  result,
  basePath,
  reviewBasePath,
}: {
  result: StoplossDashboardResult;
  basePath: string;
  reviewBasePath?: string;
}) {
  const reviewPath = reviewBasePath ?? `${basePath}/review`;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="bg-navy text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-gold font-semibold">Demo, synthetic data</p>
              <h1 className="font-[family-name:var(--font-display)] text-4xl mt-2">Stop-loss partner</h1>
              <p className="text-sm text-white/70 mt-3 max-w-xl">
                Aggregated, de-identified med-review cases. Role shown for this synthetic session: stoploss_partner.
              </p>
            </div>
            <Link href="/" className="text-sm text-gold hover:text-gold-light">
              vantaum.com
            </Link>
          </div>
        </div>
      </header>

      <div className="bg-gold text-navy">
        <p className="max-w-6xl mx-auto px-4 sm:px-6 py-3 text-sm font-semibold">{result.banner}</p>
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-wrap gap-2">
          <Link
            href={`${basePath}?client=syn-vhg-med-review`}
            className="text-sm px-3 py-1.5 rounded-full border border-border bg-white"
          >
            Northwind Synthetic Benefits
          </Link>
          <Link
            href={`${basePath}?client=syn-vhg-no-contract`}
            className="text-sm px-3 py-1.5 rounded-full border border-border bg-white"
          >
            Harbor Synthetic Benefits
          </Link>
        </div>

        {!result.ok && (
          <section className="rounded-xl border border-border bg-white p-6">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">Entitlement gate</p>
            <h2 className="text-2xl font-semibold text-navy mt-2">
              {result.client?.display_name ?? 'Unknown client'}
            </h2>
            <p className="text-sm mt-4 max-w-2xl">{result.reason}</p>
            <p className="text-sm text-muted mt-3">
              Stop-loss dashboard rows exist only for clients with an active Vanta Med Review entitlement.
            </p>
          </section>
        )}

        {result.ok && (
          <>
            <p className="text-sm text-muted">
              {result.client.display_name} · {result.data_note}
            </p>
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <article className="rounded-xl border border-border bg-white p-5">
                <p className="text-xs uppercase tracking-wider text-muted">Cases reviewed</p>
                <p className="font-[family-name:var(--font-display)] text-4xl text-navy mt-2">{result.totals.cases_reviewed}</p>
                <p className="text-xs text-muted mt-1">Vanta med review, synthetic</p>
              </article>
              <article className="rounded-xl border border-rose-200 bg-white p-5">
                <p className="text-xs uppercase tracking-wider text-muted">High VHG risk</p>
                <p className="font-[family-name:var(--font-display)] text-4xl text-rose-800 mt-2">{result.totals.high_vhg_risk_count}</p>
                <p className="text-xs text-muted mt-1">Score 70–100</p>
              </article>
              <article className="rounded-xl border border-border bg-white p-5">
                <p className="text-xs uppercase tracking-wider text-muted">Projected IDR exposure</p>
                <p className="font-[family-name:var(--font-display)] text-4xl text-navy mt-2">
                  {money(result.totals.projected_idr_exposure_usd)}
                </p>
                <p className="text-xs text-muted mt-1">{result.exposure_note}</p>
              </article>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <article className="rounded-xl border border-border bg-white p-5">
                <h2 className="text-sm font-semibold text-navy">Exposure by service line</h2>
                <div className="h-64 mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={result.by_service_line} layout="vertical" margin={{ left: 24, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(value) => money(Number(value))} />
                      <YAxis type="category" dataKey="key" width={120} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value) => money(Number(value))} />
                      <Bar dataKey="projected_exposure_usd" fill="#0c2340" name="Projected exposure" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>
              <article className="rounded-xl border border-border bg-white p-5">
                <h2 className="text-sm font-semibold text-navy">Exposure by state</h2>
                <div className="h-64 mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={result.by_state}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="key" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={(value) => money(Number(value))} width={72} />
                      <Tooltip formatter={(value) => money(Number(value))} />
                      <Bar dataKey="projected_exposure_usd" fill="#c9a227" name="Projected exposure" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>
            </section>

            <section className="rounded-xl border border-border bg-white p-5">
              <h2 className="text-sm font-semibold text-navy">Trend</h2>
              <p className="text-xs text-muted mt-1">Cases reviewed and high-VHG-risk count by service month.</p>
              <div className="h-64 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={result.trend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Area type="monotone" dataKey="cases_reviewed" stroke="#0c2340" fill="#0c2340" fillOpacity={0.15} name="Cases reviewed" />
                    <Area type="monotone" dataKey="high_risk" stroke="#9f1239" fill="#9f1239" fillOpacity={0.2} name="High VHG risk" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="rounded-xl border border-rose-200 bg-white p-5">
              <div className="flex items-center gap-3">
                <StopMark />
                <div>
                  <h2 className="text-lg font-semibold text-navy">Stop sign list</h2>
                  <p className="text-sm text-muted">
                    High-VHG-risk cases for early intervention. Showing {result.stop_sign.length} of {result.stop_sign_total}. De-identified.
                  </p>
                </div>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-muted border-b border-border">
                      <th className="py-2 pr-3">Case</th>
                      <th className="py-2 pr-3">Month</th>
                      <th className="py-2 pr-3">Service line</th>
                      <th className="py-2 pr-3">State</th>
                      <th className="py-2 pr-3">Score</th>
                      <th className="py-2 pr-3">Top driver</th>
                      <th className="py-2">Exposure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.stop_sign.map((row) => (
                      <tr key={row.case_token} className="border-b border-border/70">
                        <td className="py-2 pr-3">
                          <Link href={`${reviewPath}/${row.case_token}`} className="text-navy font-medium underline">
                            {row.case_number}
                          </Link>
                        </td>
                        <td className="py-2 pr-3">{row.service_month}</td>
                        <td className="py-2 pr-3">{row.service_line}</td>
                        <td className="py-2 pr-3">{row.state}</td>
                        <td className="py-2 pr-3 font-semibold">{row.score}</td>
                        <td className="py-2 pr-3">{row.top_driver}</td>
                        <td className="py-2">{money(row.projected_exposure_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <p className="text-xs text-muted">
              Open a med review case:{' '}
              <Link href={`${reviewPath}/vhg-mr-0101`} className="text-navy underline">
                MR-SYN-0101
              </Link>
              . VHG Score is a demo model and is not validated.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
