'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Concierge front-line dashboard.
 *
 * Lives at /concierge. Three columns:
 *   - Me (lines, capacity)
 *   - My clients (TPAs I cover)
 *   - My queue (active cases)
 *
 * Loads /api/concierge/me and /api/concierge/queue in parallel.
 * Demo-mode safe.
 */

interface Profile {
  id: string;
  name: string;
  email: string;
  ringcentral_phone: string | null;
  ringcentral_extension: string | null;
  intake_email: string | null;
  intake_efax: string | null;
  weekly_auth_cap: number;
  delivery_lead_id: string | null;
  active_clients: Array<{ id: string; name: string; contact_email: string | null }>;
  weekly_load: number;
  weekly_cap: number;
  cases_in_queue: number;
  cases_overdue: number;
}

interface QueueCase {
  id: string;
  case_number: string;
  status: string;
  priority: string;
  patient_name: string | null;
  procedure_description: string | null;
  client_name: string | null;
  created_at: string;
  turnaround_deadline: string | null;
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
  intake: 'bg-blue-50 text-blue-800 border-blue-200',
  processing: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  brief_ready: 'bg-teal-50 text-teal-800 border-teal-200',
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

export default function ConciergePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [queue, setQueue] = useState<QueueCase[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [profRes, queueRes] = await Promise.all([
        fetch('/api/concierge/me', { cache: 'no-store' }),
        fetch('/api/concierge/queue', { cache: 'no-store' }),
      ]);
      if (!profRes.ok) {
        if (profRes.status === 401) {
          setError('Sign in required.');
        } else if (profRes.status === 403) {
          setError('Your account is not linked to a concierge record. Contact your Delivery Lead.');
        } else {
          setError(`Could not load profile (${profRes.status}).`);
        }
        return;
      }
      const profData = (await profRes.json()) as Profile;
      setProfile(profData);
      if (queueRes.ok) {
        const q = (await queueRes.json()) as { cases: QueueCase[] };
        setQueue(q.cases ?? []);
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

  if (loading) {
    return (
      <div className="py-10 md:py-16 bg-background min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-muted">Loading concierge view...</div>
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

  const utilPct = Math.min(100, Math.round((profile.weekly_load / Math.max(1, profile.weekly_cap)) * 100));
  const utilTone = utilPct >= 90 ? 'bg-red-500' : utilPct >= 75 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div className="py-10 md:py-16 bg-background min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted font-semibold">Concierge</p>
            <h1 className="text-3xl md:text-4xl font-bold text-navy mt-1">Good morning, {profile.name.split(' ')[0]}</h1>
            <p className="text-sm text-muted mt-2 max-w-2xl">
              {profile.cases_in_queue} active {profile.cases_in_queue === 1 ? 'case' : 'cases'} in your queue
              {profile.cases_overdue > 0 && (<span className="text-red-700 font-semibold"> · {profile.cases_overdue} overdue</span>)}
              {' '}across {profile.active_clients.length} {profile.active_clients.length === 1 ? 'TPA' : 'TPAs'}.
            </p>
          </div>
          <button
            onClick={() => void load()}
            className="bg-white border border-border text-navy px-4 py-2 rounded-lg text-sm font-medium hover:border-navy/40"
          >
            Refresh
          </button>
        </header>

        {/* Stats row */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Weekly load" value={`${profile.weekly_load} / ${profile.weekly_cap}`} sub={`${utilPct}% of cap`} />
          <Stat label="In queue" value={profile.cases_in_queue.toString()} />
          <Stat label="Overdue" value={profile.cases_overdue.toString()} tone={profile.cases_overdue > 0 ? 'warn' : 'ok'} />
          <Stat label="TPAs covered" value={profile.active_clients.length.toString()} />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: my lines + clients */}
          <aside className="space-y-6 lg:col-span-1">
            <section className="bg-surface rounded-xl border border-border shadow-sm p-5">
              <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-3">My lines</h2>
              <ul className="text-sm space-y-2">
                <Line label="Phone" value={profile.ringcentral_phone ?? '—'} mono />
                {profile.ringcentral_extension && <Line label="Ext" value={profile.ringcentral_extension} mono />}
                <Line label="Email" value={profile.intake_email ?? '—'} mono />
                <Line label="eFax" value={profile.intake_efax ?? '—'} mono />
              </ul>
            </section>

            <section className="bg-surface rounded-xl border border-border shadow-sm p-5">
              <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-3">My capacity</h2>
              <p className="text-3xl font-bold text-navy">{utilPct}%</p>
              <p className="text-xs text-muted mb-3">{profile.weekly_load} auths this week of {profile.weekly_cap} cap</p>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full ${utilTone} transition-all`} style={{ width: `${utilPct}%` }} />
              </div>
              {utilPct >= 90 && (
                <p className="text-xs text-red-700 mt-3 font-semibold">Near cap. Flag your DL to redistribute.</p>
              )}
            </section>

            <section className="bg-surface rounded-xl border border-border shadow-sm p-5">
              <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-3">My TPAs</h2>
              {profile.active_clients.length === 0 ? (
                <p className="text-sm text-muted">No clients assigned yet.</p>
              ) : (
                <ul className="space-y-2">
                  {profile.active_clients.map((c) => (
                    <li key={c.id} className="text-sm">
                      <p className="font-semibold text-navy">{c.name}</p>
                      {c.contact_email && <p className="text-xs text-muted font-mono">{c.contact_email}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>

          {/* Right: queue */}
          <section className="lg:col-span-2 bg-surface rounded-xl border border-border shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-navy">My queue</h2>
              <span className="text-xs text-muted">{queue.length} active</span>
            </div>
            {queue.length === 0 ? (
              <p className="text-sm text-muted py-8 text-center">Nothing in your queue. Nice.</p>
            ) : (
              <ul className="divide-y divide-border">
                {queue.map((c) => {
                  const sla = slaPill(c.turnaround_deadline);
                  return (
                    <li key={c.id} className="py-3 first:pt-0 last:pb-0">
                      <Link href={`/cases/${c.id}`} className="block hover:bg-background -mx-2 px-2 py-2 rounded-lg transition-colors">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-mono text-xs text-muted">{c.case_number} · {c.client_name ?? '—'}</p>
                            <p className="font-semibold text-navy truncate">{c.patient_name ?? '(no name)'}</p>
                            <p className="text-xs text-muted truncate">{c.procedure_description ?? '—'}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
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
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn' }) {
  const ringClass = tone === 'warn' ? 'border-red-200 bg-red-50' : 'border-border bg-surface';
  return (
    <div className={`rounded-xl border shadow-sm px-4 py-3 ${ringClass}`}>
      <p className="text-[11px] uppercase tracking-wide text-muted font-semibold">{label}</p>
      <p className={`text-xl font-bold mt-1 ${tone === 'warn' ? 'text-red-800' : 'text-navy'}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

function Line({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted uppercase tracking-wide">{label}</span>
      <span className={`text-sm text-navy ${mono ? 'font-mono' : ''}`}>{value}</span>
    </li>
  );
}
