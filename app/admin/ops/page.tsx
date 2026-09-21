'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PageDashboard, PageHero, StatCard } from '@/components/layouts/PageLayouts';
import { SectionCard } from '@/components/SectionCard';

interface OpsScoreboard {
  view: 'ops';
  client_id: string | null;
  fanout: {
    complete: number;
    failed: number;
    pending: number;
    attempted: number;
    fail_rate: number;
    open_cx_tasks: number;
  };
  stuck: {
    count: number;
    awaiting_clinicals: number;
    fanout_failed: number;
  };
  escalations: {
    l1: number;
    l2: number;
    l3: number;
    total: number;
  };
}

export default function AdminOpsScoreboardPage() {
  const [board, setBoard] = useState<OpsScoreboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ops/scoreboard?seed=synthetic', { cache: 'no-store' });
      const data = await res.json();
      if (res.status === 401 || res.status === 403) {
        setError('CX or admin role required.');
        return;
      }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setBoard(data as OpsScoreboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ops scoreboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageDashboard
      hero={
        <PageHero
          eyebrow="Phase 6.3 · Internal ops"
          title="Ops scoreboard."
          subtitle="Fan-out fail rate and stuck-case counts. Aggregates only — no member names, packets, or other PHI."
          actions={
            <span className="flex gap-4">
              <Link href="/cx" className="text-sm text-white/80 underline">
                CX lens →
              </Link>
              <Link href="/admin/onboarding" className="text-sm text-white/80 underline">
                Onboarding A→E →
              </Link>
            </span>
          }
        />
      }
    >
      {loading && <p className="text-sm text-muted">Loading ops scoreboard…</p>}
      {error && (
        <SectionCard title="Could not load">
          <p className="text-sm">{error}</p>
        </SectionCard>
      )}

      {board && (
        <>
          <PageDashboard.Stats>
            <StatCard
              label="Fan-out fail"
              value={`${Math.round(board.fanout.fail_rate * 100)}%`}
              hint={`${board.fanout.failed}/${board.fanout.attempted} attempted`}
              accent={board.fanout.failed > 0}
            />
            <StatCard
              label="Stuck cases"
              value={board.stuck.count}
              hint={`Clinicals ${board.stuck.awaiting_clinicals} · Fan-out ${board.stuck.fanout_failed}`}
              accent={board.stuck.count > 0}
            />
            <StatCard
              label="Open CX tasks"
              value={board.fanout.open_cx_tasks}
              hint="resolve_fanout"
              accent={board.fanout.open_cx_tasks > 0}
            />
            <StatCard
              label="Escalations"
              value={board.escalations.total}
              hint={`R10 ${board.escalations.l1} · R11 ${board.escalations.l2} · R12 ${board.escalations.l3}`}
              accent={board.escalations.total > 0}
            />
          </PageDashboard.Stats>

          <SectionCard eyebrow="Internal" title="What these numbers mean">
            <ul className="text-sm text-muted space-y-2">
              <li>
                <span className="text-navy font-medium">Fan-out fail rate</span> is failed ÷ (complete + failed).
                Pending deliveries are excluded from the denominator.
              </li>
              <li>
                <span className="text-navy font-medium">Stuck cases</span> are incomplete clinicals
                (`intake_incomplete` / `awaiting_clinicals` / `request_clinicals`) plus failed fan-out
                (`fanout_failed` / `resolve_fanout`).
              </li>
              <li>Case lists stay on the CX lens. This page never returns member refs or packets.</li>
            </ul>
          </SectionCard>
        </>
      )}
    </PageDashboard>
  );
}
