'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/StatusBadge';
import { SlaTracker } from '@/components/SlaTracker';

/**
 * Dedicated Attorney Review Queue for Payer IDR cases.
 *
 * Separate from the clinician Concierge queues.
 * Only shows cases with case_type = 'payer_idr'.
 *
 * Future: Will be restricted to users with the "IDR Attorney" role (Task 4).
 */

interface IdrCase {
  id: string;
  case_number: string;
  status: string;
  priority: string;
  patient_name: string | null;
  procedure_description: string | null;
  payer_name: string | null;
  created_at: string;
  turnaround_deadline: string | null;
}

export default function AttorneyReviewQueuePage() {
  const [cases, setCases] = useState<IdrCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/attorney/queue?case_type=payer_idr', { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 401) {
          setError('Sign in required.');
        } else if (res.status === 403) {
          setError('You do not have access to the Attorney Review Queue.');
        } else {
          setError(`Failed to load queue (${res.status}).`);
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
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-50 flex items-center justify-center">
        <svg className="w-8 h-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 className="font-[family-name:var(--font-dm-serif)] text-xl text-navy mb-2">No IDR cases waiting</h3>
      <p className="text-sm text-muted max-w-md mx-auto">
        When Payer IDR cases are assigned to you, they will appear here for review and determination.
      </p>
    </div>
  );

  return (
    <div className="py-8 md:py-12 bg-background min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <Link href="/portal/tpa" className="text-sm text-muted hover:text-navy transition-colors">
                ← Back to TPA Portal
              </Link>
            </div>
            <h1 className="font-[family-name:var(--font-dm-serif)] text-3xl md:text-4xl text-navy mt-1">
              Attorney Review Queue
            </h1>
            <p className="text-sm text-muted mt-2 max-w-2xl">
              Payer IDR cases assigned for attorney review and determination.
              <span className="font-medium text-navy"> This queue is separate from the clinical Concierge queues.</span>
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

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-surface rounded-xl border border-border px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted font-semibold">IDR Cases Waiting</p>
            <p className="text-3xl font-bold text-navy mt-1">{cases.length}</p>
          </div>
          <div className="bg-surface rounded-xl border border-border px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted font-semibold">Workflow</p>
            <p className="text-lg font-semibold text-navy mt-1">Attorney Review</p>
          </div>
          <div className="bg-surface rounded-xl border border-border px-4 py-3 hidden sm:block">
            <p className="text-[11px] uppercase tracking-wide text-muted font-semibold">Next Step</p>
            <p className="text-sm text-muted mt-1">Review case → Issue determination</p>
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
                <div key={i} className="h-20 bg-gray-100 rounded-lg" />
              ))}
            </div>
          </div>
        ) : cases.length === 0 ? (
          emptyState
        ) : (
          <div className="space-y-3">
            {cases.map((c) => (
              <Link
                key={c.id}
                href={`/cases/${c.id}`}
                className="block bg-surface rounded-xl border border-border p-5 hover:border-navy/30 transition-all group"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-navy">{c.case_number}</span>
                      <StatusBadge status={c.status as any} />
                      <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">Payer IDR</span>
                    </div>
                    <div className="mt-1 text-sm text-foreground">
                      {c.patient_name || '—'} • {c.procedure_description || 'No procedure description'}
                    </div>
                    {c.payer_name && (
                      <div className="text-xs text-muted mt-0.5">Payer: {c.payer_name}</div>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-sm">
                    <SlaTracker 
                      deadline={c.turnaround_deadline || undefined} 
                      createdAt={c.created_at} 
                    />
                    <div className="text-right text-xs text-muted">
                      Submitted<br />
                      {new Date(c.created_at).toLocaleDateString()}
                    </div>
                    <div className="text-navy group-hover:translate-x-0.5 transition">→</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="text-[11px] text-center text-muted pt-4">
          This is a dedicated queue for Payer IDR attorney review. It is separate from all clinical Concierge queues.
        </div>
      </div>
    </div>
  );
}
