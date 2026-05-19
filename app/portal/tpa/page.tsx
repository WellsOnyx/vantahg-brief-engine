'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * TPA-facing portal dashboard.
 *
 * Lives at /portal/tpa. The TPA staff sees:
 *   - Their network at a glance (case counts, practice count)
 *   - Quick action to submit a new authorization
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
  status: string;
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

  useEffect(() => {
    (async () => {
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
      } catch {
        setError('Network error. Try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="py-10 md:py-16 bg-background min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-muted">Loading portal…</div>
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
    <div className="py-10 md:py-16 bg-background min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted font-semibold">TPA Portal</p>
            <h1 className="text-3xl md:text-4xl font-bold text-navy mt-1">{profile.tpa.name}</h1>
            <p className="text-sm text-muted mt-2">
              {profile.case_counts.active} active {profile.case_counts.active === 1 ? 'case' : 'cases'} across {profile.practices.length} {profile.practices.length === 1 ? 'practice' : 'practices'} in your network.
            </p>
          </div>
          <Link
            href="/portal/tpa/submit"
            className="bg-navy text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-navy/90"
          >
            Submit authorization →
          </Link>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Active cases" value={profile.case_counts.active.toString()} />
          <Stat label="This month" value={profile.case_counts.this_month.toString()} />
          <Stat label="Total all-time" value={profile.case_counts.total.toString()} />
          <Stat label="Practices" value={profile.practices.length.toString()} />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 bg-surface rounded-xl border border-border shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-navy">My Cases</h2>
              <Link href="/cases" className="text-sm text-navy underline">View all →</Link>
            </div>
            {cases.length === 0 ? (
              <p className="text-sm text-muted py-8 text-center">
                No cases yet.{' '}
                <Link href="/portal/tpa/submit" className="text-navy underline">Submit your first authorization →</Link>
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {cases.slice(0, 12).map((c) => (
                  <li key={c.id} className="py-3 first:pt-0 last:pb-0">
                    <Link href={`/cases/${c.id}`} className="block hover:bg-background -mx-2 px-2 py-2 rounded-lg">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-xs text-muted">{c.case_number}</p>
                          <p className="font-semibold text-navy truncate">{c.patient_name ?? '(no name)'}</p>
                          <p className="text-xs text-muted truncate">{c.procedure_description ?? '—'}</p>
                        </div>
                        <StatusBadge status={c.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside className="bg-surface rounded-xl border border-border shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Your network</h2>
              <Link href="/portal/tpa/practices" className="text-xs text-navy underline">Manage →</Link>
            </div>
            {profile.practices.length === 0 ? (
              <p className="text-sm text-muted">
                No practices yet.{' '}
                <Link href="/portal/tpa/practices" className="text-navy underline">Add one →</Link>
              </p>
            ) : (
              <ul className="space-y-2">
                {profile.practices.map((p) => (
                  <li key={p.id} className="text-sm">
                    <p className="font-semibold text-navy">{p.name}</p>
                    {p.specialty && <p className="text-xs text-muted">{p.specialty}</p>}
                    {p.estimated_weekly_auths > 0 && (
                      <p className="text-[11px] text-muted">~{p.estimated_weekly_auths} auths/wk</p>
                    )}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface shadow-sm px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-muted font-semibold">{label}</p>
      <p className="text-xl font-bold text-navy mt-1">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    intake: 'bg-gray-100 text-gray-700 border-gray-200',
    processing: 'bg-blue-50 text-blue-700 border-blue-200',
    brief_ready: 'bg-purple-50 text-purple-700 border-purple-200',
    lpn_review: 'bg-amber-50 text-amber-700 border-amber-200',
    rn_review: 'bg-orange-50 text-orange-700 border-orange-200',
    md_review: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    pend_missing_info: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };

  const label = status.replace(/_/g, ' ').toUpperCase();

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${styles[status] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
      {label}
    </span>
  );
}
