'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHero, PageList } from '@/components/layouts/PageLayouts';
import { SectionCard } from '@/components/SectionCard';
import { EmptyState } from '@/components/EmptyState';
import type { CanonicalCase } from '@/lib/case-spine/types';

const PRIORITY_STYLES: Record<string, string> = {
  expedited: 'bg-red-50 text-red-800',
  urgent: 'bg-amber-50 text-amber-800',
  standard: 'bg-slate-100 text-slate-700',
};

function slaLabel(dueAt: string | null): string {
  if (!dueAt) return 'No SLA';
  const ms = new Date(dueAt).getTime() - Date.now();
  const hours = Math.round(ms / 3600_000);
  if (hours < 0) return `${Math.abs(hours)}h overdue`;
  return `${hours}h left`;
}

export default function MedReviewQueuePage() {
  const [cases, setCases] = useState<CanonicalCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async (seedEmpty = false) => {
    setLoading(true);
    setError(null);
    try {
      const url = seedEmpty ? '/api/case-spine/md-queue?seed=synthetic' : '/api/case-spine/md-queue';
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setCases(data.cases ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function seedQueue() {
    setSeeding(true);
    try {
      const res = await fetch('/api/case-spine/md-queue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seed: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setCases(data.cases ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Seed failed');
    } finally {
      setSeeding(false);
    }
  }

  return (
    <PageList
      hero={
        <PageHero
          eyebrow="Med review lens"
          title="Sign queue, sorted by SLA."
          subtitle="Same case object as Client and CX. Packet + brief live here only. MFA required in production; session timeout is aggressive. Synthetic refs — no live PHI."
          actions={
            <div className="flex items-center gap-3">
              <Link href="/cx" className="text-sm text-white/70 underline">
                CX lens
              </Link>
              <button
                type="button"
                onClick={seedQueue}
                disabled={seeding}
                className="btn-primary text-sm"
              >
                {seeding ? 'Seeding…' : 'Load synthetic pack'}
              </button>
            </div>
          }
        />
      }
    >
      <PageList.Stats>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wider text-muted">In md_queue</div>
          <div className="text-2xl font-semibold text-navy mt-1">{cases.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wider text-muted">Sort</div>
          <div className="text-sm font-medium text-navy mt-2">SLA due, then priority</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wider text-muted">Session</div>
          <div className="text-sm font-medium text-navy mt-2">MFA · short timeout</div>
        </div>
      </PageList.Stats>

      {loading && (
        <SectionCard>
          <p className="text-sm text-muted">Loading med review queue…</p>
        </SectionCard>
      )}

      {error && !loading && (
        <SectionCard title="Could not load queue">
          <p className="text-sm">{error}</p>
          <button type="button" className="btn-primary text-sm mt-3" onClick={() => void load()}>
            Retry
          </button>
        </SectionCard>
      )}

      {!loading && !error && cases.length === 0 && (
        <EmptyState
          title="The MD queue is clear."
          body="Load a synthetic pack to walk brief → sign without live PHI."
          action={{ label: 'Load synthetic pack', onClick: seedQueue }}
        />
      )}

      {!loading && !error && cases.length > 0 && (
        <SectionCard eyebrow="Queue" title="Cases waiting for MD sign" padding="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/5">
                  <th className="text-left text-xs font-medium text-muted uppercase tracking-wider px-4 py-3">Case</th>
                  <th className="text-left text-xs font-medium text-muted uppercase tracking-wider px-4 py-3">Member ref</th>
                  <th className="text-left text-xs font-medium text-muted uppercase tracking-wider px-4 py-3">Service</th>
                  <th className="text-left text-xs font-medium text-muted uppercase tracking-wider px-4 py-3">Priority</th>
                  <th className="text-left text-xs font-medium text-muted uppercase tracking-wider px-4 py-3">SLA</th>
                  <th className="text-left text-xs font-medium text-muted uppercase tracking-wider px-4 py-3">Brief</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.case_id} className="border-b border-border last:border-b-0 hover:bg-muted/5">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-navy">{c.case_number}</div>
                      <div className="text-xs text-muted">{c.type}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">{c.intake.member_ref || '—'}</td>
                    <td className="px-4 py-3 text-sm text-muted">{c.intake.service_or_rx || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${PRIORITY_STYLES[c.priority] ?? PRIORITY_STYLES.standard}`}>
                        {c.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div>{slaLabel(c.sla_due_at)}</div>
                      <div className="text-xs text-muted">{c.sla_status}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {c.brief_id ? `${c.brief_id.slice(0, 8)}…` : 'missing'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/med-review/${c.case_id}`} className="text-sm text-navy hover:text-gold font-medium">
                        Open packet →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </PageList>
  );
}
