'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  PageDashboard,
  PageHero,
  PageList,
  StatCard,
} from '@/components/layouts/PageLayouts';
import { SectionCard } from '@/components/SectionCard';
import { EmptyState } from '@/components/EmptyState';

interface CxCase {
  case_id: string;
  case_number: string;
  client_id: string;
  state: string;
  sla_status: string;
  sla_due_at: string | null;
  open_tasks: string[];
  fanout_status: string;
}

interface CxNote {
  note_id: string;
  kind: string;
  body: string;
  created_at: string;
}

interface HypercareItem {
  item_id: string;
  label: string;
  done: boolean;
  required: boolean;
}

interface CxTask {
  task_id: string;
  case_id: string;
  kind: string;
  status: string;
  note: string;
}

interface CxLens {
  view: 'cx';
  health: {
    open: number;
    at_risk: number;
    missed: number;
    stuck: number;
    fanout_failed: number;
    escalations: number;
  };
  stuck: CxCase[];
  escalations: CxCase[];
  hypercare: { done: number; remaining: number; required_remaining: number; items: HypercareItem[] };
  notes: CxNote[];
  resolve_fanout: CxTask[];
  golive?: {
    hypercare: { breached: boolean; note: string; miss_rate: number; threshold: number } | null;
    log: Array<{ entry_id: string; kind: string; message: string }>;
  };
}

const SLA_PILL: Record<string, string> = {
  ok: 'bg-emerald-50 text-emerald-800',
  at_risk: 'bg-amber-50 text-amber-800',
  missed: 'bg-red-50 text-red-800',
};

export default function CxLensPage() {
  const [lens, setLens] = useState<CxLens | null>(null);
  const [scoreboard, setScoreboard] = useState<{
    fanout: { fail_rate: number; failed: number; complete: number; open_cx_tasks: number };
    escalations: { l1: number; l2: number; l3: number; total: number };
  } | null>(null);
  const [stuckOnly, setStuckOnly] = useState(false);
  const [sla, setSla] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ seed: 'synthetic' });
      if (stuckOnly) params.set('stuck', '1');
      if (sla) params.set('sla_status', sla);
      const res = await fetch(`/api/views/cx?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setLens(data as CxLens);
      const ops = await fetch('/api/ops/scoreboard?seed=synthetic', { cache: 'no-store' });
      if (ops.ok) setScoreboard(await ops.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load CX lens');
    } finally {
      setLoading(false);
    }
  }, [stuckOnly, sla]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageDashboard
      hero={
        <PageHero
          eyebrow="CX lens"
          title="Keep accounts healthy."
          subtitle="Stuck cases, R10–R12 escalations, hypercare, and non-PHI notes. Clinical packets stay on Med review."
          actions={
            <span className="flex gap-4">
              <Link href="/med-review" className="text-sm text-white/80 underline">
                Med review queue →
              </Link>
              <Link href="/admin/onboarding" className="text-sm text-white/80 underline">
                Onboarding A→E →
              </Link>
            </span>
          }
        />
      }
    >
      {loading && <p className="text-sm text-muted">Loading CX lens…</p>}
      {error && (
        <SectionCard title="Could not load">
          <p className="text-sm">{error}</p>
        </SectionCard>
      )}

      {lens && (
        <>
          {lens.golive?.hypercare?.breached && (
            <SectionCard title="Rollback — stay on shadow">
              <p className="text-sm text-red-800">{lens.golive.hypercare.note}</p>
            </SectionCard>
          )}
          <PageDashboard.Stats>
            <StatCard label="Open" value={lens.health.open} />
            <StatCard label="At-risk SLA" value={lens.health.at_risk} accent={lens.health.at_risk > 0} />
            <StatCard label="Breached" value={lens.health.missed} accent={lens.health.missed > 0} />
            <StatCard label="Stuck" value={lens.health.stuck} hint="Clinicals / fan-out" />
            <StatCard
              label="Fan-out fail"
              value={scoreboard ? `${Math.round(scoreboard.fanout.fail_rate * 100)}%` : '—'}
              hint={scoreboard ? `${scoreboard.fanout.failed}/${scoreboard.fanout.complete + scoreboard.fanout.failed}` : undefined}
              accent={Boolean(scoreboard && scoreboard.fanout.failed > 0)}
            />
            <StatCard
              label="Escalations"
              value={scoreboard?.escalations.total ?? lens.health.escalations}
              hint={scoreboard ? `R10 ${scoreboard.escalations.l1} · R11 ${scoreboard.escalations.l2} · R12 ${scoreboard.escalations.l3}` : 'R10–R12'}
            />
          </PageDashboard.Stats>

          <PageList.Filters>
            <label className="text-xs flex items-center gap-2">
              <input type="checkbox" checked={stuckOnly} onChange={(e) => setStuckOnly(e.target.checked)} />
              Stuck only
            </label>
            <select
              className="text-xs border border-border rounded px-2 py-1"
              value={sla}
              onChange={(e) => setSla(e.target.value)}
            >
              <option value="">All SLA</option>
              <option value="ok">SLA ok</option>
              <option value="at_risk">At risk</option>
              <option value="missed">Missed</option>
            </select>
          </PageList.Filters>

          <PageDashboard.Body
            main={
              <div className="space-y-6">
                <SectionCard eyebrow="Stuck" title="Awaiting clinicals / fan-out">
                  {lens.stuck.length === 0 ? (
                    <EmptyState title="Nothing stuck." body="Incomplete intake and failed fan-out land here." />
                  ) : (
                    <CaseRows cases={lens.stuck} />
                  )}
                </SectionCard>

                <SectionCard eyebrow="R10–R12" title="Escalations">
                  {lens.escalations.length === 0 ? (
                    <p className="text-sm text-muted">No escalation tasks.</p>
                  ) : (
                    <CaseRows cases={lens.escalations} />
                  )}
                </SectionCard>

                <SectionCard eyebrow="Fan-out" title="resolve_fanout tasks">
                  {lens.resolve_fanout.length === 0 ? (
                    <p className="text-sm text-muted">No open fan-out tasks.</p>
                  ) : (
                    <ul className="divide-y divide-border text-sm">
                      {lens.resolve_fanout.map((t) => (
                        <li key={t.task_id} className="py-2">
                          <p className="font-mono text-xs">{t.case_id}</p>
                          <p className="text-xs text-muted">{t.note}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>
              </div>
            }
            aside={
              <div className="space-y-4">
                <SectionCard eyebrow="Hypercare" title={`First 25 · ${lens.hypercare.done}/25`} accent>
                  <p className="text-xs text-muted mb-2">
                    {lens.hypercare.required_remaining} required remaining
                  </p>
                  <ul className="space-y-1 max-h-64 overflow-y-auto text-xs">
                    {lens.hypercare.items.map((item) => (
                      <li key={item.item_id} className={item.done ? 'text-muted line-through' : 'text-navy'}>
                        {item.done ? '✓' : '○'} {item.label}
                      </li>
                    ))}
                  </ul>
                </SectionCard>

                <SectionCard eyebrow="Non-PHI" title="Relationship notes">
                  {lens.notes.length === 0 ? (
                    <p className="text-sm text-muted">No notes.</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {lens.notes.map((n) => (
                        <li key={n.note_id}>
                          <p className="text-[10px] uppercase tracking-wider text-muted">{n.kind}</p>
                          <p>{n.body}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>
              </div>
            }
          />
        </>
      )}
    </PageDashboard>
  );
}

function CaseRows({ cases }: { cases: CxCase[] }) {
  return (
    <ul className="divide-y divide-border">
      {cases.map((c) => (
        <li key={c.case_id} className="py-3 first:pt-0 last:pb-0 flex justify-between gap-2">
          <div>
            <p className="font-mono text-xs font-semibold text-navy">{c.case_number}</p>
            <p className="text-xs text-muted">
              {c.state} · {c.open_tasks.join(', ') || 'no tasks'}
            </p>
          </div>
          <span className={`px-2 py-0.5 rounded-full text-xs h-fit ${SLA_PILL[c.sla_status] ?? ''}`}>
            {c.sla_status}
          </span>
        </li>
      ))}
    </ul>
  );
}
