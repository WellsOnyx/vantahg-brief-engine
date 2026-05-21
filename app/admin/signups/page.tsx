'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';

/**
 * Admin review screen for TPA signup requests (Phase 1 item #5).
 *
 * The default view is the pending review queue. Authorized admins use this
 * to evaluate incoming TPAs before approval and contract generation.
 *
 * Access is enforced server-side on `/api/admin/signups` (requireRole). The
 * page treats the API response as the source of truth: 403 → access denied,
 * 200 → render. We deliberately do NOT duplicate a client-side role check —
 * that was the old Supabase browser-auth path and it breaks under Cognito.
 */

type Status = 'pending_review' | 'approved' | 'rejected' | 'signed' | 'live';

interface SignupRow {
  id: string;
  created_at: string;
  status: Status;
  legal_name: string;
  dba: string | null;
  primary_contact_name: string;
  primary_contact_email: string;
  estimated_members: number | null;
  expected_weekly_auths: number | null;
  existing_tpa_system: string | null;
  client_id: string | null;
}

const STATUS_LABEL: Record<Status, string> = {
  pending_review: 'Pending Review',
  approved: 'Approved',
  rejected: 'Rejected',
  signed: 'Signed',
  live: 'Live',
};

const STATUS_PILL: Record<Status, string> = {
  pending_review: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-blue-50 text-blue-800 border-blue-200',
  rejected: 'bg-red-50 text-red-800 border-red-200',
  signed: 'bg-teal-50 text-teal-800 border-teal-200',
  live: 'bg-emerald-50 text-emerald-800 border-emerald-200',
};

const FILTER_OPTIONS: Array<{ value: Status | ''; label: string }> = [
  { value: 'pending_review', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'signed', label: 'Signed' },
  { value: 'live', label: 'Live' },
  { value: 'rejected', label: 'Rejected' },
  { value: '', label: 'All' },
];

export default function AdminSignupsPage() {
  const [rows, setRows] = useState<SignupRow[] | null>(null);
  const [filter, setFilter] = useState<Status | ''>('pending_review');
  const [error, setError] = useState<string | null>(null);
  const [accessStatus, setAccessStatus] = useState<'unknown' | 'ok' | 'forbidden' | 'unauth'>('unknown');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (status: Status | '') => {
    setError(null);
    try {
      const url = status
        ? `/api/admin/signups?status=${encodeURIComponent(status)}`
        : '/api/admin/signups';
      const res = await fetch(url, { cache: 'no-store' });
      if (res.status === 401) {
        setAccessStatus('unauth');
        return;
      }
      if (res.status === 403) {
        setAccessStatus('forbidden');
        return;
      }
      if (!res.ok) {
        setError(`Failed to load signups (${res.status}).`);
        return;
      }
      const data = (await res.json()) as SignupRow[];
      setRows(data);
      setAccessStatus('ok');
    } catch {
      setError('Network error. Please try again.');
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load(filter);
    setRefreshing(false);
  }

  // ── Access gates ───────────────────────────────────────────
  if (accessStatus === 'unauth') {
    return (
      <Shell>
        <div className="card p-10 text-center max-w-xl mx-auto mt-12">
 <h1 className="text-2xl text-navy">Sign in to continue</h1>
          <p className="text-sm text-muted mt-2">
            The signup review queue requires an admin session.
          </p>
          <Link href="/login?redirect=/admin/signups" className="btn btn-primary mt-6 inline-flex">
            Go to login
          </Link>
        </div>
      </Shell>
    );
  }

  if (accessStatus === 'forbidden') {
    return (
      <Shell>
        <div className="card p-10 text-center max-w-xl mx-auto mt-12">
 <h1 className="text-2xl text-navy">Restricted</h1>
          <p className="text-sm text-muted mt-2">
            This screen is limited to admin, executive, or builder roles. Contact your delivery lead if you believe you should have access.
          </p>
        </div>
      </Shell>
    );
  }

  const total = rows?.length ?? 0;
  const pendingCount = rows?.filter((r) => r.status === 'pending_review').length ?? 0;
  const approvedCount = rows?.filter((r) => r.status === 'approved' || r.status === 'signed' || r.status === 'live').length ?? 0;

  return (
    <Shell>
      {/* ── Hero header ─────────────────────────────────────── */}
      <div className="bg-hero-subtle text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-14">
          <Link href="/" className="text-xs text-white/60 hover:text-gold transition inline-flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Admin
          </Link>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4 animate-fade-in">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-gold font-semibold">TPA Signup Review</p>
              <h1 className="font-[family-name:var(--font-display)] text-4xl md:text-5xl text-white mt-2 leading-tight">
                Approve who comes next.
              </h1>
              <div className="mt-3 h-[3px] w-16 bg-gold-gradient rounded-full" />
              <p className="text-sm text-white/70 mt-4 max-w-2xl">
                Review incoming TPA submissions, generate the contract, and provision access. Every approval flows
                straight into the onboarding pipeline.
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-10 space-y-6 pb-16">
        {/* ── Stat strip ──────────────────────────────────────── */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 stagger-children">
          <Stat label="Pending review" value={pendingCount.toString()} accent />
          <Stat label="Approved / live" value={approvedCount.toString()} />
          <Stat label="Total submissions" value={total.toString()} />
        </section>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="underline text-xs">Dismiss</button>
          </div>
        )}

        {/* Filter pills */}
        <div className="flex flex-wrap items-center gap-2">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value || 'all'}
              onClick={() => setFilter(opt.value)}
              className={
                `px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  filter === opt.value
                    ? 'bg-navy text-white border-navy shadow-sm'
                    : 'bg-surface text-navy border-border hover:border-navy/40'
                }`
              }
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* ── List ─────────────────────────────────────────────── */}
        <section className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-navy/[0.02] text-[11px] font-semibold text-navy uppercase tracking-[0.14em] flex items-center justify-between">
            <span>Submissions</span>
            <span className="text-muted">{total} record{total === 1 ? '' : 's'}</span>
          </div>

          {!rows ? (
            <div className="p-6">
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="skeleton skeleton-heading flex-1" />
                    <div className="skeleton skeleton-badge" />
                  </div>
                ))}
              </div>
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              tone={filter ? 'neutral' : 'gold'}
              title={filter ? `Nothing matching "${STATUS_LABEL[filter as Status]}".` : 'No one is at the door yet.'}
              body={filter
                ? 'Try clearing the filter, or wait for the next state change.'
                : 'Prospects apply at /signup-tpa. New requests appear here in real time, ready for review.'}
              action={filter ? undefined : { label: 'Open the public form', href: '/signup-tpa' }}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-navy/[0.02] text-[10px] uppercase tracking-[0.12em] text-muted">
                  <tr>
                    <Th>Company</Th>
                    <Th>Primary contact</Th>
                    <Th>Volume</Th>
                    <Th>TPA system</Th>
                    <Th>Status</Th>
                    <Th>Submitted</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={`table-row-hover ${row.status === 'pending_review' ? 'bg-amber-50/30' : ''}`}
                    >
                      <Td>
                        <div className="font-semibold text-navy">{row.legal_name}</div>
                        {row.dba && <div className="text-[11px] text-muted mt-0.5">dba {row.dba}</div>}
                      </Td>
                      <Td>
                        <div className="text-sm text-navy">{row.primary_contact_name}</div>
                        <div className="text-[11px] text-muted mt-0.5 font-mono">{row.primary_contact_email}</div>
                      </Td>
                      <Td>
                        <div className="text-xs">
                          {row.estimated_members !== null
                            ? `${row.estimated_members.toLocaleString()} members`
                            : '—'}
                        </div>
                        {row.expected_weekly_auths !== null && (
                          <div className="text-[11px] text-muted mt-0.5">
                            {row.expected_weekly_auths} auths/wk
                          </div>
                        )}
                      </Td>
                      <Td>
                        <div className="text-xs">{row.existing_tpa_system || '—'}</div>
                      </Td>
                      <Td>
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_PILL[row.status]}`}>
                          {STATUS_LABEL[row.status]}
                        </span>
                      </Td>
                      <Td>
                        <div className="text-xs text-muted">
                          {new Date(row.created_at).toLocaleDateString()}
                        </div>
                      </Td>
                      <Td className="text-right">
                        <Link
                          href={`/admin/signups/${row.id}`}
                          className="inline-flex items-center gap-1 text-sm font-semibold text-navy hover:text-gold-dark"
                        >
                          Review
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                          </svg>
                        </Link>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background">{children}</div>;
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`card p-4 ${accent ? 'border-gold/30' : ''}`}>
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold">{label}</p>
      <p className={`font-[family-name:var(--font-display)] text-3xl mt-1 ${accent ? 'text-gold-dark' : 'text-navy'}`}>
        {value}
      </p>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 text-left font-semibold ${className}`}>{children}</th>;
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}
