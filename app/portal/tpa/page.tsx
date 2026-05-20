'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/StatusBadge';
import type { CaseStatus } from '@/lib/types';

/**
 * TPA-facing portal dashboard.
 *
 * Lives at /portal/tpa. The TPA staff sees:
 *   - Their network at a glance (case counts, practice count)
 *   - Hero CTA to submit a new authorization
 *   - List of recent cases (all practices in their network)
 *   - List of practices in their network (link to manage/invite)
 *
 * Different from /portal/provider in scope: TPA sees ALL cases for ALL
 * their practices. Provider portal is scoped to one practice only.
 */

interface TpaProfile {
  tpa: { id: string; name: string };
  practices: Array<{ id: string; name: string; specialty: string | null; estimated_weekly_auths: number; active: boolean }>;
  case_counts: { total: number; active: number; this_month: number };
}

interface Case {
  id: string;
  case_number: string;
  status: CaseStatus | string;
  priority: string;
  patient_name: string | null;
  procedure_description: string | null;
  practice_id: string | null;
  created_at: string;
}

export default function TpaPortalPage() {
  const [profile, setProfile] = useState<TpaProfile | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function loadPortalData(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    try {
      const [profRes, casesRes] = await Promise.all([
        fetch('/api/tpa/me', { cache: 'no-store' }),
        fetch('/api/cases?limit=20', { cache: 'no-store' }),
      ]);
      if (!profRes.ok) {
        if (profRes.status === 401) setError('Please sign in to access the TPA portal.');
        else if (profRes.status === 403) setError('Your account does not have TPA access.');
        else setError(`Could not load portal (${profRes.status}).`);
        return;
      }
      setProfile((await profRes.json()) as TpaProfile);
      if (casesRes.ok) {
        const data = await casesRes.json();
        setCases(Array.isArray(data) ? data : (data.cases ?? []));
      }
      setLastUpdated(new Date());
      setError(null);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  }

  useEffect(() => {
    loadPortalData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-hero-subtle py-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="skeleton skeleton-heading" style={{ width: '40%', background: 'rgba(255,255,255,0.1)' }} />
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card p-5">
                <div className="skeleton skeleton-text" />
                <div className="skeleton skeleton-heading" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-10 md:py-16 bg-background min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm">{error}</div>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Hero header ───────────────────────────────────────── */}
      <div className="bg-hero-subtle text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
          <div className="flex flex-wrap items-end justify-between gap-6 animate-fade-in">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-gold font-semibold">TPA Portal</p>
              <h1 className="font-[family-name:var(--font-display)] text-4xl md:text-5xl text-white mt-2 leading-tight">
                {profile.tpa.name}
              </h1>
              <div className="mt-3 h-[3px] w-16 bg-gold-gradient rounded-full" />
              <p className="text-sm text-white/70 mt-4 max-w-xl">
                {profile.case_counts.active} active {profile.case_counts.active === 1 ? 'case' : 'cases'} across{' '}
                {profile.practices.length} {profile.practices.length === 1 ? 'practice' : 'practices'} in your network.
              </p>
              {lastUpdated && (
                <p className="text-[11px] text-white/40 mt-1">
                  Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadPortalData(true)}
                disabled={refreshing}
                className="text-xs px-3 py-2 rounded-lg border border-white/20 text-white/70 hover:text-white hover:border-white/40 disabled:opacity-50 transition"
                title="Refresh dashboard data"
              >
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-10 space-y-8 pb-16">
        {/* ── Hero CTA card ───────────────────────────────────── */}
        <section className="card card-hover p-6 md:p-8 animate-slide-up">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex-1 min-w-[260px]">
              <p className="text-[11px] uppercase tracking-wide text-gold-dark font-semibold">Submit a new auth</p>
              <h2 className="font-[family-name:var(--font-display)] text-2xl md:text-3xl text-navy mt-1">
                We&apos;ll brief, route, and decide it &mdash; under 10 minutes.
              </h2>
              <p className="text-sm text-muted mt-2 max-w-lg">
                Upload your documentation. Our concierge intakes the request, our AI assembles the clinical brief with
                InterQual / MCG criteria, and a clinician delivers a determination.
              </p>
            </div>
            <Link
              href="/portal/tpa/submit"
              className="btn btn-primary text-base px-6 py-3 shadow-md hover:shadow-lg"
            >
              Submit authorization
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>
        </section>

        {/* ── Stats ───────────────────────────────────────────── */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 stagger-children">
          <Stat label="Active cases" value={profile.case_counts.active.toString()} accent />
          <Stat label="This month" value={profile.case_counts.this_month.toString()} />
          <Stat label="Total all-time" value={profile.case_counts.total.toString()} />
          <Stat label="Practices" value={profile.practices.length.toString()} />
        </section>

        {/* ── My Cases + Network ─────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 card p-5 md:p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-xl text-navy">My Cases</h2>
                <p className="text-xs text-muted mt-0.5">Recent submissions, scoped to your tenant</p>
              </div>
              <Link href="/cases" className="text-xs text-navy hover:text-gold-dark underline underline-offset-2">
                View all →
              </Link>
            </div>
            {cases.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gold/10 mb-3">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#c9a227" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="18" x2="12" y2="12" />
                    <line x1="9" y1="15" x2="15" y2="15" />
                  </svg>
                </div>
                <p className="text-sm text-muted">No cases yet.</p>
                <Link href="/portal/tpa/submit" className="text-sm text-navy font-semibold underline underline-offset-2 hover:text-gold-dark mt-1 inline-block">
                  Submit your first authorization →
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {cases.slice(0, 12).map((c) => (
                  <li key={c.id} className="py-3 first:pt-0 last:pb-0">
                    <Link href={`/cases/${c.id}`} className="block hover:bg-background -mx-2 px-2 py-2 rounded-lg transition-colors">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-[11px] text-muted">{c.case_number}</p>
                          <p className="font-semibold text-navy truncate">{c.patient_name ?? '(no name)'}</p>
                          <p className="text-xs text-muted truncate">{c.procedure_description ?? '—'}</p>
                        </div>
                        <StatusBadge status={c.status as CaseStatus} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside className="card p-5 md:p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xs font-bold text-navy uppercase tracking-[0.14em]">Your network</h2>
              <Link href="/portal/tpa/practices" className="text-xs text-navy hover:text-gold-dark underline underline-offset-2">
                Manage →
              </Link>
            </div>
            {profile.practices.length === 0 ? (
              <p className="text-sm text-muted">
                No practices yet.{' '}
                <Link href="/portal/tpa/practices" className="text-navy font-semibold underline underline-offset-2">
                  Add one →
                </Link>
              </p>
            ) : (
              <ul className="space-y-3">
                {profile.practices.map((p) => (
                  <li key={p.id} className="flex items-start gap-3 group">
                    <div className="mt-1 w-1.5 h-1.5 rounded-full bg-gold flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold text-navy text-sm leading-tight">{p.name}</p>
                      {p.specialty && <p className="text-[11px] text-muted">{p.specialty}</p>}
                      {p.estimated_weekly_auths > 0 && (
                        <p className="text-[11px] text-muted">~{p.estimated_weekly_auths} auths/wk</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
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
