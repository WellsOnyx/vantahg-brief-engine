'use client';

import { useEffect, useState } from 'react';
import { PageList, PageHero } from '@/components/layouts/PageLayouts';
import { SectionCard } from '@/components/SectionCard';
import { EmptyState } from '@/components/EmptyState';
import { MetricValue, type MetricFormat } from '@/components/MetricValue';

interface Invoice {
  id: string;
  invoice_number: string;
  client_id: string;
  client_name: string | null;
  period_start: string;
  period_end: string;
  pepm_rate_cents: number;
  member_count: number;
  total_cents: number;
  status: 'draft' | 'sent' | 'paid' | 'void';
  sent_at: string | null;
  paid_at: string | null;
  created_at: string;
  meow_invoice_id: string | null;
  meow_status: string | null;
  meow_payment_url: string | null;
}

interface Client {
  id: string;
  name: string;
}

const STATUS_PILL: Record<Invoice['status'], string> = {
  draft: 'bg-gray-50 text-gray-700 border-gray-200',
  sent: 'bg-blue-50 text-blue-800 border-blue-200',
  paid: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  void: 'bg-red-50 text-red-800 border-red-200',
};

function fmtCents(c: number): string {
  return (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showGenerate, setShowGenerate] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState('');
  const [period, setPeriod] = useState('');
  const [memberOverride, setMemberOverride] = useState('');
  const [rateOverride, setRateOverride] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genSuccess, setGenSuccess] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/admin/invoices', { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) setError('Sign in as admin to view invoices.');
        else setError(`Failed to load (${res.status})`);
        return;
      }
      const data = (await res.json()) as { invoices: Invoice[] };
      setInvoices(data.invoices ?? []);
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }

  async function loadClients() {
    try {
      const res = await fetch('/api/clients', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setClients(Array.isArray(data) ? data : (data.clients ?? []));
    } catch {
      // silent
    }
  }

  useEffect(() => { void load(); }, []);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setGenError(null); setGenSuccess(null); setGenerating(true);
    try {
      const body: Record<string, unknown> = { client_id: clientId };
      if (period) body.period = period;
      if (memberOverride) body.member_count_override = Number(memberOverride);
      if (rateOverride) body.pepm_rate_cents_override = Math.round(Number(rateOverride) * 100);
      const res = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenError(data.error ?? `Failed (${res.status})`);
        return;
      }
      setGenSuccess(`Generated ${data.invoice_number} (${fmtCents(data.total_cents)})`);
      await load();
      setClientId(''); setPeriod(''); setMemberOverride(''); setRateOverride('');
    } catch {
      setGenError('Network error');
    } finally {
      setGenerating(false);
    }
  }

  const totalOutstanding = invoices
    .filter((i) => i.status === 'sent')
    .reduce((s, i) => s + i.total_cents, 0);
  const totalPaid = invoices
    .filter((i) => i.status === 'paid')
    .reduce((s, i) => s + i.total_cents, 0);
  const draftCount = invoices.filter((i) => i.status === 'draft').length;

  return (
    <PageList
      hero={
        <PageHero
          eyebrow="Billing"
          title="Invoices"
          subtitle="Monthly PEPM invoices, one per TPA per period. Generate at month-end, mark sent, then mark paid as remittance comes in."
          actions={
            <button
              onClick={() => { setShowGenerate(true); void loadClients(); }}
              className="btn-primary text-sm"
            >
              Generate invoice
            </button>
          }
        />
      }
    >
      {invoices.length > 0 && (
        <PageList.Stats>
          <MetricCard label="Outstanding" value={totalOutstanding} format="currency" />
          <MetricCard label="Paid" value={totalPaid} format="currency" />
          <MetricCard label="Drafts" value={draftCount} />
          <MetricCard label="Total invoices" value={invoices.length} />
        </PageList.Stats>
      )}

      {error && error.includes('Sign in as admin') ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <div className="card p-8 text-center max-w-sm">
            <p className="text-sm text-muted">Admin access required to view invoices.</p>
            <a href="/login" className="mt-4 inline-block text-navy underline text-sm">Sign in with an admin account →</a>
          </div>
        </div>
      ) : error ? (
        <div className="text-red-700 text-sm">{error}</div>
      ) : null}

      {showGenerate && (
        <SectionCard
          eyebrow="Action"
          title="Generate invoice"
          hint={
            <button
              onClick={() => setShowGenerate(false)}
              className="text-sm text-muted hover:text-navy"
            >
              Cancel
            </button>
          }
        >
          <form onSubmit={generate} className="space-y-3 max-w-2xl">
            <div>
              <label className="text-xs text-muted uppercase tracking-wide font-medium block mb-1.5">Client</label>
              <select
                required
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">— Select —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted uppercase tracking-wide font-medium block mb-1.5">Period (YYYY-MM)</label>
                <input
                  type="text"
                  placeholder="leave blank for last month"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted uppercase tracking-wide font-medium block mb-1.5">Members (override)</label>
                <input
                  type="number"
                  min={0}
                  value={memberOverride}
                  onChange={(e) => setMemberOverride(e.target.value)}
                  className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted uppercase tracking-wide font-medium block mb-1.5">PEPM $ (override)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={rateOverride}
                  onChange={(e) => setRateOverride(e.target.value)}
                  className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            {genError && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                {genError}
              </div>
            )}
            {genSuccess && (
              <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
                {genSuccess}
              </div>
            )}
            <button
              type="submit"
              disabled={generating || !clientId}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {generating ? 'Generating…' : 'Generate'}
            </button>
          </form>
        </SectionCard>
      )}

      {loading ? (
        <div className="p-6 text-sm text-muted animate-pulse">Loading invoices…</div>
      ) : invoices.length === 0 ? (
        <EmptyState
          title="Your first invoice arrives on the 1st."
          body="Monthly PEPM invoices generate at month-end, one per TPA. Generate one manually whenever you need to."
          action={{
            label: 'Generate invoice',
            onClick: () => { setShowGenerate(true); void loadClients(); },
          }}
          tone="gold"
        />
      ) : (
        <PageList.Body>
          <div className="overflow-x-auto card p-0">
            <table className="w-full text-sm">
              <thead className="bg-background text-muted text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">Invoice</th>
                  <th className="text-left px-4 py-2">Client</th>
                  <th className="text-left px-4 py-2">Period</th>
                  <th className="text-right px-4 py-2">Members</th>
                  <th className="text-right px-4 py-2">PEPM</th>
                  <th className="text-right px-4 py-2">Total</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Meow</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-background/50">
                    <td className="px-4 py-3 font-mono text-xs">{inv.invoice_number}</td>
                    <td className="px-4 py-3 font-semibold text-navy">{inv.client_name ?? '—'}</td>
                    <td className="px-4 py-3">{fmtDate(inv.period_start)} – {fmtDate(inv.period_end)}</td>
                    <td className="px-4 py-3 text-right">{inv.member_count.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{fmtCents(inv.pepm_rate_cents)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{fmtCents(inv.total_cents)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_PILL[inv.status]}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {inv.meow_invoice_id ? (
                        <>
                          <div className="text-muted font-mono">{inv.meow_status ?? '—'}</div>
                          {inv.meow_payment_url && (
                            <a href={inv.meow_payment_url} target="_blank" rel="noopener noreferrer" className="text-navy underline">Pay link →</a>
                          )}
                        </>
                      ) : (
                        <span className="text-muted">not pushed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PageList.Body>
      )}
    </PageList>
  );
}

function MetricCard({
  label,
  value,
  format = 'number',
}: {
  label: string;
  value: number | null | undefined;
  format?: MetricFormat;
}) {
  return (
    <div className="card p-4">
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold">{label}</p>
      <p className="text-3xl mt-1">
        <MetricValue value={value} format={format} />
      </p>
    </div>
  );
}
