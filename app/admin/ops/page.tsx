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
  um_pricing?: {
    planning: {
      inbound: number;
      auto_pct: number | null;
      nurse_pct: number | null;
      md_pct: number | null;
      external_pct: number | null;
      first_pass_pct: number | null;
      first_pass_note: string;
      billed_pepm: number | null;
      billed_pmpm: number | null;
      contribution: number | null;
      denominator_label: string;
    };
    book: {
      inbound: number;
      auto_pct: number | null;
      nurse_pct: number | null;
      md_pct: number | null;
      external_pct: number | null;
      first_pass_pct: number | null;
      billed_pepm: number | null;
      billed_pmpm: number | null;
      contribution: number | null;
      denominator_label: string;
      unclassified: number;
    };
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

          {board.um_pricing && (
            <>
              <SectionCard
                eyebrow="Planning lock · 333k EE / 500k lives"
                title="Two-line UM price tiles"
              >
                <p className="text-sm text-muted mb-4">{board.um_pricing.planning.denominator_label}</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <StatCard label="Inbound" value={board.um_pricing.planning.inbound.toLocaleString()} hint="750k planning inbound" />
                  <StatCard label="Auto %" value={`${board.um_pricing.planning.auto_pct}%`} hint="Rules/auto · $0 review" />
                  <StatCard label="Nurse %" value={`${board.um_pricing.planning.nurse_pct}%`} />
                  <StatCard label="MD %" value={`${board.um_pricing.planning.md_pct}%`} />
                  <StatCard label="External %" value={`${board.um_pricing.planning.external_pct}%`} />
                  <StatCard label="First-pass %" value="—" hint={board.um_pricing.planning.first_pass_note} />
                  <StatCard label="Billed PEPM" value={`$${board.um_pricing.planning.billed_pepm?.toFixed(2)}`} hint="333k employees" />
                  <StatCard label="Billed PMPM" value={`$${board.um_pricing.planning.billed_pmpm?.toFixed(2)}`} hint="500k lives" />
                  <StatCard
                    label="Contribution"
                    value={
                      board.um_pricing.planning.contribution == null
                        ? '—'
                        : `$${(board.um_pricing.planning.contribution / 1_000_000).toFixed(2)}M`
                    }
                    hint="Exact dollars on the planning case"
                  />
                </div>
              </SectionCard>
              <SectionCard eyebrow="This book" title="Routed cases on the scoreboard">
                <p className="text-sm text-muted mb-4">{board.um_pricing.book.denominator_label}</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <StatCard label="Book inbound" value={board.um_pricing.book.inbound} hint={`Unclassified ${board.um_pricing.book.unclassified}`} />
                  <StatCard label="Book auto %" value={board.um_pricing.book.auto_pct == null ? '—' : `${board.um_pricing.book.auto_pct}%`} />
                  <StatCard label="Book nurse %" value={board.um_pricing.book.nurse_pct == null ? '—' : `${board.um_pricing.book.nurse_pct}%`} />
                  <StatCard label="Book MD %" value={board.um_pricing.book.md_pct == null ? '—' : `${board.um_pricing.book.md_pct}%`} />
                  <StatCard label="Book external %" value={board.um_pricing.book.external_pct == null ? '—' : `${board.um_pricing.book.external_pct}%`} />
                  <StatCard label="Book contribution" value={board.um_pricing.book.contribution ?? '—'} hint="Review charges minus fully loaded path cost" />
                </div>
                <p className="text-xs text-muted mt-4">
                  Validate 750k inbound against the live book before staffing the 285k nurse plan.
                  Planning tiles are the locked card. Book tiles are this scoreboard only.
                </p>
              </SectionCard>
            </>
          )}

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
