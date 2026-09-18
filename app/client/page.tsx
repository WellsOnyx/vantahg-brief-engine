'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  PageDashboard,
  PageHero,
  PageSectionHeading,
  StatCard,
} from '@/components/layouts/PageLayouts';
import { SectionCard } from '@/components/SectionCard';
import { EmptyState } from '@/components/EmptyState';

interface ClientCase {
  case_id: string;
  case_number: string;
  type: string;
  state: string;
  priority: string;
  sla_due_at: string | null;
  sla_status: string;
  determination: string | null;
  determined_at: string | null;
  parent_case_id: string | null;
  fanout_status: string;
}

interface PortalDetermination {
  case_id: string;
  case_number: string;
  type: string;
  determination: string | null;
  determined_at: string | null;
  download_url: string;
}

interface StatementSummary {
  statement_id: string;
  period_start: string;
  period_end: string;
  subtotal: number;
  event_count: number;
  status: string;
}

interface ClientLens {
  view: 'client';
  client_id: string;
  open_cases: ClientCase[];
  sla: { ok: number; at_risk: number; missed: number };
  determinations: PortalDetermination[];
  appeals: ClientCase[];
  statements: StatementSummary[];
  config: {
    legal_name: string;
    sla_hours_standard: number;
    sla_hours_urgent: number;
    timezone: string;
    cx_owner: string;
    escalation_contacts: Array<{ name: string; role: string; email?: string }>;
    version: number | null;
  } | null;
}

const SLA_PILL: Record<string, string> = {
  ok: 'bg-emerald-50 text-emerald-800',
  at_risk: 'bg-amber-50 text-amber-800',
  missed: 'bg-red-50 text-red-800',
};

function slaClock(dueAt: string | null): string {
  if (!dueAt) return 'No SLA';
  const hours = Math.round((new Date(dueAt).getTime() - Date.now()) / 3600_000);
  if (hours < 0) return `${Math.abs(hours)}h overdue`;
  return `${hours}h left`;
}

function money(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function ClientLensPage() {
  const [lens, setLens] = useState<ClientLens | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (seed = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(seed ? '/api/views/client?seed=synthetic' : '/api/views/client', {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setLens(data as ClientLens);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load client lens');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  return (
    <PageDashboard
      hero={
        <PageHero
          eyebrow="Client lens"
          title="Status, clocks, decisions."
          subtitle="One case object. This surface is SLA + determinations + statements — no internal CX notes, no other tenants, no raw briefs."
          actions={
            <div className="flex gap-2">
              <Link href="/portal/tpa/determinations" className="btn btn-primary text-sm">
                Determinations
              </Link>
              <Link href="/portal/tpa/statements" className="text-sm text-white/80 underline">
                Statements
              </Link>
            </div>
          }
        />
      }
    >
      {loading && <p className="text-sm text-muted">Loading client lens…</p>}
      {error && (
        <SectionCard title="Could not load">
          <p className="text-sm">{error}</p>
          <button type="button" className="btn-primary text-sm mt-3" onClick={() => void load(true)}>
            Retry
          </button>
        </SectionCard>
      )}

      {lens && (
        <>
          <PageDashboard.Stats>
            <StatCard label="Open" value={lens.open_cases.length} hint="Non-terminal" />
            <StatCard label="SLA ok" value={lens.sla.ok} />
            <StatCard label="At risk" value={lens.sla.at_risk} accent={lens.sla.at_risk > 0} />
            <StatCard label="Missed" value={lens.sla.missed} accent={lens.sla.missed > 0} />
          </PageDashboard.Stats>

          <PageDashboard.Body
            main={
              <div className="space-y-6">
                <SectionCard eyebrow="Open cases" title="SLA clocks">
                  {lens.open_cases.length === 0 ? (
                    <EmptyState
                      title="No open cases."
                      body="Synthetic intake lands here with a running clock."
                    />
                  ) : (
                    <ul className="divide-y divide-border">
                      {lens.open_cases.map((c) => (
                        <li key={c.case_id} className="py-3 first:pt-0 last:pb-0 flex flex-wrap justify-between gap-2">
                          <div>
                            <p className="font-mono text-xs text-navy font-semibold">{c.case_number}</p>
                            <p className="text-xs text-muted">
                              {c.type.replaceAll('_', ' ')} · {c.state}
                              {c.parent_case_id ? ' · appeal' : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs ${SLA_PILL[c.sla_status] ?? ''}`}>
                              {c.sla_status} · {slaClock(c.sla_due_at)}
                            </span>
                            {c.determination && (
                              <span className="text-xs capitalize text-navy">{c.determination}</span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>

                <SectionCard
                  eyebrow="Decisions"
                  title="Signed determinations"
                  hint={
                    <Link href="/portal/tpa/determinations" className="text-xs text-navy underline">
                      All packages →
                    </Link>
                  }
                >
                  {lens.determinations.length === 0 ? (
                    <p className="text-sm text-muted">No signed packages yet.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {lens.determinations.map((d) => (
                        <li key={d.case_id} className="py-3 first:pt-0 last:pb-0 flex justify-between gap-3">
                          <div>
                            <p className="font-mono text-xs">{d.case_number}</p>
                            <p className="text-xs text-muted capitalize">{d.determination}</p>
                          </div>
                          <a href={`${d.download_url}?format=html`} className="text-xs text-navy underline" download>
                            Download letter
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>
              </div>
            }
            aside={
              <div className="space-y-4">
                <SectionCard eyebrow="Invoices" title="Statements" accent>
                  {lens.statements.length === 0 ? (
                    <p className="text-sm text-muted">No statement this period.</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {lens.statements.map((s) => (
                        <li key={s.statement_id}>
                          <Link href="/portal/tpa/statements" className="text-navy underline">
                            {s.period_start.slice(0, 10)} – {s.period_end.slice(0, 10)}
                          </Link>
                          <p className="text-xs text-muted">
                            {s.event_count} events · {money(s.subtotal)} · {s.status}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>

                <SectionCard eyebrow="Config" title="Read-only SLAs">
                  {!lens.config ? (
                    <p className="text-sm text-muted">No published config.</p>
                  ) : (
                    <dl className="text-sm space-y-2">
                      <div>
                        <dt className="text-xs text-muted">Legal name</dt>
                        <dd>{lens.config.legal_name}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">Standard / urgent</dt>
                        <dd>
                          {lens.config.sla_hours_standard}h / {lens.config.sla_hours_urgent}h
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">CX owner</dt>
                        <dd>{lens.config.cx_owner}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">Contacts</dt>
                        <dd>
                          {lens.config.escalation_contacts.map((c) => c.name).join(', ') || '—'}
                        </dd>
                      </div>
                    </dl>
                  )}
                </SectionCard>

                {lens.appeals.length > 0 && (
                  <SectionCard eyebrow="Appeals" title="Linked to prior auth">
                    <ul className="text-xs space-y-1">
                      {lens.appeals.map((a) => (
                        <li key={a.case_id} className="font-mono">
                          {a.case_number}
                        </li>
                      ))}
                    </ul>
                  </SectionCard>
                )}
              </div>
            }
          />
        </>
      )}

      <PageDashboard.Help>
        <PageSectionHeading>Same case. Three lenses.</PageSectionHeading>
        <p className="text-sm text-muted">
          Client sees status. CX sees health without the packet. Med review signs.
        </p>
      </PageDashboard.Help>
    </PageDashboard>
  );
}
