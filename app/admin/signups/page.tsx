'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase-browser';

/**
 * Admin signups review list. Read-only in this PR — action buttons
 * (approve / reject / upload contract) come in subsequent pieces.
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
  pending_review: 'bg-amber-100 text-amber-800 border-amber-200',
  approved: 'bg-blue-100 text-blue-800 border-blue-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  signed: 'bg-teal-100 text-teal-800 border-teal-200',
  live: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

const FILTER_OPTIONS: Array<{ value: Status | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'pending_review', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'signed', label: 'Signed' },
  { value: 'live', label: 'Live' },
  { value: 'rejected', label: 'Rejected' },
];

export default function AdminSignupsPage() {
  const [rows, setRows] = useState<SignupRow[] | null>(null);
  const [filter, setFilter] = useState<Status | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [accessChecked, setAccessChecked] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);

  const load = useCallback(async (status: Status | '') => {
    setError(null);
    try {
      const url = status
        ? `/api/admin/signups?status=${encodeURIComponent(status)}`
        : '/api/admin/signups';
      const res = await fetch(url);
      if (res.status === 403) {
        setHasAccess(false);
        return;
      }
      if (!res.ok) {
        setError(`Failed to load signups (${res.status})`);
        return;
      }
      const data = (await res.json()) as SignupRow[];
      setRows(data);
      setHasAccess(true);
    } catch {
      setError('Failed to load signups');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const browser = createBrowserClient();
      if (!browser) {
        if (!cancelled) {
          setHasAccess(true);
          setAccessChecked(true);
          await load('');
        }
        return;
      }
      const { data: { user } } = await browser.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setHasAccess(false);
          setAccessChecked(true);
        }
        return;
      }
      const { data: profile } = await browser
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      const role = profile?.role ?? 'reviewer';
      const allowed = role === 'admin' || role === 'ceo' || role === 'slt' || role === 'builder';
      if (!cancelled) {
        setHasAccess(allowed);
        setAccessChecked(true);
        if (allowed) await load('');
      }
    }
    init();
    return () => { cancelled = true; };
  }, [load]);

  useEffect(() => {
    if (hasAccess) load(filter);
  }, [filter, hasAccess, load]);

  if (!accessChecked) {
    return <Frame><div className="text-muted">Loading…</div></Frame>;
  }

  if (!hasAccess) {
    return (
      <Frame>
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-10 text-center">
          <h1 className="font-[family-name:var(--font-dm-serif)] text-2xl text-navy mb-2">
            Signup Review
          </h1>
          <p className="text-muted">
            Requires admin / executive / builder role.
          </p>
        </div>
      </Frame>
    );
  }

  const total = rows?.length ?? 0;
  const pendingCount = rows?.filter((r) => r.status === 'pending_review').length ?? 0;

  return (
    <Frame>
      <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-dm-serif)] text-3xl md:text-4xl text-navy">
            Signup Requests
          </h1>
          <p className="text-muted mt-1 text-lg">
            {total === 0 ? 'No submissions yet.' : `${total} submission${total === 1 ? '' : 's'}`}
            {pendingCount > 0 && filter !== 'pending_review' && (
              <span className="ml-2 text-amber-700 font-medium">
                · {pendingCount} pending review
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => load(filter)}
          className="text-sm text-navy hover:text-gold-dark font-medium"
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="underline">Dismiss</button>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value || 'all'}
            onClick={() => setFilter(opt.value)}
            className={
              `px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                filter === opt.value
                  ? 'bg-navy text-white border-navy'
                  : 'bg-white text-navy border-border hover:border-navy/40'
              }`
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* List */}
      <section className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
        {!rows ? (
          <div className="p-6 text-muted text-sm">Loading submissions…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-muted">
            {filter ? `No submissions with status “${STATUS_LABEL[filter as Status]}”.` : 'No signup submissions yet. Prospects can apply at /signup-tpa.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <Th>Company</Th>
                  <Th>Primary Contact</Th>
                  <Th>Volume</Th>
                  <Th>TPA System</Th>
                  <Th>Status</Th>
                  <Th>Submitted</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <Td>
                      <div className="font-medium text-navy">{row.legal_name}</div>
                      {row.dba && <div className="text-[11px] text-muted mt-0.5">dba {row.dba}</div>}
                    </Td>
                    <Td>
                      <div className="font-medium">{row.primary_contact_name}</div>
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
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_PILL[row.status]}`}>
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
                        className="text-sm text-navy hover:text-gold-dark font-medium underline decoration-dotted"
                      >
                        View →
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-10 md:py-16 bg-background min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">{children}</div>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 text-left font-semibold ${className}`}>{children}</th>;
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}
