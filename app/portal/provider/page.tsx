'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface ProviderProfile {
  practice: { id: string; name: string; specialty: string | null; address: string | null; phone: string | null };
  tpa: { id: string; name: string } | null;
  role: 'admin' | 'staff';
  case_counts: { total: number; active: number; this_month: number };
}

interface Case {
  id: string;
  case_number: string;
  status: string;
  priority: string;
  patient_name: string | null;
  procedure_description: string | null;
  created_at: string;
}

/**
 * Provider/physician portal dashboard.
 *
 * Lives at /portal/provider. Scoped to a single practice. Same shape as
 * /portal/tpa but tighter scope: provider sees ONLY their own practice's
 * cases. The TPA they're contracted with is shown for context.
 */
export default function ProviderPortalPage() {
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const profRes = await fetch('/api/provider/me', { cache: 'no-store' });
        if (!profRes.ok) {
          if (profRes.status === 401) setError('Please sign in.');
          else if (profRes.status === 403) {
            const body = await profRes.json().catch(() => ({}));
            setError(body.error ?? 'Your account is not linked to a practice.');
          } else setError(`Could not load (${profRes.status})`);
          return;
        }
        const p = (await profRes.json()) as ProviderProfile;
        setProfile(p);

        const casesRes = await fetch(`/api/cases?practice_id=${p.practice.id}&limit=20`, { cache: 'no-store' });
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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-muted">Loading…</div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="py-10 md:py-16 bg-background min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm">
            {error ?? 'Could not load the provider portal.'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-10 md:py-16 bg-background min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted font-semibold">Provider Portal</p>
            <h1 className="text-3xl md:text-4xl font-bold text-navy mt-1">{profile.practice.name}</h1>
            <p className="text-sm text-muted mt-2">
              {profile.practice.specialty && <>{profile.practice.specialty} · </>}
              {profile.tpa && <>Plan administrator: <span className="font-semibold text-navy">{profile.tpa.name}</span></>}
            </p>
          </div>
          <Link
            href="/portal/provider/submit"
            className="bg-navy text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-navy/90"
          >
            Submit authorization →
          </Link>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Active cases" value={profile.case_counts.active.toString()} />
          <Stat label="This month" value={profile.case_counts.this_month.toString()} />
          <Stat label="All-time" value={profile.case_counts.total.toString()} />
        </section>

        <section className="bg-surface rounded-xl border border-border shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-navy">Recent cases</h2>
            <Link href="/cases" className="text-sm text-navy underline">View all →</Link>
          </div>
          {cases.length === 0 ? (
            <p className="text-sm text-muted py-8 text-center">
              No cases yet.{' '}
              <Link href="/portal/provider/submit" className="text-navy underline">Submit your first authorization →</Link>
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {cases.slice(0, 15).map((c) => (
                <li key={c.id} className="py-3 first:pt-0 last:pb-0">
                  <Link href={`/cases/${c.id}`} className="block hover:bg-background -mx-2 px-2 py-2 rounded-lg">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-muted">{c.case_number}</p>
                        <p className="font-semibold text-navy truncate">{c.patient_name ?? '(no name)'}</p>
                        <p className="text-xs text-muted truncate">{c.procedure_description ?? '—'}</p>
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-blue-50 text-blue-800 border-blue-200">
                        {c.status}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
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
