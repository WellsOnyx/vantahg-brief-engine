'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/StatusBadge';
import { SlaTracker } from '@/components/SlaTracker';
import { VerificationScore } from '@/components/FactCheckBadge';
import type { FactCheckResult } from '@/lib/types';

/**
 * Dedicated Concierge Review Queue
 *
 * Lives at /concierge/review.
 * Focused surface for cases where the AI clinical brief is ready for human review/validation
 * by the assigned concierge (status = brief_ready + assigned to this concierge).
 *
 * Philosophy: AI did 95% (extraction + brief). Concierge provides the first human gate with
 * required reasoning before the case routes to LPN/RN/MD clinical determination.
 *
 * Strict tenant scoping inherited from the concierge record + API.
 * Reuses existing patterns (StatusBadge, SlaTracker, concierge layout language).
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
      // Use the enhanced concierge queue endpoint with review_ready filter
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

  const emptyState = (
    <div className="bg-surface rounded-xl border border-border p-12 text-center">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-50 flex items-center justify-center">
        <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 className="font-[family-name:var(--font-dm-serif)] text-xl text-navy mb-2">Review queue is clear</h3>
      <p className="text-sm text-muted max-w-md mx-auto">
        No AI briefs are currently waiting for your human validation. New cases with completed briefs will appear here automatically.
      </p>
      <Link
        href="/concierge"
        className="inline-flex items-center gap-2 mt-6 text-sm font-medium text-navy hover:text-gold transition-colors"
      >
        ← Back to full concierge dashboard
      </Link>
    </div>
  );

  return (
    <div className="py-8 md:py-12 bg-background min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <Link href="/concierge" className="text-sm text-muted hover:text-navy transition-colors">
                ← Concierge
              </Link>
            </div>
            <h1 className="font-[family-name:var(--font-dm-serif)] text-3xl md:text-4xl text-navy mt-1">
              AI Brief Review Queue
            </h1>
            <p className="text-sm text-muted mt-2 max-w-2xl">
              Cases where the AI has generated a clinical brief and is ready for your first human review.
              Validate the brief with required reasoning, then route to clinical determination.
              <span className="font-medium text-navy"> AI handled 95% — your reasoning makes it defensible.</span>
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 bg-white border border-border text-navy px-4 py-2 rounded-lg text-sm font-medium hover:border-navy/40 disabled:opacity-60"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {/* Stats bar (lightweight) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-surface rounded-xl border border-border px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted font-semibold">Waiting for your review</p>
            <p className="text-3xl font-bold text-navy mt-1">{cases.length}</p>
          </div>
          <div className="bg-surface rounded-xl border border-border px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted font-semibold">Focus</p>
            <p className="text-lg font-semibold text-navy mt-1">Brief Ready → Human Validation</p>
          </div>
          <div className="bg-surface rounded-xl border border-border px-4 py-3 hidden sm:block">
            <p className="text-[11px] uppercase tracking-wide text-muted font-semibold">Next step</p>
            <p className="text-sm text-muted mt-1">Capture your validation reasoning → Route to LPN/RN/MD</p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Main content */}
        {loading ? (
          <div className="bg-surface rounded-xl border border-border p-8">
            <div className="animate-pulse space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between border-b border-border pb-4 last:border-0 last:pb-0">
                  <div className="space-y-2">
                    <div className="h-4 w-32 bg-gray-200 rounded" />
                    <div className="h-5 w-48 bg-gray-200 rounded" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-20 bg-gray-200 rounded-full" />
                    <div className="h-6 w-16 bg-gray-200 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : cases.length === 0 ? (
          emptyState
        ) : (
          <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-gray-50/60 text-xs font-semibold text-muted uppercase tracking-wider flex items-center justify-between">
              <span>AI Briefs Ready for Concierge Human Review</span>
              <span>{cases.length} case{cases.length === 1 ? '' : 's'}</span>
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
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm">
                          <Link
                            href={`/cases/${c.id}`}
                            className="font-mono font-semibold text-navy hover:text-gold-dark transition-colors"
                          >
                            {c.case_number}
                          </Link>
                          <span className="text-muted">·</span>
                          <span className="text-muted text-xs">{c.client_name ?? '—'}</span>
                        </div>
                        <div className="font-semibold text-foreground truncate mt-0.5">
                          {c.patient_name || '(no patient name)'}
                        </div>
                        <div className="text-sm text-muted truncate mt-0.5">
                          {c.procedure_description || '—'}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 lg:gap-3 shrink-0">
                        <StatusBadge status={c.status as any} />
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${sla.tone}`}>
                          {sla.label}
                        </span>

                        {/* AI Automation Layer (Track B/C): Quality signal from deterministic fact-check.
                            Helps concierges prioritize which brief_ready cases need their required-reasoning validation first.
                            Does NOT replace the human reasoning gate — still mandatory regardless of score. */}
                        {c.fact_check && (
                          <div className="flex items-center gap-1.5" title={`AI Fact-Check Score: ${c.fact_check.overall_score} (${c.fact_check.overall_status})`}>
                            <VerificationScore score={c.fact_check.overall_score} status={c.fact_check.overall_status} />
                          </div>
                        )}

                        {/* Primary actions — Validate (Phase 2) + full detail */}
                        <div className="flex items-center gap-2 ml-1">
                          <Link
                            href={`/cases/${c.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-navy text-navy hover:bg-navy hover:text-white transition-all"
                          >
                            Open Case
                          </Link>
                          {/* Placeholder for Phase 2 — will become real "Validate Brief" button */}
                          <Link
                            href={`/cases/${c.id}?action=validate`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-navy text-gold hover:bg-navy-light transition-all"
                          >
                            Validate Brief
                            <span className="text-[10px] opacity-75">→</span>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="px-5 py-3 text-[11px] text-muted bg-gray-50/40 border-t border-border">
              These cases have completed AI clinical briefs. Your required reasoning here is the first human quality gate.
              After validation the case routes to clinical review (LPN / RN / MD).
            </div>
          </div>
        )}

        {/* Helpful footer */}
        <div className="text-center text-xs text-muted pt-4">
          Powered by the same concierge queue API with <code>review_ready=true</code> filter • Tenant-scoped • All actions audited
        </div>
      </div>
    </div>
  );
}
