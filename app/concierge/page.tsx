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
import { GravityRailChat } from '@/components/GravityRailChat';

/**
 * Concierge front-line dashboard.
 *
 * Lives at /concierge. Surface stack:
 *   - Hero band (greeting + queue summary)
 *   - 4-up stat strip (load / queue / overdue / TPAs covered)
 *   - 8/4 body: queue on the left, capacity + lines + TPAs on the right
 *   - Help footer reinforcing the "AI brief, human gate" value prop
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

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Up late';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function ConciergePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [queue, setQueue] = useState<QueueCase[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
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
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return (
      <PageDashboard
        hero={<PageHero eyebrow="Concierge" title="Loading…" subtitle="Pulling your lines and queue." />}
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

  if (error || !profile) {
    return (
      <PageDashboard
        hero={
          <PageHero
            eyebrow="Concierge"
            title="We hit a snag"
            subtitle={error ?? 'Could not load the concierge view.'}
          />
        }
      >
        <div className="card p-6 text-center">
          <button onClick={() => load(true)} className="btn btn-primary">
            Try again
          </button>
        </div>
      </PageDashboard>
    );
  }

  const firstName = profile.name.split(' ')[0] || profile.name;
  const utilPct = Math.min(100, Math.round((profile.weekly_load / Math.max(1, profile.weekly_cap)) * 100));
  const utilTone = utilPct >= 90 ? 'bg-red-500' : utilPct >= 75 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <PageDashboard
      hero={
        <PageHero
          eyebrow="Concierge"
          title={`${timeOfDayGreeting()}, ${firstName}`}
          subtitle={
            <>
              {profile.cases_in_queue} active {profile.cases_in_queue === 1 ? 'case' : 'cases'} in your queue
              {profile.cases_overdue > 0 && (
                <span className="text-red-300 font-semibold"> · {profile.cases_overdue} overdue</span>
              )}
              {' '}across {profile.active_clients.length}{' '}
              {profile.active_clients.length === 1 ? 'TPA' : 'TPAs'}.
            </>
          }
          actions={
            <div className="flex items-center gap-2">
              <Link
                href="/concierge/review"
                className="inline-flex items-center gap-2 bg-gold text-navy px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gold-light transition-colors shadow-sm"
              >
                Brief review queue
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
              <button
                onClick={() => load(true)}
                disabled={refreshing}
                className="text-xs px-3 py-2 rounded-lg border border-white/20 text-white/70 hover:text-white hover:border-white/40 disabled:opacity-50 transition"
              >
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          }
        />
      }
    >
      {/* ── Stats ────────────────────────────────────────────── */}
      <PageDashboard.Stats>
        <StatCard
          label="Weekly load"
          value={`${profile.weekly_load} / ${profile.weekly_cap}`}
          hint={`${utilPct}% of cap`}
          accent={utilPct >= 75}
        />
        <StatCard label="In queue" value={profile.cases_in_queue} />
        <StatCard
          label="Overdue"
          value={profile.cases_overdue}
          accent={profile.cases_overdue > 0}
        />
        <StatCard label="TPAs covered" value={profile.active_clients.length} />
      </PageDashboard.Stats>

      {/* ── Body: queue + lines/capacity ─────────────────────── */}
      <PageDashboard.Body
        main={
          <div className="card p-5 md:p-6">
            <PageSectionHeading
              hint={<span className="text-xs text-muted">{queue.length} active</span>}
            >
              My queue
            </PageSectionHeading>
            {queue.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 mb-3">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="text-sm text-navy font-semibold">Nothing in your queue.</p>
                <p className="text-xs text-muted mt-1">Nice. Take a breath.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {queue.map((c) => {
                  const sla = slaPill(c.turnaround_deadline);
                  return (
                    <li key={c.id} className="py-3 first:pt-0 last:pb-0">
                      <Link
                        href={`/cases/${c.id}`}
                        className="block hover:bg-background -mx-2 px-2 py-2 rounded-lg transition-colors"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-mono text-[11px] text-muted">
                              {c.case_number}
                              {c.client_name && <span> · {c.client_name}</span>}
                            </p>
                            <p className="font-semibold text-navy truncate">{c.patient_name ?? '(no name)'}</p>
                            <p className="text-xs text-muted truncate">{c.procedure_description ?? '—'}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                                STATUS_PILL[c.status] ?? 'bg-gray-50 text-gray-700 border-gray-200'
                              }`}
                            >
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
            {/* Capacity */}
            <div className="card p-5">
              <PageEyebrow>Capacity</PageEyebrow>
              <p className="font-[family-name:var(--font-display)] text-4xl text-navy mt-2">{utilPct}%</p>
              <p className="text-xs text-muted">
                {profile.weekly_load} of {profile.weekly_cap} auths this week
              </p>
              <div className="h-2 bg-border rounded-full overflow-hidden mt-3">
                <div className={`h-full ${utilTone} transition-all`} style={{ width: `${utilPct}%` }} />
              </div>
              {utilPct >= 90 && (
                <p className="text-xs text-red-700 mt-3 font-semibold">
                  Near cap. Flag your DL to redistribute.
                </p>
              )}
            </div>

            {/* Lines */}
            <div className="card p-5">
              <PageEyebrow>My lines</PageEyebrow>
              <ul className="text-sm space-y-2 mt-3">
                <Line label="Phone" value={profile.ringcentral_phone ?? '—'} mono />
                {profile.ringcentral_extension && (
                  <Line label="Ext" value={profile.ringcentral_extension} mono />
                )}
                <Line label="Email" value={profile.intake_email ?? '—'} mono />
                <Line label="eFax" value={profile.intake_efax ?? '—'} mono />
              </ul>
            </div>

            {/* TPAs */}
            <div className="card p-5">
              <PageEyebrow>My TPAs</PageEyebrow>
              {profile.active_clients.length === 0 ? (
                <p className="text-sm text-muted mt-3">No clients assigned yet.</p>
              ) : (
                <ul className="space-y-3 mt-3">
                  {profile.active_clients.map((c) => (
                    <li key={c.id} className="flex items-start gap-3">
                      <div className="mt-1 w-1.5 h-1.5 rounded-full bg-gold flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-semibold text-navy text-sm leading-tight">{c.name}</p>
                        {c.contact_email && (
                          <p className="text-[11px] text-muted font-mono">{c.contact_email}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        }
      />

      {/* ── Help moment ──────────────────────────────────────── */}
      <PageDashboard.Help>
        <PageEyebrow>How it works on your side</PageEyebrow>
 <h3 className="text-xl text-navy mt-2">
          AI did 95%. Your reasoning is what makes it defensible.
        </h3>
        <p className="text-sm text-muted mt-2 max-w-2xl">
          When a case lands in <span className="font-semibold text-navy">brief_ready</span>, the
          AI has already extracted facts, matched InterQual/MCG criteria, and drafted the brief.
          You validate — capture your reasoning (≥30 chars), flag concerns — and route to LPN/RN/MD.
          Your gate is the one that holds in audit.
        </p>
      </PageDashboard.Help>

      {/* Gravity Rail floating widget for this concierge (AI copilot + intake assist).
          Uses the provisioned workspace for this operator when set.
          Enables efficient handling of high-volume medical review / IRO / IDR cases via chat. */}
      {process.env.NEXT_PUBLIC_GRAVITY_RAIL_WORKSPACE_ID && process.env.NEXT_PUBLIC_GRAVITY_RAIL_SITE_ID && (
        <GravityRailChat
          workspaceId={process.env.NEXT_PUBLIC_GRAVITY_RAIL_WORKSPACE_ID}
          siteId={process.env.NEXT_PUBLIC_GRAVITY_RAIL_SITE_ID}
          workflowSlug={process.env.NEXT_PUBLIC_GRAVITY_RAIL_WORKFLOW_SLUG || 'vantaum-intake-handoff'}
          title="Ask VantaUM Copilot"
          subtitle="Briefs, criteria, handoff for medical review / IRO / IDR"
          buttonText="Chat"
          voice={false}
        />
      )}
    </PageDashboard>
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
