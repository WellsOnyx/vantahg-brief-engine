'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/StatusBadge';
import { VerificationScore } from '@/components/FactCheckBadge';
import type { CaseStatus, FactCheckResult } from '@/lib/types';

/**
 * Dedicated Concierge Review Queue
 *
 * Lives at /concierge/review.
 * Focused surface for cases where the AI clinical brief is ready for human
 * validation by the assigned concierge (status = brief_ready + assigned to
 * this concierge).
 *
 * Philosophy: AI did 95% (extraction + brief). Concierge provides the first
 * human gate with required reasoning before the case routes to LPN/RN/MD
 * clinical determination.
 *
 * Strict tenant scoping inherited from the concierge record + API.
 */

interface ReviewQueueCase {
  id: string;
  case_number: string;
  status: string;
  priority: string;
  patient_name: string | null;
  procedure_description: string | null;
  client_name: string | null;
  created_at: string;
  turnaround_deadline: string | null;
  fact_check?: FactCheckResult | null;
}

export default function ConciergeReviewQueuePage() {
  const [cases, setCases] = useState<ReviewQueueCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/concierge/queue?review_ready=true', { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 401) {
          setError('Sign in required.');
        } else if (res.status === 403) {
          setError('Your account is not linked to a concierge record. Contact your Delivery Lead.');
        } else {
          setError(`Could not load review queue (${res.status}).`);
        }
        return;
      }
      const data = await res.json();
      setCases(data.cases ?? []);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ── Hero ──────────────────────────────────────────────── */}
      <div className="bg-hero-subtle text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-14">
          <Link href="/concierge" className="text-xs text-white/60 hover:text-gold transition inline-flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Concierge dashboard
          </Link>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4 animate-fade-in">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-gold font-semibold">Brief review queue</p>
              <h1 className="font-[family-name:var(--font-display)] text-4xl md:text-5xl text-white mt-2 leading-tight">
                AI brief, human gate.
              </h1>
              <div className="mt-3 h-[3px] w-16 bg-gold-gradient rounded-full" />
              <p className="text-sm text-white/70 mt-4 max-w-2xl">
                The AI handled the heavy lifting — extraction, criteria matching, brief drafting.
                <span className="text-white"> Your reasoning is what makes it defensible.</span>
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="text-xs px-3 py-2 rounded-lg border border-white/20 text-white/70 hover:text-white hover:border-white/40 disabled:opacity-50 transition"
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-10 space-y-6 pb-16">
        {/* ── Stat strip ──────────────────────────────────────── */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 stagger-children">
          <div className="card p-5 border-gold/30">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold">Waiting on you</p>
            <p className="font-[family-name:var(--font-display)] text-4xl text-gold-dark mt-1">{cases.length}</p>
            <p className="text-[11px] text-muted mt-1">briefs ready for human validation</p>
          </div>
          <div className="card p-5">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold">Focus mode</p>
            <p className="text-sm font-semibold text-navy mt-2">Brief ready → Human validation</p>
            <p className="text-[11px] text-muted mt-1">≥30 char reasoning required to advance</p>
          </div>
          <div className="card p-5">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold">Next step</p>
            <p className="text-sm font-semibold text-navy mt-2">Route to LPN / RN / MD</p>
            <p className="text-[11px] text-muted mt-1">Validation reasoning carries forward</p>
          </div>
        </section>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="card p-8">
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between border-b border-border pb-4 last:border-0 last:pb-0">
                  <div className="space-y-2 flex-1">
                    <div className="skeleton skeleton-text" style={{ width: '30%' }} />
                    <div className="skeleton skeleton-heading" style={{ width: '60%' }} />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="skeleton skeleton-badge" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : cases.length === 0 ? (
          <div className="card p-12 text-center animate-fade-in">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-50 flex items-center justify-center">
              <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
 <h3 className="text-2xl text-navy">Queue is clear</h3>
            <p className="text-sm text-muted max-w-md mx-auto mt-2">
              No AI briefs are currently waiting for your human validation. New cases with completed briefs will appear here automatically.
            </p>
            <Link
              href="/concierge"
              className="inline-flex items-center gap-2 mt-6 text-sm font-medium text-navy hover:text-gold-dark transition-colors"
            >
              ← Back to concierge dashboard
            </Link>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-navy/[0.02] text-[11px] font-semibold text-navy uppercase tracking-[0.14em] flex items-center justify-between">
              <span>AI briefs ready for concierge validation</span>
              <span className="text-muted">{cases.length} case{cases.length === 1 ? '' : 's'}</span>
            </div>

            <ul className="divide-y divide-border">
              {cases.map((c) => {
                const sla = c.turnaround_deadline
                  ? (() => {
                      const ms = new Date(c.turnaround_deadline).getTime() - Date.now();
                      if (ms < 0) return { label: 'OVERDUE', tone: 'bg-red-50 text-red-800 border-red-200' };
                      const hours = ms / 3_600_000;
                      if (hours < 4) return { label: `${hours.toFixed(1)}h left`, tone: 'bg-red-50 text-red-800 border-red-200' };
                      if (hours < 24) return { label: `${Math.round(hours)}h left`, tone: 'bg-amber-50 text-amber-800 border-amber-200' };
                      return { label: `${Math.round(hours)}h left`, tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
                    })()
                  : { label: 'No SLA', tone: 'bg-gray-50 text-gray-700 border-gray-200' };

                return (
                  <li key={c.id} className="px-5 py-4 hover:bg-gold/[0.03] transition-colors group">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm">
                          <Link
                            href={`/cases/${c.id}`}
                            className="font-mono text-[11px] font-semibold text-muted hover:text-gold-dark transition-colors"
                          >
                            {c.case_number}
                          </Link>
                          {c.client_name && (
                            <>
                              <span className="text-muted">·</span>
                              <span className="text-muted text-xs">{c.client_name}</span>
                            </>
                          )}
                        </div>
                        <p className="font-semibold text-navy truncate mt-0.5">
                          {c.patient_name || '(no patient name)'}
                        </p>
                        <p className="text-sm text-muted truncate mt-0.5">
                          {c.procedure_description || '—'}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 lg:gap-3 shrink-0">
                        <StatusBadge status={c.status as CaseStatus} />
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${sla.tone}`}>
                          {sla.label}
                        </span>

                        {c.fact_check && (
                          <div className="flex items-center gap-1.5" title={`AI Fact-Check Score: ${c.fact_check.overall_score} (${c.fact_check.overall_status})`}>
                            <VerificationScore score={c.fact_check.overall_score} status={c.fact_check.overall_status} />
                          </div>
                        )}

                        <div className="flex items-center gap-2 ml-1">
                          <Link
                            href={`/cases/${c.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border text-navy hover:border-navy/40 hover:bg-background transition-all"
                          >
                            Open
                          </Link>
                          <Link
                            href={`/cases/${c.id}?action=validate`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-navy text-gold hover:bg-navy-light transition-all shadow-sm"
                          >
                            Validate brief
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                            </svg>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="px-5 py-3 text-[11px] text-muted bg-navy/[0.02] border-t border-border">
              These cases have completed AI briefs. Your reasoning here is the first human quality gate. After validation the case routes to clinical review (LPN / RN / MD).
            </div>
          </div>
        )}

        <div className="text-center text-[11px] text-muted pt-4">
          Powered by the concierge queue API · Tenant-scoped · All actions audited
        </div>
      </div>
    </div>
  );
}
