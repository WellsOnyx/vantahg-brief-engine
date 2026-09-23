'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHero, PageList, PageSectionHeading } from '@/components/layouts/PageLayouts';
import { EmptyState } from '@/components/EmptyState';

interface StatementEvent {
  billable_event_id: string;
  case_id: string;
  sku: string;
  quantity: number;
  unit_price: number;
  status: string;
  bill_tier?: string | null;
}

interface ClinicalLine {
  tier: string;
  label: string;
  case_id: string;
  amount: number;
  zero_priced: boolean;
}

interface StatementTwoLine {
  platform: {
    present: boolean;
    label: string;
    amount: number;
    lives_in_month: number | null;
    pmpm: number | null;
    waived: boolean;
  };
  clinical: ClinicalLine[];
  review_amount: number;
  denominator_label: string;
}

interface BillingStatement {
  statement_id: string;
  client_id: string;
  client_name: string;
  period_start: string;
  period_end: string;
  generated_at: string;
  status: string;
  events: StatementEvent[];
  subtotal: number;
  two_line?: StatementTwoLine | null;
}

function money(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function TpaStatementsPage() {
  const [statements, setStatements] = useState<BillingStatement[] | null>(null);
  const [selected, setSelected] = useState<BillingStatement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/billing/statements', { cache: 'no-store' });
    if (!res.ok) throw new Error(`load_failed_${res.status}`);
    const data = (await res.json()) as { statements: BillingStatement[] };
    setStatements(data.statements ?? []);
    if (data.statements?.[0]) setSelected(data.statements[0]);
  }, []);

  useEffect(() => {
    load().catch(() => setError('Could not load statements.'));
  }, [load]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/statements', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'generate_failed');
      setSelected(data.statement);
      await load();
    } catch {
      setError('Could not generate a statement. Sign a synthetic case first.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageList
      hero={
        <PageHero
          eyebrow="TPA Portal"
          title="Monthly statement"
          subtitle="Platform PMPM plus one clinical review tier. Rules/auto and gold-card post at $0."
          actions={
            <button type="button" className="btn btn-primary" onClick={() => void generate()} disabled={busy}>
              {busy ? 'Generating…' : 'Generate this month'}
            </button>
          }
        />
      }
    >
      <div className="card p-5 md:p-6">
        <PageSectionHeading
          hint={
            <Link href="/portal/tpa/determinations" className="text-xs text-navy underline">
              Determinations →
            </Link>
          }
        >
          Draft statements
        </PageSectionHeading>
        {error && <p className="text-sm text-red-700 mb-3">{error}</p>}
        {statements === null && <p className="text-sm text-muted">Loading…</p>}
        {statements && statements.length === 0 && !selected && (
          <EmptyState
            tone="gold"
            title="No statement yet."
            body="Generate a draft to group open ledger events for this test client."
          />
        )}
        {statements && statements.length > 0 && (
          <ul className="space-y-2 mb-6">
            {statements.map((s) => (
              <li key={s.statement_id}>
                <button
                  type="button"
                  onClick={() => setSelected(s)}
                  className={`text-left w-full rounded-lg border px-3 py-2 text-sm ${
                    selected?.statement_id === s.statement_id
                      ? 'border-navy bg-navy/5'
                      : 'border-border hover:border-navy/40'
                  }`}
                >
                  {s.client_name} · {s.period_start.slice(0, 10)} – {s.period_end.slice(0, 10)} ·{' '}
                  {money(s.subtotal)}
                </button>
              </li>
            ))}
          </ul>
        )}
        {selected && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-lg text-navy">{selected.client_name}</h3>
              <div className="flex gap-2">
                <a
                  href={`/api/billing/statements/${selected.statement_id}?format=html`}
                  className="text-xs text-navy underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  HTML
                </a>
                <a
                  href={`/api/billing/statements/${selected.statement_id}?format=pdf`}
                  className="text-xs text-navy underline"
                >
                  PDF
                </a>
              </div>
            </div>
            <p className="text-xs text-muted mb-3">
              {selected.events.length} open event{selected.events.length === 1 ? '' : 's'} · draft ·{' '}
              {money(selected.subtotal)}
            </p>
            {selected.two_line ? (
              <div className="space-y-4">
                <p className="text-xs text-muted">{selected.two_line.denominator_label}</p>
                <div>
                  <h4 className="text-sm font-medium text-navy mb-2">Platform</h4>
                  <p className="text-sm">
                    {selected.two_line.platform.present
                      ? `${selected.two_line.platform.label} · ${money(selected.two_line.platform.amount)}`
                      : 'Platform line not posted. Supply lives-in-month. The $1.50 PMPM is not waived unless platform_fee_waived is set.'}
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-navy mb-2">Clinical review</h4>
                  <table className="min-w-full text-sm">
                    <thead className="text-xs uppercase tracking-wide text-muted">
                      <tr>
                        <th className="text-left py-2">Tier</th>
                        <th className="text-left py-2">Case</th>
                        <th className="text-right py-2">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {selected.two_line.clinical.length === 0 && (
                        <tr>
                          <td className="py-2" colSpan={3}>
                            No review lines.
                          </td>
                        </tr>
                      )}
                      {selected.two_line.clinical.map((line) => (
                        <tr key={`${line.case_id}-${line.tier}`}>
                          <td className="py-2">{line.zero_priced ? `${line.label} ($0)` : line.label}</td>
                          <td className="py-2 font-mono text-xs">{line.case_id}</td>
                          <td className="py-2 text-right">{money(line.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
            <table className="min-w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="text-left py-2">SKU</th>
                  <th className="text-left py-2">Case</th>
                  <th className="text-right py-2">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {selected.events.map((e) => (
                  <tr key={e.billable_event_id}>
                    <td className="py-2">{e.sku}</td>
                    <td className="py-2 font-mono text-xs">{e.case_id}</td>
                    <td className="py-2 text-right">{money(e.unit_price * e.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
        )}
      </div>
    </PageList>
  );
}
