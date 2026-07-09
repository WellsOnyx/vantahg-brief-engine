'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  PageDashboard,
  PageHero,
  PageEyebrow,
  PageSectionHeading,
  StatCard,
} from '@/components/layouts/PageLayouts';
import { volumeSnapshot, type VolumeSnapshot } from '@/lib/demo-live';
import type { Case } from '@/lib/types';

/**
 * Medical Review dashboard — the clinical counterpart to /concierge.
 *
 * Frames the clinician's day: worklist in SLA order with the AI's
 * recommendation + deterministic fact-check score beside every case,
 * brief-quality telemetry, and the wall made explicit — the AI reads,
 * extracts, drafts, and verifies; the licensed clinician decides, and
 * every decision carries rationale + attestation into the audit trail.
 *
 * Data: /api/queue (role-aware worklist; demo mode returns the full demo
 * case layer so click-through lands on complete case detail). The live
 * clinical-flow card renders ONLY in demo mode (simulated telemetry from
 * lib/demo-live) — real deployments never see synthetic numbers.
 */

interface QueueMeta {
  total: number;
  overdue_count: number;
  critical_count: number;
  completed_today: number;
}

const STATUS_LABEL: Record<string, string> = {
  intake: 'Intake',
  processing: 'Processing',
  brief_ready: 'Brief Ready',
  lpn_review: 'LPN Review',
  rn_review: 'RN Review',
  md_review: 'MD Review',
  pend_missing_info: 'Pending Info',
};

const STATUS_PILL: Record<string, string> = {
  lpn_review: 'bg-teal-50 text-teal-800 border-teal-200',
  rn_review: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  md_review: 'bg-purple-50 text-purple-800 border-purple-200',
  pend_missing_info: 'bg-amber-50 text-amber-800 border-amber-200',
};

function slaPill(deadline: string | null): { label: string; tone: string } {
  if (!deadline) return { label: 'No SLA', tone: 'bg-gray-50 text-gray-700 border-gray-200' };
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms < 0) return { label: 'OVERDUE', tone: 'bg-red-50 text-red-800 border-red-200' };
  const hours = ms / 3_600_000;
  if (hours < 4) return { label: `${hours.toFixed(1)}h left`, tone: 'bg-red-50 text-red-800 border-red-200' };
  if (hours < 24) return { label: `${hours.toFixed(1)}h left`, tone: 'bg-amber-50 text-amber-800 border-amber-200' };
  return { label: `${Math.round(hours)}h left`, tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
}

function recChip(rec?: string): { label: string; tone: string } | null {
  if (!rec) return null;
  const map: Record<string, { label: string; tone: string }> = {
    approve: { label: 'AI: approve', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    deny: { label: 'AI: deny', tone: 'bg-red-50 text-red-800 border-red-200' },
    modify: { label: 'AI: modify', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
    pend: { label: 'AI: pend for info', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  };
  return map[rec] ?? { label: `AI: ${rec}`, tone: 'bg-gray-50 text-gray-700 border-gray-200' };
}

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Up late';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function MedicalReviewPage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [meta, setMeta] = useState<QueueMeta>({ total: 0, overdue_count: 0, critical_count: 0, completed_today: 0 });
  const [demo, setDemo] = useState(false);
  const [flow, setFlow] = useState<VolumeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [queueRes, healthRes] = await Promise.all([
        fetch('/api/queue?role=admin', { cache: 'no-store' }),
        fetch('/api/health', { cache: 'no-store' }),
      ]);
      if (!queueRes.ok) {
        setError(queueRes.status === 401 ? 'Sign in required.' : `Could not load the worklist (${queueRes.status}).`);
        return;
      }
      const q = (await queueRes.json()) as { cases: Case[]; meta: QueueMeta };
      setCases(q.cases ?? []);
      setMeta(q.meta ?? { total: 0, overdue_count: 0, critical_count: 0, completed_today: 0 });
      if (healthRes.ok) {
        const h = (await healthRes.json()) as { database?: string };
        setDemo(h.database === 'demo_mode');
      }
    } catch {
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Simulated clinical-flow telemetry — demo mode only, ticking gently.
  useEffect(() => {
    if (!demo) return;
    setFlow(volumeSnapshot());
    const t = setInterval(() => setFlow(volumeSnapshot()), 8_000);
    return () => clearInterval(t);
  }, [demo]);

  if (loading) {
    return (
      <PageDashboard
        hero={<PageHero eyebrow="Medical Review" title="Loading…" subtitle="Pulling the clinical worklist." />}
      >
        <PageDashboard.Stats>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card p-4">
              <div className="skeleton skeleton-text" />
              <div className="skeleton skeleton-heading" />
            </div>
          ))}
        </PageDashboard.Stats>
      </PageDashboard>
    );
  }

  if (error) {
    return (
      <PageDashboard
        hero={<PageHero eyebrow="Medical Review" title="We hit a snag" subtitle={error} />}
      >
        <div className="card p-6 text-center">
          <button onClick={() => load()} className="btn btn-primary">Try again</button>
        </div>
      </PageDashboard>
    );
  }

  const withFactCheck = cases.filter((c) => c.fact_check?.overall_score != null);
  const avgFc = withFactCheck.length
    ? Math.round(withFactCheck.reduce((s, c) => s + (c.fact_check?.overall_score ?? 0), 0) / withFactCheck.length)
    : null;

  return (
    <PageDashboard
      hero={
        <PageHero
          eyebrow="Medical Review"
          title={`${timeOfDayGreeting()}, Michelle`}
          subtitle={
            <>
              {meta.total} {meta.total === 1 ? 'case' : 'cases'} in active clinical review
              {meta.critical_count > 0 && (
                <span className="text-red-300 font-semibold"> · {meta.critical_count} critical (&lt;4h)</span>
              )}
              {' '}· {meta.completed_today} completed today. The AI has already read every chart.
            </>
          }
          actions={
            <div className="flex items-center gap-2">
              <Link
                href="/queue"
                className="inline-flex items-center gap-2 bg-gold text-navy px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gold-light transition-colors shadow-sm"
              >
                Open my worklist
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
              <button
                onClick={() => load()}
                className="text-xs px-3 py-2 rounded-lg border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition"
              >
                Refresh
              </button>
            </div>
          }
        />
      }
    >
      <PageDashboard.Stats>
        <StatCard label="In clinical review" value={meta.total} />
        <StatCard label="Critical (<4h)" value={meta.critical_count} accent={meta.critical_count > 0} />
        <StatCard label="Overdue" value={meta.overdue_count} accent={meta.overdue_count > 0} />
        <StatCard
          label="Avg fact-check score"
          value={avgFc != null ? `${avgFc}/100` : '—'}
          hint={withFactCheck.length ? `${withFactCheck.length} briefs verified` : undefined}
        />
      </PageDashboard.Stats>

      <PageDashboard.Body
        main={
          <div className="card p-5 md:p-6">
            <PageSectionHeading
              hint={<span className="text-xs text-muted">SLA order · AI signal on every row</span>}
            >
              Clinical worklist
            </PageSectionHeading>
            {cases.length === 0 ? (
              <p className="text-sm text-muted py-8 text-center">No cases in active review.</p>
            ) : (
              <ul className="divide-y divide-border">
                {cases.map((c) => {
                  const sla = slaPill(c.turnaround_deadline);
                  const rec = recChip(c.ai_brief?.ai_recommendation?.recommendation);
                  const fc = c.fact_check?.overall_score;
                  return (
                    <li key={c.id} className="py-3 first:pt-0 last:pb-0">
                      <Link
                        href={`/cases/${c.id}`}
                        className="block hover:bg-background -mx-2 px-2 py-2 rounded-lg transition-colors"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-mono text-[11px] text-muted">{c.case_number}</p>
                            <p className="font-semibold text-navy truncate">{c.patient_name ?? '(no name)'}</p>
                            <p className="text-xs text-muted truncate">{c.procedure_description ?? '—'}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 shrink-0 justify-end">
                            {rec && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${rec.tone}`}>
                                {rec.label}
                              </span>
                            )}
                            {fc != null && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${fc >= 85 ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                                FC {fc}
                              </span>
                            )}
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_PILL[c.status] ?? 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                              {STATUS_LABEL[c.status] ?? c.status}
                            </span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${sla.tone}`}>
                              {sla.label}
                            </span>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        }
        aside={
          <div className="space-y-4">
            {/* Brief quality */}
            <div className="card p-5">
              <PageEyebrow>Brief quality</PageEyebrow>
              <p className="font-[family-name:var(--font-display)] text-4xl text-navy mt-2">
                {avgFc != null ? `${avgFc}` : '—'}
                <span className="text-base text-muted">/100</span>
              </p>
              <p className="text-xs text-muted">
                Avg deterministic fact-check across {withFactCheck.length} in-queue {withFactCheck.length === 1 ? 'brief' : 'briefs'}
              </p>
              <ul className="text-xs text-muted mt-3 space-y-1.5">
                <li className="flex justify-between"><span>≥ 85 (release gate)</span><span className="font-semibold text-navy">{withFactCheck.filter((c) => (c.fact_check?.overall_score ?? 0) >= 85).length}</span></li>
                <li className="flex justify-between"><span>Below gate → revised</span><span className="font-semibold text-navy">{withFactCheck.filter((c) => (c.fact_check?.overall_score ?? 0) < 85).length}</span></li>
              </ul>
            </div>

            {/* Live clinical flow — demo simulation only */}
            {demo && flow && (
              <div className="card p-5">
                <div className="flex items-center justify-between gap-2">
                  <PageEyebrow>Clinical flow</PageEyebrow>
                  <span className="text-[9px] uppercase tracking-wide font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                    live simulation
                  </span>
                </div>
                <ul className="text-sm space-y-2 mt-3">
                  {flow.in_flight
                    .filter((s) => ['lpn', 'rn', 'md', 'concierge', 'delivery'].includes(s.stage))
                    .map((s) => (
                      <li key={s.stage} className="flex items-center justify-between gap-3">
                        <span className="text-xs text-muted">{s.label}</span>
                        <span className="font-mono text-sm text-navy">{s.count}</span>
                      </li>
                    ))}
                </ul>
                <p className="text-[11px] text-muted mt-3">
                  {flow.determinations_today.toLocaleString()} determinations today · {flow.on_time_rate_pct}% on-time
                </p>
              </div>
            )}

            {/* The wall */}
            <div className="card p-5">
              <PageEyebrow>How the wall works</PageEyebrow>
              <p className="text-sm text-navy mt-3 leading-relaxed">
                The AI reads, extracts, drafts, and fact-checks.{' '}
                <span className="font-semibold">You decide.</span>
              </p>
              <p className="text-xs text-muted mt-2 leading-relaxed">
                Every determination carries your rationale and a per-case attestation into the audit
                trail — no bulk actions, no auto-decisions, ever. The AI recommendation is evidence,
                not a verdict.
              </p>
            </div>
          </div>
        }
      />
    </PageDashboard>
  );
}
